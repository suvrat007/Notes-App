/**
 * Adaptive daily target + weekly pace maths. Pure — no React, no Dexie.
 */
import type { HabitLike } from './types';

export interface TargetInput {
  /** Stars available from tasks due today (sum of their `stars`). */
  tasksDueToday: number;
  /** Good habits with a weekly target, plus their reps so far this week. */
  activeGoodHabits: Array<{
    habit: HabitLike;
    repsThisWeek: number;
  }>;
  /** Rolling average of recent daily net stars. */
  recentDailyAvg: number;
  /** Days left in the week INCLUDING today (1..7). */
  daysLeftInWeek: number;
}

/** Max growth per suggestion — never ramp the user more than 10% over their average. */
export const GROWTH_CAP = 1.1;

/**
 * Stars still needed today to stay on pace for a habit's weekly target,
 * spreading the remaining reps evenly across the days left.
 */
export function habitPaceToday(
  habit: HabitLike,
  repsThisWeek: number,
  daysLeftInWeek: number,
): number {
  if (habit.weeklyTarget <= 0) return 0;
  const remainingReps = Math.max(0, habit.weeklyTarget - repsThisWeek);
  if (remainingReps === 0) return 0;
  const days = Math.max(1, daysLeftInWeek);
  const repsToday = Math.ceil(remainingReps / days);
  return repsToday * habit.starsPerRep;
}

/**
 * Suggested daily target:
 *   raw   = today's task stars + today's share of every good habit's weekly pace
 *   blend = 50/50 between raw and the recent daily average
 *   cap   = never more than recentAvg * 1.10 (once there IS an average to cap against)
 */
export function suggestDailyTarget(input: TargetInput): number {
  const { tasksDueToday, activeGoodHabits, recentDailyAvg, daysLeftInWeek } = input;

  const habitPace = activeGoodHabits.reduce(
    (sum, a) => sum + habitPaceToday(a.habit, a.repsThisWeek, daysLeftInWeek),
    0,
  );
  const raw = tasksDueToday + habitPace;

  // With no history there is nothing to blend or cap against — use the raw need.
  if (recentDailyAvg <= 0) return Math.max(0, Math.round(raw));

  const blended = raw * 0.5 + recentDailyAvg * 0.5;
  const capped = Math.min(blended, recentDailyAvg * GROWTH_CAP);
  return Math.max(0, Math.round(capped));
}

/** Mean of the supplied daily nets, ignoring days before the user started. */
export function recentDailyAverage(dailyNets: number[]): number {
  if (dailyNets.length === 0) return 0;
  const sum = dailyNets.reduce((a, b) => a + b, 0);
  return sum / dailyNets.length;
}

/* ---------------- Weekly roadmap ---------------- */

export interface RoadmapNode {
  habitId: string;
  name: string;
  icon: string;
  target: number;
  done: number;
  /** 0..1 */
  fill: number;
}

export function buildRoadmap<T extends HabitLike & { name: string; icon: string }>(
  habits: T[],
  repsThisWeekFor: (habitId: string) => number,
): RoadmapNode[] {
  return habits
    .filter((h) => h.polarity === 'good' && h.weeklyTarget > 0)
    .map((h) => {
      const done = repsThisWeekFor(h.id);
      return {
        habitId: h.id,
        name: h.name,
        icon: h.icon,
        target: h.weeklyTarget,
        done,
        fill: Math.max(0, Math.min(1, done / h.weeklyTarget)),
      };
    });
}

/** Stars the week is worth if every good habit hits its weekly target. */
export function weeklyGoalStars(nodes: RoadmapNode[], starsPerRep: (id: string) => number): number {
  return nodes.reduce((sum, n) => sum + n.target * starsPerRep(n.habitId), 0);
}

/**
 * Straight-line projection of the week's final balance from the pace so far.
 * `daysElapsed` counts today as elapsed (1..7).
 */
export function projectedWeekFinish(
  balanceSoFar: number,
  daysElapsed: number,
  daysInWeek = 7,
): number {
  const d = Math.max(1, Math.min(daysInWeek, daysElapsed));
  return Math.round((balanceSoFar / d) * daysInWeek);
}
