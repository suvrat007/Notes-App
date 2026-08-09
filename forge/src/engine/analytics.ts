/**
 * Analytics aggregations. Pure — logs in, chart-ready rows out.
 */
import type { LogLike } from './types';
import { dayNet, lifetimeFromLogs } from './stars';

export interface DayPoint {
  date: string;
  value: number;
}

/** Net stars per day across the supplied dates. */
export function starsPerDay(
  logs: LogLike[],
  dates: string[],
  opts: { floor?: boolean } = {},
): DayPoint[] {
  return dates.map((date) => ({ date, value: dayNet(logs, date, opts) }));
}

/** Cumulative lifetime (positive earns only) at the end of each date. */
export function cumulativeLifetime(logs: LogLike[], dates: string[]): DayPoint[] {
  let acc = 0;
  return dates.map((date) => {
    acc += lifetimeFromLogs(logs.filter((l) => l.date === date));
    return { date, value: acc };
  });
}

/** Roll day points up into fixed-size buckets, summing within each bucket. */
export function bucketBy(points: DayPoint[], size: number): DayPoint[] {
  if (size <= 1) return points;
  const out: DayPoint[] = [];
  for (let i = 0; i < points.length; i += size) {
    const slice = points.slice(i, i + size);
    // Cumulative series: the bucket's value is its last point, not a sum.
    out.push({ date: slice[0].date, value: slice[slice.length - 1].value });
  }
  return out;
}

/** Reps of each ref per day — the heatmap's raw grid. */
export function repsPerDay(logs: LogLike[], refId: string, dates: string[]): DayPoint[] {
  return dates.map((date) => ({
    date,
    value: logs
      .filter((l) => l.refId === refId && l.date === date)
      .reduce((s, l) => s + l.count, 0),
  }));
}

export interface HabitStat {
  refId: string;
  net: number;
  reps: number;
}

/** Net stars and rep count per habit across the supplied logs. */
export function perHabitStats(logs: LogLike[]): HabitStat[] {
  const map = new Map<string, HabitStat>();
  for (const l of logs) {
    if (l.kind !== 'habit') continue;
    const cur = map.get(l.refId) ?? { refId: l.refId, net: 0, reps: 0 };
    cur.net += l.starsDelta;
    cur.reps += l.count;
    map.set(l.refId, cur);
  }
  return [...map.values()].sort((a, b) => b.net - a.net);
}

export interface Streak {
  current: number;
  record: number;
}

/**
 * Consecutive-day streak for a habit, where a day "counts" if the habit met
 * its daily share of the weekly target (target/7, at least 1 rep).
 *
 * `dates` must be chronological. The current streak is measured from the end;
 * today not yet being done does not break it — we look back from yesterday in
 * that case, so a streak isn't reported as lost before the day is over.
 */
export function habitStreak(
  logs: LogLike[],
  refId: string,
  dates: string[],
  weeklyTarget: number,
): Streak {
  const perDayNeed = weeklyTarget > 0 ? Math.max(1, Math.round(weeklyTarget / 7)) : 1;
  const met = repsPerDay(logs, refId, dates).map((p) => p.value >= perDayNeed);

  let record = 0;
  let run = 0;
  for (const m of met) {
    run = m ? run + 1 : 0;
    if (run > record) record = run;
  }

  // Current streak: count back from the end, tolerating an unfinished today.
  let i = met.length - 1;
  if (i >= 0 && !met[i]) i--; // today still open
  let current = 0;
  for (; i >= 0 && met[i]; i--) current++;

  return { current, record };
}
