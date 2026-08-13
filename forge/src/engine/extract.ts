/**
 * In-house deterministic extraction of the MECHANICAL parts of an utterance:
 * numbers, dates, times, recurrence and negation.
 *
 * Why this is not left to the model: these are arithmetic and pattern work,
 * which is precisely where an LLM is least reliable and a parser is exact.
 * Observed failures that this layer removes — "read 20 pages" coming back as
 * twenty reps, a count bleeding from one clause into the next, and a relative
 * date resolved to the wrong day.
 *
 * The model still does what it is genuinely better at: deciding what each
 * fragment MEANS. This layer then overrides its arithmetic.
 *
 * Pure — no React, no Dexie, no network.
 */
import { addDays, fromDateStr, toDateStr } from '../lib/dates';

export type Horizon = 'once' | 'daily' | 'weekly' | 'monthly';

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, once: 1, two: 2, twice: 2, three: 3, thrice: 3, four: 4,
  five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  fifteen: 15, twenty: 20, thirty: 30,
};

const WEEKDAYS = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

/** Parse "three" or "3" into a number. */
export function wordToNumber(token: string): number | null {
  const t = token.toLowerCase().trim();
  if (/^\d+$/.test(t)) return Number(t);
  return NUMBER_WORDS[t] ?? null;
}

/**
 * How many times something was done or must be done.
 *
 * Deliberately ignores a number that is part of the OBJECT rather than the
 * repetition: "read 20 pages" is one reading, not twenty. Only a count that
 * attaches to a repetition word ("twice", "3 times") or to a countable
 * deliverable ("3 videos") is returned.
 */
