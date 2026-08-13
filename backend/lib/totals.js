const mongoose = require('mongoose');
const Log = require('../models/log.model.js');
const e = require('../engine/stars.js');

/**
 * Totals, summed from the ledger rather than read from a counter.
 *
 * A stored balance is a number that can drift: one crashed request between
 * "write the log" and "increment the total" and the two disagree forever, with
 * no way to tell which is right. Summing the rows is slower and always true,
 * and these are a few thousand rows per user per year — Mongo does not care.
 */

/**
 * LIFETIME STARS — what rank is built on.
 *
 * Earning adds. Penalties do NOT subtract: missing a task or slipping on a bad
 * habit costs you the day, not the climb. Redeeming a reward is the deliberate
 * exception — it is meant to cost rank, which is the whole point of pricing
 * rewards as a share of this number.
 */
async function lifetimeStarsFor(userId) {
  const [row] = await Log.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(String(userId)) } },
    {
      $group: {
        _id: null,
        earned: { $sum: { $cond: [{ $gt: ['$starsDelta', 0] }, '$starsDelta', 0] } },
        spent: {
          $sum: { $cond: [{ $eq: ['$kind', 'redeem'] }, '$starsDelta', 0] },
        },
      },
    },
  ]);
  if (!row) return 0;
  // `spent` is already negative, so this subtracts.
  return Math.max(0, row.earned + row.spent);
}

/** Every log for a user between two day-keys, inclusive. */
async function logsInRange(userId, fromKey, toKey) {
  return Log.find({
    userId,
    date: { $gte: e.dayStart(fromKey), $lte: e.dayStart(toKey) },
  }).sort({ date: 1, createdAt: 1 }).lean();
}

/**
 * The running balance for a week — what a reward is actually paid from.
 *
 * Separate from lifetime on purpose: lifetime is the record of everything you
 * ever built, the week's balance is what you have to spend right now.
 */
function weekBalanceOf(logs, weekStartKey, opts = {}) {
  const days = e.weekDates(weekStartKey);
  return days.reduce((sum, d) => sum + e.dayNet(logs, d, opts), 0);
}

module.exports = { lifetimeStarsFor, logsInRange, weekBalanceOf };
