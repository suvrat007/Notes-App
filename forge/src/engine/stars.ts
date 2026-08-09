/**
 * THE STAR ENGINE — pure functions, no React, no Dexie, no I/O.
 *
 * Every star value the UI shows is COMPUTED here from LogEntries.
 * No mutable balance is stored anywhere. All values are whole integers.
 */
import type { HabitLike, TaskLike, RewardLike, LogLike } from './types';

/* ---------------- Per-event deltas ---------------- */

/** Good habit rep → +starsPerRep. Adds to lifetime. */
export function goodHabitDelta(habit: HabitLike): number {
  return Math.round(habit.starsPerRep);
}

/** Task done → +stars. Adds to lifetime. */
export function taskDelta(task: TaskLike): number {
  return Math.round(task.stars);
}

/** Task missed → −stars, once. Does NOT touch lifetime. */
export function missedTaskDelta(task: TaskLike): number {
  return -Math.round(task.stars);
}

/**
 * Bad habit rep. `repIndexToday` is 0-based: the index this rep will occupy
 * among today's reps of this habit.
 *
 * Within allowance : −starsPerRep  (or 0 if freeWithinAllowance)
 * Beyond allowance : −starsPerRep − overagePenalty
 *
 * e.g. allowance 1, starsPerRep 10, overage 5 →  rep0 = −10, rep1 = −15.
 * Never touches lifetime.
 */
export function badHabitRepDelta(habit: HabitLike, repIndexToday: number): number {
  const withinAllowance = repIndexToday < habit.dailyAllowance;

  if (withinAllowance) {
    return habit.freeWithinAllowance ? 0 : -Math.round(habit.starsPerRep);
  }

  const base = habit.freeWithinAllowance ? 0 : Math.round(habit.starsPerRep);
  return -(base + Math.round(habit.overagePenalty));
}

/** Redeem a reward → −cost from balance. Does NOT touch lifetime. */
export function redeemDelta(reward: RewardLike): number {
  return -Math.round(reward.cost);
}

/** Total cost of `reps` bad-habit reps in one day, from a clean slate. */
export function badHabitDayTotal(habit: HabitLike, reps: number): number {
  let sum = 0;
  for (let i = 0; i < reps; i++) sum += badHabitRepDelta(habit, i);
  return sum;
}

/* ---------------- Aggregates ---------------- */

/** Sum of every starsDelta in the supplied logs. Caller scopes the range. */
export function weeklyBalance(logs: LogLike[]): number {
  return logs.reduce((sum, l) => sum + l.starsDelta, 0);
}

/**
 * Weekly balance with the optional per-DAY floor applied: when `negativeFloor`
 * is on, a day that nets negative contributes 0 rather than dragging the week
 * down. Requires the week's date list so empty days are handled consistently.
 */
export function weeklyBalanceFloored(
  logs: LogLike[],
  dates: string[],
  opts: { floor: boolean },
): number {
  if (!opts.floor) return weeklyBalance(logs);
  return dates.reduce((sum, d) => sum + dayNet(logs, d, { floor: true }), 0);
}

/** Lifetime = running sum of POSITIVE earns only. Monotonic; drives Rank. */
export function lifetimeFromLogs(logs: LogLike[]): number {
  return logs.reduce((sum, l) => (l.starsDelta > 0 ? sum + l.starsDelta : sum), 0);
}

/** Net stars for one date. `floor` clamps a negative day to 0. */
export function dayNet(
  logs: LogLike[],
  dateStr: string,
  opts: { floor?: boolean } = {},
): number {
  const net = logs
    .filter((l) => l.date === dateStr)
    .reduce((sum, l) => sum + l.starsDelta, 0);
  return opts.floor ? Math.max(0, net) : net;
}

/** How many reps of `refId` are already logged on `dateStr`. */
export function repsOn(logs: LogLike[], refId: string, dateStr: string): number {
  return logs
    .filter((l) => l.refId === refId && l.date === dateStr)
    .reduce((sum, l) => sum + l.count, 0);
}

/** Reps of `refId` across a set of dates (a week). */
export function repsInDates(logs: LogLike[], refId: string, dates: string[]): number {
  const set = new Set(dates);
  return logs
    .filter((l) => l.refId === refId && set.has(l.date))
    .reduce((sum, l) => sum + l.count, 0);
}

/** Net stars attributable to one ref across the supplied logs. */
export function netForRef(logs: LogLike[], refId: string): number {
  return logs
    .filter((l) => l.refId === refId)
    .reduce((sum, l) => sum + l.starsDelta, 0);
}
