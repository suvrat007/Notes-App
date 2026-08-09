/**
 * In-memory app state. Dexie remains the source of truth: every action
 * writes through the query layer, then reloads the slices it touched.
 * Star maths is delegated entirely to `engine/`.
 */
import { create } from 'zustand';
import type { Habit, LogEntry, AppState, Task, Reward } from '../db/schema';
import { db } from '../db/schema';
import { ensureAppState } from '../db/init';
import { sweepMissedTasks } from '../db/sweep';
import * as q from '../db/queries';
import {
  goodHabitDelta,
  badHabitRepDelta,
  taskDelta,
  weeklyBalance,
  weeklyBalanceFloored,
  dayNet,
  repsOn,
  repsInDates,
  redeemDelta,
} from '../engine/stars';
import {
  buildRewardViews,
  runningBalances,
  type RewardView,
} from '../engine/rewards';
import { buildRecurringRows, type VirtualTaskRow } from '../engine/recurring';
import {
  suggestDailyTarget,
  recentDailyAverage,
  buildRoadmap,
  projectedWeekFinish,
  type RoadmapNode,
} from '../engine/targets';
import { todayStr, mondayOf, weekDates, addDays, daysBetween } from '../lib/dates';

/** How far back the adaptive target looks when averaging recent days. */
const LOOKBACK_DAYS = 14;

type ForgeState = {
  ready: boolean;
  today: string;
  habits: Habit[];
  todayLogs: LogEntry[];
  weekLogs: LogEntry[];
  todayTasks: Task[];
  appState: AppState | null;
  /** Accepted target for today, or null until the user confirms the banner. */
  dailyTarget: number | null;
  /** Engine's suggestion for today; drives the banner and the ring fallback. */
  suggestedTarget: number;
  /** Logs over the lookback window, for the recent-average calculation. */
  recentLogs: LogEntry[];
  rewards: Reward[];

  loadToday: () => Promise<void>;
  logHabitRep: (habitId: string) => Promise<number | null>;
  undoHabitRep: (habitId: string) => Promise<void>;
  createHabit: (input: q.NewHabit) => Promise<void>;
  archiveHabit: (id: string) => Promise<void>;

  createTask: (input: q.NewTask) => Promise<void>;
  completeTask: (taskId: string) => Promise<void>;
  uncompleteTask: (taskId: string) => Promise<void>;
  removeTask: (taskId: string) => Promise<void>;

  acceptDailyTarget: (value: number) => Promise<void>;

  createReward: (name: string, cost: number) => Promise<void>;
  removeReward: (id: string) => Promise<void>;
  redeemReward: (rewardId: string) => Promise<void>;

  // Derived selectors (read-only helpers over current slices).
  repsToday: (habitId: string) => number;
  repsThisWeek: (habitId: string) => number;
  weekBalance: () => number;
  todayNet: () => number;
  effectiveTarget: () => number;
  recurringRows: () => VirtualTaskRow[];
  roadmap: () => RoadmapNode[];
  weekProjection: () => number;
  rewardViews: () => RewardView[];
};

