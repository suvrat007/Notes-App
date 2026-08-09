/**
 * Date helpers. Everything in FORGE is a local-time `YYYY-MM-DD` string.
 * We never store Date objects or UTC timestamps for day-keyed data — a user
 * logging a rep at 11pm must have it land on the day they perceive.
 */

/** Format a Date as local `YYYY-MM-DD` (NOT toISOString, which is UTC). */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse `YYYY-MM-DD` into a local-midnight Date. */
export function fromDateStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function addDays(dateStr: string, n: number): string {
  const d = fromDateStr(dateStr);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** Monday (ISO week start) of the week containing `dateStr`. */
export function mondayOf(dateStr: string): string {
  const d = fromDateStr(dateStr);
  // getDay(): 0=Sun..6=Sat. Distance back to Monday.
  const back = (d.getDay() + 6) % 7;
  return addDays(dateStr, -back);
}

/** The 7 date strings of the week starting at `mondayStr`. */
export function weekDates(mondayStr: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayStr, i));
}

/** Whole days from `a` to `b` (b - a). Negative if b is earlier. */
export function daysBetween(a: string, b: string): number {
  const ms = fromDateStr(b).getTime() - fromDateStr(a).getTime();
  return Math.round(ms / 86_400_000);
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function shortDayName(dateStr: string): string {
  return SHORT_DAYS[fromDateStr(dateStr).getDay()];
}
