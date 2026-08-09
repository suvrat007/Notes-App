/**
 * Goal periods. A habit's target is `targetReps` reps across
 * `targetPeriodWeeks` weeks — 1 week behaves exactly as the old weekly
 * target did, and longer windows let a goal be set when a week is too
 * short a horizon to judge.
 *
 * Periods TILE from an anchor (the habit's creation week) rather than
 * floating, so "this period" is stable: it doesn't shift under the user
 * as the days pass, and past periods stay comparable.
 *
 * Pure — no React, no Dexie.
 */
import { weekStartOf, addDays, daysBetween } from '../lib/dates';

export const PERIOD_OPTIONS = [
  { weeks: 1, label: 'Week', short: 'wk' },
  { weeks: 2, label: 'Fortnight', short: '2wk' },
  { weeks: 4, label: 'Month', short: 'mo' },
  { weeks: 8, label: '2 Months', short: '2mo' },
  { weeks: 12, label: 'Quarter', short: 'qtr' },
] as const;

export interface PeriodWindow {
  start: string;
  end: string;
  /** Whole periods since the anchor; negative before it. */
  index: number;
  weeks: number;
}

export function periodShortLabel(weeks: number): string {
  return PERIOD_OPTIONS.find((p) => p.weeks === weeks)?.short ?? `${weeks}wk`;
}

export function periodLabel(weeks: number): string {
  return PERIOD_OPTIONS.find((p) => p.weeks === weeks)?.label ?? `${weeks} weeks`;
}

/** Normalise anything the UI or old data might hand us. */
export function safePeriodWeeks(weeks: number | undefined): number {
  if (!weeks || !Number.isFinite(weeks) || weeks < 1) return 1;
  return Math.min(52, Math.round(weeks));
}

/**
 * The period window containing `dateStr`, tiled from `anchorStr`'s week.
 */
export function periodWindow(
  dateStr: string,
  anchorStr: string,
  periodWeeks: number,
  weekStartDay = 1,
): PeriodWindow {
  const weeks = safePeriodWeeks(periodWeeks);
  const anchorStart = weekStartOf(anchorStr, weekStartDay);
  const thisWeekStart = weekStartOf(dateStr, weekStartDay);

  const weeksSinceAnchor = daysBetween(anchorStart, thisWeekStart) / 7;
  // floor() also does the right thing for dates before the anchor.
  const index = Math.floor(weeksSinceAnchor / weeks);

  const start = addDays(anchorStart, index * weeks * 7);
  return { start, end: addDays(start, weeks * 7 - 1), index, weeks };
}

/** Every date in the window, chronological. */
export function periodDates(w: PeriodWindow): string[] {
  return Array.from({ length: w.weeks * 7 }, (_, i) => addDays(w.start, i));
}

/** Days remaining in the window INCLUDING today (>= 1 while inside it). */
export function daysLeftInPeriod(dateStr: string, w: PeriodWindow): number {
  return Math.max(1, daysBetween(dateStr, w.end) + 1);
}

/** Days of the window already spent, including today. */
export function daysElapsedInPeriod(dateStr: string, w: PeriodWindow): number {
  return Math.max(1, Math.min(w.weeks * 7, daysBetween(w.start, dateStr) + 1));
}

/**
 * Fraction of the window that has elapsed (0..1) — used to tell "ahead" from
 * "behind" rather than just showing raw progress.
 */
export function periodElapsedFraction(dateStr: string, w: PeriodWindow): number {
  return daysElapsedInPeriod(dateStr, w) / (w.weeks * 7);
}
