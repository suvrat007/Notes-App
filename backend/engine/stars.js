/**
 * THE STAR ENGINE — pure functions. No express, no mongoose, no I/O.
 *
 * Ported from the FORGE prototype's engine/ and kept pure for the same reason
 * it was pure there: every star the UI shows is COMPUTED from the ledger, so
 * this file is the single place the rules live. No mutable balance is stored
 * anywhere, and nothing here can read or write the database.
 *
 * All values are whole integers.
 */

/* ---------------- Per-event deltas ---------------- */

/** Good habit rep -> +starsPerRep. Adds to lifetime. */
function goodHabitDelta(habit) {
  return Math.round(habit.starsPerRep);
}

/** Task done -> +stars. Adds to lifetime. */
function taskDelta(task) {
  return Math.round(task.baseReward ?? task.stars ?? 0);
}

/** Task missed -> -stars, once. Does NOT touch lifetime. */
function missedTaskDelta(task) {
  return -Math.round(task.baseReward ?? task.stars ?? 0);
}

/**
 * Bad habit rep. `repIndexToday` is 0-based: the slot this rep will occupy
 * among today's reps of this habit.
 *
 *   within allowance : -starsPerRep  (or 0 when freeWithinAllowance)
 *   beyond allowance : -starsPerRep - overagePenalty
 *
 * e.g. allowance 1, starsPerRep 10, overage 5 -> rep0 = -10, rep1 = -15.
 * Never touches lifetime.
 */
function badHabitRepDelta(habit, repIndexToday) {
  const withinAllowance = repIndexToday < habit.dailyAllowance;

  if (withinAllowance) {
    return habit.freeWithinAllowance ? 0 : -Math.round(habit.starsPerRep);
  }

  const base = habit.freeWithinAllowance ? 0 : Math.round(habit.starsPerRep);
  return -(base + Math.round(habit.overagePenalty));
}

/** Total cost of `reps` bad-habit reps in one day, from a clean slate. */
function badHabitDayTotal(habit, reps) {
  let sum = 0;
  for (let i = 0; i < reps; i++) sum += badHabitRepDelta(habit, i);
  return sum;
}

/* ---------------- Rewards ---------------- */

/** The fixed damage ladder. Not free text: the choice is a size, not a sum. */
const DAMAGE_TIERS = [
  { pct: 20, label: 'Small', blurb: 'a treat' },
  { pct: 40, label: 'Fair', blurb: 'a proper night off' },
  { pct: 60, label: 'Heavy', blurb: 'a real indulgence' },
  { pct: 80, label: 'Severe', blurb: 'most of what you built' },
  { pct: 100, label: 'Total', blurb: 'back to zero' },
];

/**
 * What a reward costs right now: a share of everything earned.
 *
 * Rounds UP so a share of anything still costs something, and floors at zero
 * so a negative total can never pay out.
 */
function rewardCost(lifetimeStars, pct) {
  const safe = Math.max(0, Math.min(100, Number(pct) || 0));
  return Math.ceil(Math.max(0, lifetimeStars) * (safe / 100));
}

/**
 * The system's opening offer, from what the thing IS. Only a starting point —
 * the user always sees it and can move it. Guessing low is the safe direction:
 * an under-priced reward is a smaller mistake than one that silently wipes a
 * month of work.
 */
const BIG = /\b(week|weekend|holiday|vacation|trip|days? off|time off|console|phone|laptop|watch|bike|tattoo|splurge)\b/i;
const MEDIUM = /\b(night out|dinner|concert|gig|match|game|massage|spa|shopping|takeaway|meal out)\b/i;

function suggestDamage(name) {
  const n = String(name || '').trim();
  if (!n) return 20;
  if (/\bweek off\b|\bweek's? off\b/i.test(n)) return 100;
  if (BIG.test(n)) return 80;
  if (MEDIUM.test(n)) return 40;
  return 20;
}

/* ---------------- Aggregates over the ledger ---------------- */

/** Sum of every delta in `logs`. Signs included, so penalties subtract. */
function balanceOf(logs) {
  return logs.reduce((sum, l) => sum + l.starsDelta, 0);
}

/**
 * LIFETIME IGNORES PENALTIES: only positive earns count, and only from doing
 * things. Spending is the one exception that DOES reduce it — see the reward
 * routes — because a reward is meant to cost you rank.
 */
function lifetimeFromLogs(logs) {
  return logs.reduce((sum, l) => (l.starsDelta > 0 ? sum + l.starsDelta : sum), 0);
}

/** Net stars on one day. `floor` clamps a bad day to 0 rather than negative. */
function dayNet(logs, dateKey, opts = {}) {
  const net = logs
    .filter((l) => dayKey(l.date) === dateKey)
    .reduce((sum, l) => sum + l.starsDelta, 0);
  return opts.floor ? Math.max(0, net) : net;
}

/** Reps of one thing on one day — drives the bad-habit allowance ladder. */
function repsOn(logs, refId, dateKey) {
  return logs
    .filter((l) => String(l.refId) === String(refId) && dayKey(l.date) === dateKey)
    .reduce((sum, l) => sum + (l.count || 1), 0);
}

/** Reps of one thing across a set of days. */
function repsInDates(logs, refId, dateKeys) {
  const wanted = new Set(dateKeys);
  return logs
    .filter((l) => String(l.refId) === String(refId) && wanted.has(dayKey(l.date)))
    .reduce((sum, l) => sum + (l.count || 1), 0);
}

/* ---------------- Dates ---------------- */

/** A Date (or ISO string) as YYYY-MM-DD in UTC, which is how days are stored. */
function dayKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

/** Midnight UTC for a YYYY-MM-DD key — the canonical stored form of a day. */
function dayStart(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function addDays(dateKey, n) {
  const d = dayStart(dateKey);
  d.setUTCDate(d.getUTCDate() + n);
  return dayKey(d);
}

/** Whole days from `a` to `b`; negative when b is earlier. */
function daysBetween(a, b) {
  return Math.round((dayStart(b) - dayStart(a)) / 86400000);
}

/** The week's start for a date, given which weekday starts it (1 = Monday). */
function weekStartOf(dateKey, weekStartDay = 1) {
  const d = dayStart(dateKey);
  const shift = (d.getUTCDay() - weekStartDay + 7) % 7;
  return addDays(dateKey, -shift);
}

/** The seven day-keys of the week beginning at `startKey`. */
function weekDates(startKey) {
  return Array.from({ length: 7 }, (_, i) => addDays(startKey, i));
}

module.exports = {
  goodHabitDelta,
  taskDelta,
  missedTaskDelta,
  badHabitRepDelta,
  badHabitDayTotal,
  DAMAGE_TIERS,
  rewardCost,
  suggestDamage,
  balanceOf,
  lifetimeFromLogs,
  dayNet,
  repsOn,
  repsInDates,
  dayKey,
  dayStart,
  addDays,
  daysBetween,
  weekStartOf,
  weekDates,
};