export const useForge = create<ForgeState>((set, get) => ({
  ready: false,
  today: todayStr(),
  habits: [],
  todayLogs: [],
  weekLogs: [],
  todayTasks: [],
  appState: null,
  dailyTarget: null,
  suggestedTarget: 0,
  recentLogs: [],
  rewards: [],

  async loadToday() {
    await db.open();
    const appState = await ensureAppState();
    // Charge for anything missed while the app was closed, before we read logs.
    await sweepMissedTasks();

    const today = todayStr();
    const monday = mondayOf(today);
    const [habits, weekLogs, todayTasks, recentLogs, targetRow, rewards] = await Promise.all([
      q.listActiveHabits(),
      q.listLogsInRange(monday, weekDates(monday)[6]),
      q.listTasksForDate(today),
      q.listLogsInRange(addDays(today, -LOOKBACK_DAYS), addDays(today, -1)),
      q.getDailyTarget(today),
      q.listRewards(),
    ]);

    const floor = appState.settings.negativeFloor;

    // Average only over days the user has actually been using the app, so a
    // fresh install isn't dragged toward a target of zero by empty history.
    const historyDates = recentLogs.length
      ? (() => {
          const first = recentLogs
            .map((l) => l.date)
            .sort((a, b) => a.localeCompare(b))[0];
          const span = Math.max(1, daysBetween(first, today));
          return Array.from({ length: span }, (_, i) => addDays(first, i));
        })()
      : [];
    const recentAvg = recentDailyAverage(
      historyDates.map((d) => dayNet(recentLogs, d, { floor })),
    );

    const tasksDueToday = todayTasks.filter((t) => !t.done).reduce((s, t) => s + t.stars, 0);
    const weekDaysList = weekDates(monday);
    const daysElapsed = daysBetween(monday, today) + 1;
    const daysLeftInWeek = 7 - daysElapsed + 1;

    const repsWeek = (habitId: string) => repsInDates(weekLogs, habitId, weekDaysList);

    const suggestedTarget = suggestDailyTarget({
      tasksDueToday,
      activeGoodHabits: habits
        .filter((h) => h.polarity === 'good' && h.weeklyTarget > 0)
        .map((h) => ({ habit: h, repsThisWeek: repsWeek(h.id) })),
      recentDailyAvg: recentAvg,
      daysLeftInWeek,
    });

    set({
      ready: true,
      today,
      habits,
      weekLogs,
      todayLogs: weekLogs.filter((l) => l.date === today),
      todayTasks: todayTasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      recentLogs,
      appState,
      rewards,
      dailyTarget: targetRow?.value ?? null,
      suggestedTarget,
    });
  },

  async acceptDailyTarget(value) {
    const { today } = get();
    await q.setDailyTarget(today, Math.max(0, Math.round(value)));
    await get().loadToday();
  },

  /** Log one rep. Returns the delta applied, or null if the habit is gone. */
  async logHabitRep(habitId) {
    const { habits, today, weekLogs } = get();
    const habit = habits.find((h) => h.id === habitId);
    if (!habit) return null;

    let delta: number;
    if (habit.polarity === 'good') {
      delta = goodHabitDelta(habit);
    } else {
      // The rep index decides where on the allowance ladder this rep lands.
      const already = repsOn(weekLogs, habitId, today);
      delta = badHabitRepDelta(habit, already);
    }

    await q.addLog({ date: today, kind: 'habit', refId: habitId, count: 1, starsDelta: delta });
    if (delta > 0) await q.addLifetimeStars(delta);

    await get().loadToday();
    return delta;
  },

  async undoHabitRep(habitId) {
    const { today } = get();
    const removed = await q.undoLastLogFor(habitId, today);
    // Reversing an earn must also walk lifetime back, or rank inflates.
    if (removed && removed.starsDelta > 0) await q.subtractLifetimeStars(removed.starsDelta);
    await get().loadToday();
  },

  async createHabit(input) {
    await q.addHabit(input);
    await get().loadToday();
  },

  async archiveHabit(id) {
    await q.archiveHabit(id);
    await get().loadToday();
  },

  /* ---------------- Rewards ---------------- */

  async createReward(name, cost) {
    await q.addReward(name, cost);
    await get().loadToday();
  },

  async removeReward(id) {
    await q.archiveReward(id);
    await get().loadToday();
  },

  /** Spends weekly Balance only. Lifetime and therefore Rank are untouched. */
  async redeemReward(rewardId) {
    const { rewards, today } = get();
    const reward = rewards.find((r) => r.id === rewardId);
    if (!reward) return;

    await q.addLog({
      date: today,
      kind: 'redeem',
      refId: rewardId,
      count: 1,
      starsDelta: redeemDelta(reward),
    });
    // Deliberately NO addLifetimeStars call — spending never moves rank.
    await get().loadToday();
  },

  /* ---------------- Tasks ---------------- */

  async createTask(input) {
    await q.addTask(input);
    await get().loadToday();
  },

  async completeTask(taskId) {
    const { todayTasks, today } = get();
    const task = todayTasks.find((t) => t.id === taskId);
    if (!task || task.done) return; // already earned; never pay twice

    const delta = taskDelta(task);
    await q.toggleTaskDone(taskId, true);
    await q.addLog({ date: today, kind: 'task', refId: taskId, count: 1, starsDelta: delta });
    await q.addLifetimeStars(delta);

    // A task linked to a habit also counts as a rep of that habit.
    if (task.linkedHabitId) await get().logHabitRep(task.linkedHabitId);

    await get().loadToday();
  },

  async uncompleteTask(taskId) {
    const { todayTasks, today } = get();
    const task = todayTasks.find((t) => t.id === taskId);
    if (!task || !task.done) return;

    await q.toggleTaskDone(taskId, false);
    const removed = await q.undoLastLogFor(taskId, today);
    if (removed && removed.starsDelta > 0) await q.subtractLifetimeStars(removed.starsDelta);

    if (task.linkedHabitId) await get().undoHabitRep(task.linkedHabitId);

    await get().loadToday();
  },

  async removeTask(taskId) {
    await q.deleteTask(taskId);
    await get().loadToday();
  },

  repsToday(habitId) {
    const { todayLogs, today } = get();
    return repsOn(todayLogs, habitId, today);
  },

  weekBalance() {
    const { weekLogs, appState } = get();
    if (!appState) return weeklyBalance(weekLogs);
    return weeklyBalanceFloored(weekLogs, weekDates(appState.weekStartDate), {
      floor: appState.settings.negativeFloor,
    });
  },

  todayNet() {
    const { todayLogs, today, appState } = get();
    return dayNet(todayLogs, today, { floor: appState?.settings.negativeFloor });
  },

  repsThisWeek(habitId) {
    const { weekLogs, appState } = get();
    if (!appState) return 0;
    return repsInDates(weekLogs, habitId, weekDates(appState.weekStartDate));
  },

  effectiveTarget() {
    const { dailyTarget, suggestedTarget } = get();
    // Until the user accepts today's banner, the ring tracks the suggestion.
    return dailyTarget ?? suggestedTarget;
  },

  recurringRows() {
    const { habits, today } = get();
    return buildRecurringRows(habits, today, (id) => get().repsToday(id));
  },

  roadmap() {
    return buildRoadmap(get().habits, (id) => get().repsThisWeek(id));
  },

  rewardViews() {
    const { rewards, appState, weekLogs } = get();
    if (!appState) return [];
    const floor = appState.settings.negativeFloor;
    const dates = weekDates(appState.weekStartDate).filter((d) => d <= get().today);
    return buildRewardViews(
      rewards,
      get().weekBalance(),
      runningBalances(weekLogs, dates, { floor }),
    );
  },

  weekProjection() {
    const { appState, today } = get();
    if (!appState) return 0;
    const daysElapsed = daysBetween(appState.weekStartDate, today) + 1;
    return projectedWeekFinish(get().weekBalance(), daysElapsed);
  },
}));
