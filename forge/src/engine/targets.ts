/**
 * Adaptive daily target + weekly pace maths. Pure — no React, no Dexie.
 */
import type { HabitLike } from './types';
import { safePeriodWeeks, periodShortLabel } from './period';

export interface TargetInput {
  /** Stars available from tasks due today (sum of their `stars`). */
  tasksDueToday: number;
  /** Good habits with a goal, plus their reps so far in the CURRENT period. */
  activeGoodHabits: Array<{
    habit: HabitLike;
    repsThisPeriod: number;
    /** Days left in that habit's own period, including today. */
    daysLeftInPeriod: number;
  }>;
  /** Rolling average of recent daily net stars. */
  recentDailyAvg: number;
}

/** Max growth per suggestion — never ramp the user more than 10% over their average. */
export const GROWTH_CAP = 1.1;

/**
 * Stars still needed today to stay on pace for a habit's goal, spreading the
 * reps still owed evenly across the days left IN ITS OWN PERIOD.
 *
 * A longer period naturally produces a gentler daily ask, which is the whole
 * point of allowing one: a 12-reps-a-quarter goal shouldn't nag daily.
 */
export function habitPaceToday(
  habit: HabitLike,
  repsThisPeriod: number,
  daysLeftInPeriod: number,
): number {
  if (habit.targetReps <= 0) return 0;
  const remainingReps = Math.max(0, habit.targetReps - repsThisPeriod);
  if (remainingReps === 0) return 0;
  const days = Math.max(1, daysLeftInPeriod);
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
  const { tasksDueToday, activeGoodHabits, recentDailyAvg } = input;

  const habitPace = activeGoodHabits.reduce(
    (sum, a) => sum + habitPaceToday(a.habit, a.repsThisPeriod, a.daysLeftInPeriod),
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
  periodWeeks: number;
  /** e.g. 'wk', 'mo', 'qtr' — what the target is measured over. */
  periodShort: string;
  /** 0..1 of the period already spent; lets the UI show ahead/behind. */
  elapsed: number;
  /** done − expected-by-now, in reps. Negative means behind pace. */
  aheadBy: number;
}

export function buildRoadmap<T extends HabitLike & { name: string; icon: string }>(
  habits: T[],
  repsThisPeriodFor: (habitId: string) => number,
  elapsedFractionFor: (habitId: string) => number = () => 1,
): RoadmapNode[] {
  return habits
    .filter((h) => h.polarity === 'good' && h.targetReps > 0)
    .map((h) => {
      const done = repsThisPeriodFor(h.id);
      const weeks = safePeriodWeeks(h.targetPeriodWeeks);
      const elapsed = Math.max(0, Math.min(1, elapsedFractionFor(h.id)));
      return {
        habitId: h.id,
        name: h.name,
        icon: h.icon,
        target: h.targetReps,
        done,
        fill: Math.max(0, Math.min(1, done / h.targetReps)),
        periodWeeks: weeks,
        periodShort: periodShortLabel(weeks),
        elapsed,
        aheadBy: Math.round((done - h.targetReps * elapsed) * 10) / 10,
      };
    });
}

/**
 * Stars in play if every good habit hits its goal, normalised to ONE WEEK so
 * goals of different lengths can be summed into a single weekly figure.
 */
export function weeklyGoalStars(nodes: RoadmapNode[], starsPerRep: (id: string) => number): number {
  return Math.round(
    nodes.reduce(
      (sum, n) => sum + (n.target / n.periodWeeks) * starsPerRep(n.habitId),
      0,
    ),
  );
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
