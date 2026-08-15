const Habit = require('../models/habit.model.js');
const Log = require('../models/log.model.js');
const e = require('../engine/stars.js');

/**
 * Settle goal periods that have closed short.
 *
 * "Run 10km this week" is a promise with a deadline, and a promise with no
 * consequence for breaking it is a wish. When a period ends, whatever was
 * missing is charged once, at the habit's own rate per missing unit — so nine
 * of ten kilometres costs a tenth of what none does.
 *
 * Runs on READ rather than on a timer. A cron job would need a scheduler this
 * deployment does not have, and would settle periods for people who have not
 * opened the app in a month; doing it when the dashboard loads means the
 * charge appears exactly when someone is there to see it.
 *
 * `lastShortfallPeriod` records the last period start already settled, so a
 * second pass can never bill the same week twice.
 */

/** The first day of the period containing `dateKey`, for a habit's period length. */
function periodStartOf(habit, dateKey, weekStartDay = 1) {
  const weeks = Math.max(1, habit.targetPeriodWeeks || 1);
  const thisWeek = e.weekStartOf(dateKey, weekStartDay);
  if (weeks === 1) return thisWeek;

  /*
   * Longer periods are counted in whole weeks from a fixed epoch, so a
   * four-week goal always lands on the same boundaries no matter which day it
   * happens to be read on. Anchoring to the habit's creation instead would
   * make every habit's month start somewhere different.
   */
  const EPOCH = '2024-01-01'; // a Monday
  const weeksSince = Math.floor(e.daysBetween(EPOCH, thisWeek) / 7);
  const blocks = Math.floor(weeksSince / weeks);
  return e.addDays(EPOCH, blocks * weeks * 7);
}

/** Every day in the period starting at `startKey`. */
function periodDays(habit, startKey) {
  const weeks = Math.max(1, habit.targetPeriodWeeks || 1);
  const days = [];
  for (let i = 0; i < weeks * 7; i++) days.push(e.addDays(startKey, i));
  return days;
}

/**
 * Charge any goal period that finished short before `todayKey`.
 *
 * Only the period immediately before the current one is considered: someone
 * returning after two months should not be met with eight weeks of penalties
 * for a goal they had already stopped thinking about.
 */
async function settleShortfalls(userId, todayKey) {
  const habits = await Habit.find({
    userId,
    archived: false,
    polarity: 'good',
    // A goal is a goal: any habit with one is judged when its period closes.
    targetReps: { $gt: 0 },
  }).lean();

  if (habits.length === 0) return [];

  const charged = [];

  for (const habit of habits) {
    const currentStart = periodStartOf(habit, todayKey);
    const weeks = Math.max(1, habit.targetPeriodWeeks || 1);
    const lastStart = e.addDays(currentStart, -weeks * 7);

    // Already settled, or the habit is younger than the period being judged.
    if (habit.lastShortfallPeriod === lastStart) continue;
    if (e.dayKey(habit.createdAt) > lastStart) {
      await Habit.updateOne({ _id: habit._id }, { lastShortfallPeriod: lastStart });
      continue;
    }

    const days = periodDays(habit, lastStart);
    const rows = await Log.find({
      userId,
      kind: 'habit',
      refId: habit._id,
      date: { $gte: e.dayStart(days[0]), $lte: e.dayStart(days[days.length - 1]) },
    }).lean();

    const achieved = rows.reduce((sum, r) => sum + (r.count || 1), 0);
    const delta = e.shortfallDelta(habit, achieved, lastStart);

    if (delta < 0) {
      await Log.create({
        userId,
        kind: 'habit',
        refId: habit._id,
        // Dated to the last day of the period it judges, so the ledger reads
        // in the order things actually happened.
        date: e.dayStart(days[days.length - 1]),
        count: 0,
        starsDelta: delta,
      });
      charged.push({
        habitId: habit._id,
        name: habit.name,
        period: lastStart,
        target: habit.targetReps,
        achieved,
        starsDelta: delta,
      });
    }

    await Habit.updateOne({ _id: habit._id }, { lastShortfallPeriod: lastStart });
  }

  return charged;
}

module.exports = { settleShortfalls, periodStartOf, periodDays };
