/**
 * In-memory app state. Dexie remains the source of truth: every action
 * writes through the query layer, then reloads the slices it touched.
 * Star maths is delegated entirely to `engine/`.
 */
import { create } from 'zustand';
import type { Habit, LogEntry, AppState, Task } from '../db/schema';
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
} from '../engine/stars';
import { buildRecurringRows, type VirtualTaskRow } from '../engine/recurring';
import { todayStr, mondayOf, weekDates } from '../lib/dates';

type ForgeState = {
  ready: boolean;
  today: string;
  habits: Habit[];
  todayLogs: LogEntry[];
  weekLogs: LogEntry[];
  todayTasks: Task[];
  appState: AppState | null;

  loadToday: () => Promise<void>;
  logHabitRep: (habitId: string) => Promise<number | null>;
  undoHabitRep: (habitId: string) => Promise<void>;
  createHabit: (input: q.NewHabit) => Promise<void>;
  archiveHabit: (id: string) => Promise<void>;

  createTask: (input: q.NewTask) => Promise<void>;
  completeTask: (taskId: string) => Promise<void>;
  uncompleteTask: (taskId: string) => Promise<void>;
  removeTask: (taskId: string) => Promise<void>;

  // Derived selectors (read-only helpers over current slices).
  repsToday: (habitId: string) => number;
  weekBalance: () => number;
  todayNet: () => number;
  recurringRows: () => VirtualTaskRow[];
};

export const useForge = create<ForgeState>((set, get) => ({
  ready: false,
  today: todayStr(),
  habits: [],
  todayLogs: [],
  weekLogs: [],
  todayTasks: [],
  appState: null,

  async loadToday() {
    await db.open();
    const appState = await ensureAppState();
    // Charge for anything missed while the app was closed, before we read logs.
    await sweepMissedTasks();

    const today = todayStr();
    const monday = mondayOf(today);
    const [habits, weekLogs, todayTasks] = await Promise.all([
      q.listActiveHabits(),
      q.listLogsInRange(monday, weekDates(monday)[6]),
      q.listTasksForDate(today),
    ]);
    set({
      ready: true,
      today,
      habits,
      weekLogs,
      todayLogs: weekLogs.filter((l) => l.date === today),
      todayTasks: todayTasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      appState,
    });
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

  recurringRows() {
    const { habits, today } = get();
    return buildRecurringRows(habits, today, (id) => get().repsToday(id));
  },
}));
