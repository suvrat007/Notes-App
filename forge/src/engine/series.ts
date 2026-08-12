/**
 * Recurring-task date maths. Pure — no React, no Dexie.
 *
 * Occurrences are generated as concrete dates rather than evaluated from a
 * rule at read time, so the rest of the app keeps treating a task as a plain
 * day-keyed row.
 */
import { addDays, daysBetween } from '../lib/dates';

export type Horizon = 'once' | 'daily' | 'weekly' | 'monthly';

/**
 * How far ahead a series is materialised.
 *
 * Bounded on purpose: generating "forever" would put thousands of rows in
 * IndexedDB and push every one of them to Google. Load tops the window up, so
 * a series never visibly runs out.
 */
export const GENERATE_AHEAD_DAYS = 62;

/** Step between occurrences, in days. Monthly is approximated as 4 weeks so
 *  the cadence stays weekday-stable, which is how people actually plan. */
export function stepDays(horizon: Horizon): number {
  switch (horizon) {
    case 'daily': return 1;
    case 'weekly': return 7;
    case 'monthly': return 28;
    default: return 0;
  }
}

export function repeats(horizon: Horizon): boolean {
  return stepDays(horizon) > 0;
}

/**
 * Dates a series should occupy from `from` through `from + aheadDays`,
 * counting in whole steps from `anchor` so the weekday never drifts.
 */
export function occurrenceDates(
  anchor: string,
  horizon: Horizon,
  from: string,
  aheadDays = GENERATE_AHEAD_DAYS,
): string[] {
  const step = stepDays(horizon);
  if (step === 0) return [anchor];

  const horizonEnd = addDays(from, aheadDays);
  const out: string[] = [];

  // Start at the first occurrence on or after `from`, so a series created in
  // the past does not backfill months of rows nobody asked for.
  const behind = daysBetween(anchor, from);
  const skipped = behind > 0 ? Math.ceil(behind / step) : 0;
  let date = addDays(anchor, skipped * step);

  while (date <= horizonEnd) {
    out.push(date);
    date = addDays(date, step);
  }
  return out;
}

/**
 * Which dates are missing, given what already exists. Generation is additive:
 * an occurrence the user edited or completed must never be recreated or
 * overwritten.
 */
export function missingDates(wanted: string[], existing: string[]): string[] {
  const have = new Set(existing);
  return wanted.filter((d) => !have.has(d));
}

export const HORIZON_LABEL: Record<Horizon, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  once: 'One-off',
};

/** Bucket order shown on the Manage screen: most frequent first. */
export const HORIZON_ORDER: Horizon[] = ['daily', 'weekly', 'monthly', 'once'];
