/**
 * In-memory app state. Dexie remains the source of truth: every action
 * writes through the query layer, then reloads the slices it touched.
 * Star maths is delegated entirely to `engine/`.
 */
import { create } from 'zustand';
import type { Habit, LogEntry, AppState } from '../db/schema';
import { db } from '../db/schema';
import { ensureAppState } from '../db/init';
import * as q from '../db/queries';
import {
  goodHabitDelta,
  badHabitRepDelta,
  weeklyBalance,
  weeklyBalanceFloored,
  dayNet,
  repsOn,
} from '../engine/stars';
import { todayStr, mondayOf, weekDates } from '../lib/dates';

type ForgeState = {
  ready: boolean;
  today: string;
  habits: Habit[];
  todayLogs: LogEntry[];
  weekLogs: LogEntry[];
  appState: AppState | null;

  loadToday: () => Promise<void>;
  logHabitRep: (habitId: string) => Promise<number | null>;
  undoHabitRep: (habitId: string) => Promise<void>;
  createHabit: (input: q.NewHabit) => Promise<void>;
  archiveHabit: (id: string) => Promise<void>;

  // Derived selectors (read-only helpers over current slices).
  repsToday: (habitId: string) => number;
  weekBalance: () => number;
  todayNet: () => number;
};

export const useForge = create<ForgeState>((set, get) => ({
  ready: false,
  today: todayStr(),
  habits: [],
  todayLogs: [],
  weekLogs: [],
  appState: null,

  async loadToday() {
    await db.open();
    const appState = await ensureAppState();
    const today = todayStr();
    const monday = mondayOf(today);
    const [habits, weekLogs] = await Promise.all([
      q.listActiveHabits(),
      q.listLogsInRange(monday, weekDates(monday)[6]),
    ]);
    set({
      ready: true,
      today,
      habits,
      weekLogs,
      todayLogs: weekLogs.filter((l) => l.date === today),
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
}));
