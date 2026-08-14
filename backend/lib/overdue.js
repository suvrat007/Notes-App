const Task = require('../models/task.model.js');
const Log = require('../models/log.model.js');
const e = require('../engine/stars.js');

/**
 * Charge for work that ran out of time.
 *
 * A deadline nothing enforces is a suggestion. When a task's last day has
 * passed unfinished, the stars it would have paid are taken instead — once,
 * and never again for the same task.
 *
 * The charge is PROPORTIONAL to what is still outstanding: a task four fifths
 * finished costs a fifth of what an untouched one does. Someone who nearly got
 * there is not treated the same as someone who never started, which is the
 * difference between a penalty that teaches and one that just punishes.
 *
 * Penalties do not touch lifetime stars, so a missed deadline costs the day
 * and the week without erasing work that was genuinely done months ago.
 */

/** How far back to look. Beyond this, a return after a long absence would
 *  otherwise open with a wall of charges for things long forgotten. */
const MAX_LOOKBACK_DAYS = 14;

/** The last day a task had. Its deadline when it has one, else its own day. */
function lastDayOf(task) {
  return e.dayKey(task.dueDate || task.targetDate);
}

async function settleOverdue(userId, todayKey) {
  const floor = e.dayStart(e.addDays(todayKey, -MAX_LOOKBACK_DAYS));
  const startOfToday = e.dayStart(todayKey);

  /*
   * Anything unfinished whose day is behind us. A repeating task's occurrences
   * are separate rows with their own dates, so each is judged on its own.
   */
  const candidates = await Task.find({
    userId,
    done: false,
    missedHandled: false,
    type: { $in: ['daily', 'occasional'] },
    targetDate: { $gte: floor, $lt: startOfToday },
  }).lean();

  if (candidates.length === 0) return [];

  const charged = [];

  for (const task of candidates) {
    const last = lastDayOf(task);
    // Still inside its deadline: it has not missed anything yet.
    if (last >= todayKey) continue;

    const target = Math.max(1, task.targetCount || 1);
    const doneCount = Math.min(target, task.doneCount || 0);
    const outstanding = (target - doneCount) / target;

    const full = e.missedTaskDelta(task);
    const delta = -Math.round(Math.abs(full) * outstanding);

    if (delta < 0) {
      await Log.create({
        userId,
        kind: 'missed-task',
        refId: task._id,
        taskId: task._id,
        // Dated to the day it was actually missed, so the ledger reads in the
        // order things happened rather than all landing on today.
        date: e.dayStart(last),
        count: 0,
        starsDelta: delta,
      });
      charged.push({
        taskId: task._id,
        title: task.title,
        due: last,
        done: doneCount,
        target,
        starsDelta: delta,
      });
    }

    // Marked either way: a task finished in full owes nothing, and must not be
    // reconsidered on every load for the rest of the fortnight.
    await Task.updateOne({ _id: task._id }, { missedHandled: true });
  }

  return charged;
}

module.exports = { settleOverdue, MAX_LOOKBACK_DAYS, lastDayOf };
