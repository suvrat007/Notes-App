/**
 * In-memory app state. Dexie remains the source of truth: every action
 * writes through the query layer, then reloads the slices it touched.
 * Star maths is delegated entirely to `engine/`.
 */
import { create } from 'zustand';
import type { Habit, LogEntry, AppState, Task, Reward, TaskHorizon } from '../db/schema';
import { db } from '../db/schema';
import { ensureAppState } from '../db/init';
import { sweepMissedTasks } from '../db/sweep';
import { syncTask } from '../db/sync';
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
import type { ParsedItem } from '../engine/parseVoice';
import { applyMove, type Command } from '../lib/intent/commands';
import {
  suggestDailyTarget,
  recentDailyAverage,
  buildRoadmap,
  projectedWeekFinish,
  type RoadmapNode,
} from '../engine/targets';
import {
  periodWindow, daysLeftInPeriod, periodElapsedFraction, periodDates,
  type PeriodWindow,
} from '../engine/period';
import { toast } from './useToast';
import { todayStr, weekStartOf, weekDates, addDays, daysBetween, localDateOf } from '../lib/dates';

/** How far back the adaptive target looks when averaging recent days. */
const LOOKBACK_DAYS = 14;
/** Log window loaded on startup — must cover the longest goal period. */
const HISTORY_DAYS = 380;

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
  /** Wide log window covering the longest goal period. */
  historyLogs: LogEntry[];
  rewards: Reward[];

  loadToday: () => Promise<void>;
  logHabitRep: (habitId: string) => Promise<number | null>;
  undoHabitRep: (habitId: string) => Promise<void>;
  createHabit: (input: q.NewHabit) => Promise<void>;
  archiveHabit: (id: string) => Promise<void>;
  reorderHabits: (idsInOrder: string[]) => Promise<void>;
  reorderTasks: (idsInOrder: string[]) => Promise<void>;
  renameHabit: (id: string, name: string) => Promise<void>;
  updateHabitFields: (id: string, patch: Partial<Habit>) => Promise<void>;
  /** All tasks due today or later — the Manage screen's working set. */
  upcomingTasks: Task[];

  createTask: (input: q.NewTask) => Promise<void>;
  completeTask: (taskId: string) => Promise<void>;
  uncompleteTask: (taskId: string) => Promise<void>;
  removeTask: (taskId: string) => Promise<void>;
  /** Multi-unit tasks: tick one unit off / put one back. */
  advanceTask: (taskId: string) => Promise<void>;
  regressTask: (taskId: string) => Promise<void>;
  setTaskHorizon: (taskId: string, horizon: TaskHorizon) => Promise<void>;
  stopRepeating: (taskId: string) => Promise<number>;
  duplicateAcrossWeek: (taskId: string) => Promise<number>;
  convertTaskToHabit: (taskId: string) => Promise<void>;
  convertHabitToTask: (habitId: string) => Promise<void>;

  acceptDailyTarget: (value: number) => Promise<void>;

  commitVoiceItems: (items: ParsedItem[]) => Promise<void>;
  /** Execute confirmed voice COMMANDS. Returns a per-command result. */
  applyCommands: (cmds: Command[]) => Promise<{ done: number; failed: number; navigateTo: string | null }>;
  updateSettings: (patch: Partial<AppState['settings']>) => Promise<void>;

  createReward: (name: string, cost: number) => Promise<void>;
  removeReward: (id: string) => Promise<void>;
  redeemReward: (rewardId: string) => Promise<void>;

  // Derived selectors (read-only helpers over current slices).
  repsToday: (habitId: string) => number;
  repsThisWeek: (habitId: string) => number;
  /** Reps inside the habit's own current goal period. */
  repsThisPeriod: (habitId: string) => number;
  periodFor: (habitId: string) => PeriodWindow | null;
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
  historyLogs: [],
  upcomingTasks: [],
  rewards: [],

  async loadToday() {
    await db.open();
    const appState = await ensureAppState();
    // Charge for anything missed while the app was closed, before we read logs.
    // Top up repeating series before reading, so a weekly task never runs dry.
    // Top up repeating series before reading, so a weekly task never runs dry.
    await q.generateAllSeries();
    const missed = await sweepMissedTasks();
    if (missed > 0) {
      // Stars vanish here while the app was closed — say so, or it looks like a bug.
      toast.error(
        missed + ' overdue task' + (missed === 1 ? '' : 's') + ' expired since you were last here.',
      );
    }

    const today = todayStr();
    // The week window follows the user's configured reset day.
    const monday = weekStartOf(today, appState.settings.weekResetDay);
    // Goal periods can span months, so read one wide window and slice it
    // rather than issuing a query per horizon.
    const [habits, historyLogs, todayTasks, upcomingTasks, targetRow, rewards] = await Promise.all([
      q.listActiveHabits(),
      q.listLogsInRange(addDays(today, -HISTORY_DAYS), today),
      q.listTasksForDate(today),
      q.listUpcomingTasks(today),
      q.getDailyTarget(today),
      q.listRewards(),
    ]);

    const weekEnd = weekDates(monday)[6];
    const weekLogs = historyLogs.filter((l) => l.date >= monday && l.date <= weekEnd);
    const recentLogs = historyLogs.filter(
      (l) => l.date >= addDays(today, -LOOKBACK_DAYS) && l.date <= addDays(today, -1),
    );

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
    const weekStartDay = appState.settings.weekResetDay;

    const suggestedTarget = suggestDailyTarget({
      tasksDueToday,
      activeGoodHabits: habits
        .filter((h) => h.polarity === 'good' && h.targetReps > 0)
        .map((h) => {
          const w = periodWindow(today, localDateOf(h.createdAt),
                                 h.targetPeriodWeeks, weekStartDay);
          return {
            habit: h,
            repsThisPeriod: repsInDates(historyLogs, h.id, periodDates(w)),
            daysLeftInPeriod: daysLeftInPeriod(today, w),
          };
        }),
      recentDailyAvg: recentAvg,
    });

    set({
      ready: true,
      today,
      habits,
      weekLogs,
      todayLogs: historyLogs.filter((l) => l.date === today),
      // Already sorted by manual order in the query — re-sorting by createdAt
      // here would silently undo every drag the user made.
      todayTasks,
      upcomingTasks,
      recentLogs,
      historyLogs,
      appState,
      rewards,
      dailyTarget: targetRow?.value ?? null,
      suggestedTarget,
    });
  },

  /**
   * Execute confirmed commands.
   *
   * Each one is applied against freshly-read state rather than a snapshot,
   * because two moves in a single batch ("gym to the top, read to the bottom")
   * must compose — the second has to see the order the first produced.
   */
  async applyCommands(cmds) {
    let done = 0;
    let failed = 0;
    let navigateTo: string | null = null;

    for (const c of cmds) {
      try {
        switch (c.kind) {
          case 'navigate':
            navigateTo = c.screen ?? null;
            break;

          case 'setting':
            if (c.settingKey) {
              await get().updateSettings({ [c.settingKey]: c.settingValue });
            }
            break;

          case 'archive':
            if (c.refId) await get().archiveHabit(c.refId);
            break;

          case 'delete':
            if (c.refId) await get().removeTask(c.refId);
            break;

          case 'rename':
            if (c.refId && c.newName) await get().renameHabit(c.refId, c.newName);
            break;

          case 'retarget':
            if (c.refId) {
              await get().updateHabitFields(c.refId, {
                targetReps: c.targetReps ?? 0,
                targetPeriodWeeks: c.targetPeriodWeeks ?? 1,
              });
            }
            break;

          case 'create':
            if (c.targetType === 'task') {
              // Via the store action, not q.addTask: that is what queues the
              // task for Google. A voice-created task must reach the calendar
              // exactly like one typed into the modal.
              await get().createTask({
                name: c.createName!,
                dueDate: c.dueDate ?? get().today,
              });
            } else {
              await q.addHabit({
                name: c.createName!,
                polarity: c.polarity ?? 'good',
                isRecurringTask: c.isRecurringTask ?? false,
              });
            }
            break;

          /*
           * Convert reclassifies a row by creating its counterpart and retiring
           * the original. Habits are ARCHIVED rather than deleted so their
           * ledger history survives the change; tasks carry no such history.
           */
          case 'convert': {
            if (!c.refId) break;
            if (c.targetType === 'habit') {
              const t = get().upcomingTasks.find((x) => x.id === c.refId);
              if (!t) break;
              await q.addHabit({ name: t.name, polarity: 'good' });
              // Store action, so the task's Google event is deleted too —
              // q.deleteTask would strand it on the calendar forever.
              await get().removeTask(t.id);
            } else {
              const h = get().habits.find((x) => x.id === c.refId);
              if (!h) break;
              await get().createTask({ name: h.name, dueDate: c.dueDate ?? get().today });
              await q.archiveHabit(h.id);
            }
            break;
          }

          case 'move': {
            if (!c.refId) break;
            const isHabit = get().habits.some((h) => h.id === c.refId);
            const ids = isHabit
              ? get().habits.map((h) => h.id)
              : get().upcomingTasks.map((t) => t.id);
            const next = applyMove(ids, c.refId, c.to, c.relativeToId);
            if (isHabit) await get().reorderHabits(next);
            else await get().reorderTasks(next);
            break;
          }
        }
        done++;
      } catch (e) {
        failed++;
        console.error('[command] failed:', c.label, e);
      }
    }

    await get().loadToday();
    return { done, failed, navigateTo };
  },

  async updateSettings(patch) {
    const { appState } = get();
    if (!appState) return;
    await db.appState.update('singleton', {
      settings: { ...appState.settings, ...patch },
    });
    await get().loadToday();
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

  /**
   * Persist a manual habit order.
   *
   * The caller passes the FULL list it was showing, not just the moved row —
   * the Manage screen splits habits into Build and Break sections, so an order
   * derived from one section alone would renumber the other to zero.
   */
  async reorderHabits(idsInOrder) {
    await q.reorderHabits(idsInOrder);
    await get().loadToday();
  },

  async reorderTasks(idsInOrder) {
    await q.reorderTasks(idsInOrder);
    await get().loadToday();
  },

  async renameHabit(id, name) {
    const clean = name.trim();
    if (!clean) return;
    await q.updateHabit(id, { name: clean });
    await get().loadToday();
  },

  async updateHabitFields(id, patch) {
    await q.updateHabit(id, patch);
    await get().loadToday();
  },

  async archiveHabit(id) {
    await q.archiveHabit(id);
    await get().loadToday();
  },

  /* ---------------- Voice ---------------- */

  /**
   * Commit a whole parsed batch at once. Called only after the user's explicit
   * OK — nothing here runs during parsing or preview.
   */
  async commitVoiceItems(items) {
    for (const it of items) {
      const reps = Math.max(1, it.count ?? 1);

      if (it.kind === 'new-habit') {
        // The habit did not exist, so create it. Only log a rep if they said
        // they had already done it — declaring an intention is not a rep.
        const created = await q.addHabit({
          name: it.text,
          polarity: it.polarity ?? 'good',
          // The preview requires an answer for bad habits, so a null here can
          // only come from a good one, where allowance is meaningless.
          dailyAllowance: it.polarity === 'bad' ? (it.dailyAllowance ?? 0) : 0,
          // "five runs a week" / "twelve this month" — captured as a real goal.
          targetReps: it.polarity === 'bad' ? 0 : (it.targetReps ?? 0),
          targetPeriodWeeks: it.targetPeriodWeeks ?? 1,
        });
        if (it.doneToday && it.polarity !== 'bad') {
          await q.addLog({
            date: get().today,
            kind: 'habit',
            refId: created.id,
            count: 1,
            starsDelta: goodHabitDelta(created),
          });
          await q.addLifetimeStars(goodHabitDelta(created));
        }
      } else if (it.kind === 'task') {
        const task = await q.addTask({
          name: it.text,
          dueDate: it.dueDate ?? get().today,
          dueTime: it.dueTime ?? null,
          // "finish three videos" -> three units before it counts as done.
          targetCount: Math.max(1, it.count ?? 1),
        });

        /*
         * "Every Monday" has to become a real series, not just a label.
         * setTaskHorizon assigns the seriesId and materialises the future
         * occurrences; storing the horizon alone would leave a task that
         * claims to repeat but never appears again.
         */
        if (it.horizon && it.horizon !== 'once') {
          await q.setTaskHorizon(task.id, it.horizon);
        }

        /*
         * Push to exactly the Google destinations the user confirmed for THIS
         * item, not the global toggles: a meeting belongs on the calendar and
         * an errand on the task list, and one setting cannot say both.
         */
        if (it.syncTargets && it.syncTargets.length > 0) {
          await syncTask(task.id, 'upsert', it.syncTargets);
        }
      } else if (it.kind === 'habit') {
        if (it.refId) {
          for (let i = 0; i < reps; i++) await get().logHabitRep(it.refId);
        }
      } else if (it.kind === 'bad-habit') {
        // "No TV" means it did NOT happen. Logging a rep here would penalise
        // the user for the very thing they successfully avoided.
        if (it.refId && !it.avoided) {
          for (let i = 0; i < reps; i++) await get().logHabitRep(it.refId);
        }
      } else if (it.kind === 'redeem') {
        if (it.refId) await get().redeemReward(it.refId);
      }
    }
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
    toast.success(`Redeemed ${reward.name} for ${reward.cost} ★. Enjoy it.`);
  },

  /* ---------------- Tasks ---------------- */

  async createTask(input) {
    const task = await q.addTask(input);
    await syncTask(task.id, 'upsert');
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

    await syncTask(taskId, 'upsert');
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

    await syncTask(taskId, 'upsert');
    await get().loadToday();
  },

  /**
   * Advance a multi-unit task by one unit ("1 of 3 videos done").
   *
   * Stars are awarded only on the FINAL unit — the task's reward is for
   * finishing it, and paying out per unit would let a half-done task earn.
   * Partial progress is recorded on the row, not in the ledger.
   */
  async advanceTask(taskId) {
    const task = get().todayTasks.find((t) => t.id === taskId)
      ?? get().upcomingTasks.find((t) => t.id === taskId);
    if (!task) return;

    const target = Math.max(1, task.targetCount ?? 1);
    const next = Math.min(target, (task.doneCount ?? 0) + 1);

    if (next >= target) {
      await q.updateTask(taskId, { doneCount: next });
      await get().completeTask(taskId);
      return;
    }
    await q.updateTask(taskId, { doneCount: next });
    await get().loadToday();
  },

  /** Step one unit back. Crossing down out of "done" reverses the payout. */
  async regressTask(taskId) {
    const task = get().todayTasks.find((t) => t.id === taskId)
      ?? get().upcomingTasks.find((t) => t.id === taskId);
    if (!task) return;

    const target = Math.max(1, task.targetCount ?? 1);
    const current = task.doneCount ?? 0;
    const next = Math.max(0, current - 1);

    if (task.done || current >= target) {
      // uncompleteTask removes the ledger entry and the stars with it.
      await get().uncompleteTask(taskId);
    }
    await q.updateTask(taskId, { doneCount: next });
    await get().loadToday();
  },

  /** Move a task between the Daily / Weekly / Monthly / One-off buckets. */
  async setTaskHorizon(taskId, horizon) {
    await q.setTaskHorizon(taskId, horizon);
    await get().loadToday();
  },

  /**
   * "I'm done with this for good." Keeps every past and present occurrence —
   * they carry the ledger entries that earned the stars — and drops only the
   * unfinished future ones.
   */
  async stopRepeating(taskId) {
    const task = get().upcomingTasks.find((t) => t.id === taskId)
      ?? await q.getTaskById(taskId);
    if (!task?.seriesId) return 0;

    const removed = await q.deleteFutureOccurrences(task.seriesId, task.dueDate, true);
    // Pull the future occurrences back out of Google too, or they linger there.
    for (const id of removed) await syncTask(id, 'delete');
    await q.updateTask(taskId, { horizon: 'once', seriesId: null });
    await get().loadToday();
    return removed.length;
  },

  /** Copy a task onto the rest of its week. */
  async duplicateAcrossWeek(taskId) {
    const day = get().appState?.settings.weekResetDay ?? 1;
    const made = await q.duplicateAcrossWeek(taskId, day);
    await get().loadToday();
    return made;
  },

  /**
   * Turn a task into a habit — the drag-onto-Habits gesture.
   * The task row is removed; its ledger entries, if any, stay.
   */
  async convertTaskToHabit(taskId) {
    const task = get().upcomingTasks.find((t) => t.id === taskId);
    if (!task) return;
    await q.addHabit({ name: task.name, polarity: 'good' });
    if (task.seriesId) await q.deleteFutureOccurrences(task.seriesId, task.dueDate);
    await syncTask(taskId, 'delete');
    await q.deleteTask(taskId);
    await get().loadToday();
  },

  /** Turn a habit into a task for today. Archives, never deletes: the habit's
   *  history has to survive the reclassification. */
  async convertHabitToTask(habitId) {
    const habit = get().habits.find((h) => h.id === habitId);
    if (!habit) return;
    await q.addTask({ name: habit.name, dueDate: get().today });
    await q.archiveHabit(habitId);
    await get().loadToday();
  },

  async removeTask(taskId) {
    // Queue the delete BEFORE the row disappears: `enqueueTask` checks for an
    // existing sync link, and the link lookup is keyed by task id.
    await syncTask(taskId, 'delete');
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

  periodFor(habitId) {
    const { habits, appState, today } = get();
    const h = habits.find((x) => x.id === habitId);
    if (!h || !appState) return null;
    return periodWindow(today, localDateOf(h.createdAt),
                        h.targetPeriodWeeks, appState.settings.weekResetDay);
  },

  repsThisPeriod(habitId) {
    const w = get().periodFor(habitId);
    if (!w) return 0;
    return repsInDates(get().historyLogs, habitId, periodDates(w));
  },

  roadmap() {
    const { today } = get();
    return buildRoadmap(
      get().habits,
      (id) => get().repsThisPeriod(id),
      (id) => {
        const w = get().periodFor(id);
        return w ? periodElapsedFraction(today, w) : 1;
      },
    );
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