export function extractCount(clause: string): number | null {
  /*
   * Strip clock references first. "buy bread at nine in the evening" has a
   * number, but it is the hour — counting it produced a task needing nine
   * units. A number owned by a time is never a repetition count.
   */
  const s = clause
    .toLowerCase()
    .replace(/\bat\s+\d{1,2}([:.]\d{2})?\s*(am|pm|o'?clock)?/g, ' ')
    .replace(/\bat\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g, ' ')
    .replace(/\b\d{1,2}[:.]\d{2}\s*(am|pm)?/g, ' ')
    .replace(/\b\d{1,2}\s*(am|pm)\b/g, ' ');

  // "twice", "three times", "5x"
  const times = s.match(/\b(\d+|[a-z]+)\s*(?:times|x)\b/);
  if (times) {
    const n = wordToNumber(times[1]);
    if (n) return n;
  }
  if (/\btwice\b/.test(s)) return 2;
  if (/\bthrice\b/.test(s)) return 3;

  /*
   * "finish three videos" — a number directly before a countable noun that is
   * the thing being completed. Units of measure ("pages", "minutes", "km")
   * describe the size of ONE effort, not a repeat count.
   */
  const UNITS = /^(pages?|minutes?|mins?|hours?|hrs?|km|kms|miles?|litres?|liters?|glasses?|cups?|words?|reps?|sets?|kilos?|kgs?|lbs?|percent|%)$/;
  const m = s.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+([a-z]+)/);
  if (m) {
    const n = wordToNumber(m[1]);
    if (n && !UNITS.test(m[2])) return n;
  }
  return null;
}

/** 24-hour "HH:MM" if the clause states a clock time. */
export function extractTime(clause: string): string | null {
  const s = clause.toLowerCase();

  // "at 9:30 pm", "9.30am", "at 17:00"
  const explicit = s.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm)?/);
  if (explicit) {
    let h = Number(explicit[1]);
    const min = Number(explicit[2]);
    const mer = explicit[3];
    if (mer === 'pm' && h < 12) h += 12;
    if (mer === 'am' && h === 12) h = 0;
    if (h < 24 && min < 60) return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }

  // "at 9 pm", "at five in the evening", "at 9"
  const loose = s.match(/\bat\s+(\d{1,2}|[a-z]+)\s*(am|pm|o'?clock)?/);
  if (loose) {
    let h = wordToNumber(loose[1]);
    if (h !== null && h <= 24) {
      const mer = loose[2];
      const evening = /\b(evening|night|tonight|pm)\b/.test(s);
      const morning = /\b(morning|am)\b/.test(s);
      if (mer === 'pm' || (evening && h < 12)) h = h < 12 ? h + 12 : h;
      else if (mer === 'am' || morning) { if (h === 12) h = 0; }
      // A bare "at five" means the afternoon far more often than dawn.
      else if (h >= 1 && h <= 7) h += 12;
      if (h < 24) return `${String(h).padStart(2, '0')}:00`;
    }
  }
  return null;
}

/** How often it recurs, if the clause says so. */
export function extractHorizon(clause: string): Horizon {
  const s = clause.toLowerCase();
  // "by Friday" is a deadline, not a repeat — check that before the weekday rule.
  if (/\bby\s+(next\s+)?[a-z]+day\b/.test(s)) return 'once';
  if (/\bevery\s+(day|morning|evening|night)\b|\bdaily\b|\beach\s+day\b/.test(s)) return 'daily';
  if (/\bevery\s+week\b|\bweekly\b|\bevery\s+[a-z]+day\b|\beach\s+week\b/.test(s)) return 'weekly';
  if (/\bevery\s+month\b|\bmonthly\b|\beach\s+month\b/.test(s)) return 'monthly';
  return 'once';
}

export interface DateContext {
  today: string;
  /** 1 = Monday. */
  weekStartDay?: number;
}

/**
 * Resolve a relative date reference to an absolute one.
 *
 * A deadline resolves to the LAST day available, matching how people speak:
 * "this week" means by the end of it, not right now.
 */
export function extractDate(clause: string, ctx: DateContext): string | null {
  const s = clause.toLowerCase();
  const today = ctx.today;

  if (/\b(today|tonight|this evening|this morning)\b/.test(s)) return today;
  if (/\btomorrow\b/.test(s)) return addDays(today, 1);
  // Longest match first: "yesterday" is a substring of "day before yesterday".
  if (/\bday before yesterday\b/.test(s)) return addDays(today, -2);
  if (/\byesterday\b/.test(s)) return addDays(today, -1);

  const inDays = s.match(/\bin\s+(\d+|[a-z]+)\s+days?\b/);
  if (inDays) {
    const n = wordToNumber(inDays[1]);
    if (n !== null) return addDays(today, n);
  }

  const inWeeks = s.match(/\bin\s+(\d+|[a-z]+)\s+weeks?\b/);
  if (inWeeks) {
    const n = wordToNumber(inWeeks[1]);
    if (n !== null) return addDays(today, n * 7);
  }

  const weekStart = ctx.weekStartDay ?? 1;
  const dow = fromDateStr(today).getDay();
  const backToStart = (dow - weekStart + 7) % 7;
  const weekEnd = addDays(today, 6 - backToStart);

  if (/\bnext week\b/.test(s)) return addDays(weekEnd, 7);
  if (/\bthis week\b|\bby the weekend\b|\bthis weekend\b/.test(s)) return weekEnd;
  if (/\bnext month\b/.test(s)) return addDays(today, 30);

  // "on Thursday" / "by Friday" -> the next such weekday, today excluded.
  const named = s.match(/\b(?:on|by|next)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (named) {
    const target = WEEKDAYS.indexOf(named[1]);
    let delta = (target - dow + 7) % 7;
    if (delta === 0) delta = 7;
    return addDays(today, delta);
  }

  // "on the 5th", "15 March" — same-year, next occurrence.
  const dayOfMonth = s.match(/\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/);
  if (dayOfMonth) {
    const d = Number(dayOfMonth[1]);
    const base = fromDateStr(today);
    const candidate = new Date(base.getFullYear(), base.getMonth(), d);
    if (d >= 1 && d <= 31) {
      if (toDateStr(candidate) < today) candidate.setMonth(candidate.getMonth() + 1);
      return toDateStr(candidate);
    }
  }
  return null;
}

/** True when the clause says the thing did NOT happen. */
export function isNegated(clause: string): boolean {
  return /\b(no|not|don'?t|didn'?t|won'?t|never|avoid(?:ed|ing)?|skip(?:ped)?|without|quit|stopped)\b/i
    .test(clause);
}

export interface Mechanics {
  count: number | null;
  dueTime: string | null;
  horizon: Horizon;
  date: string | null;
  negated: boolean;
}

/** Everything this layer can determine on its own, for one fragment. */
export function extractMechanics(clause: string, ctx: DateContext): Mechanics {
  return {
    count: extractCount(clause),
    dueTime: extractTime(clause),
    horizon: extractHorizon(clause),
    date: extractDate(clause, ctx),
    negated: isNegated(clause),
  };
}
