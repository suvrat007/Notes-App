const express = require('express');
const Habit = require('../models/habit.model.js');
const Log = require('../models/log.model.js');
const { authenticateToken } = require('../utilities.js');
const { rateLimit } = require('../lib/ratelimit.js');
const { periodStartOf, periodDays } = require('../lib/shortfall.js');
const e = require('../engine/stars.js');

const router = express.Router();
router.use(authenticateToken);

/** Today in UTC day-key form, or a caller-supplied one when back-filling. */
function resolveDate(raw) {
  const key = typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? raw
    : e.dayKey(new Date());
  return { key, at: e.dayStart(key) };
}

/** How many days back a user may fill in. Yesterday and the day before. */
const MAX_BACKFILL_DAYS = 2;

router.get('/', async (req, res) => {
  try {
    const habits = await Habit.find({ userId: req.userId, archived: false })
      .sort({ order: 1, createdAt: 1 });
    return res.json({ error: false, habits });
  } catch {
    return res.status(500).json({ error: true, message: 'Internal Server Error' });
  }
});

router.post('/', async (req, res) => {
  const {
    name, icon, polarity, starsPerRep, dailyAllowance, overagePenalty,
    freeWithinAllowance, dailyTarget, targetReps, targetPeriodWeeks, isRecurringTask,
    unit, shortfallPenalty,
  } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: true, message: 'Habit name is required' });
  }

  try {
    // A new habit joins the END of the manual order; it never jumps the queue.
    const order = await Habit.countDocuments({ userId: req.userId, archived: false });
    const habit = await Habit.create({
      userId: req.userId,
      name: String(name).trim(),
      icon, polarity, starsPerRep, dailyAllowance, overagePenalty,
      freeWithinAllowance, dailyTarget, targetReps, targetPeriodWeeks, isRecurringTask,
      unit, shortfallPenalty,
      order,
    });
    return res.json({ error: false, habit, message: 'Habit created' });
  } catch (err) {
    return res.status(400).json({ error: true, message: err.message || 'Could not create habit' });
  }
});

/** Change what a habit ASKS OF YOU. Its history is untouched. */
router.patch('/:habitId', async (req, res) => {
  const allowed = [
    'name', 'icon', 'starsPerRep', 'dailyAllowance', 'overagePenalty',
    'freeWithinAllowance', 'dailyTarget', 'targetReps', 'targetPeriodWeeks',
    'isRecurringTask', 'order', 'unit', 'shortfallPenalty',
  ];
  const patch = {};
  for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];

  /*
   * Polarity is deliberately NOT editable. A good habit's logs are earns and a
   * bad one's are penalties, so flipping it would silently rewrite what every
   * past entry meant.
   */
  try {
    const habit = await Habit.findOneAndUpdate(
      { _id: req.params.habitId, userId: req.userId },
      { $set: patch },
      { new: true, runValidators: true },
    );
    if (!habit) return res.status(404).json({ error: true, message: 'Habit not found' });
    return res.json({ error: false, habit, message: 'Habit updated' });
  } catch (err) {
    return res.status(400).json({ error: true, message: err.message || 'Could not update habit' });
  }
});

/** Archive, never delete: the ledger still references it. */
router.delete('/:habitId', async (req, res) => {
  try {
    const habit = await Habit.findOneAndUpdate(
      { _id: req.params.habitId, userId: req.userId },
      { $set: { archived: true } },
      { new: true },
    );
    if (!habit) return res.status(404).json({ error: true, message: 'Habit not found' });
    return res.json({ error: false, message: 'Habit archived. Its history is kept.' });
  } catch {
    return res.status(500).json({ error: true, message: 'Internal Server Error' });
  }
});

/**
 * Log one rep.
 *
 * The delta is computed HERE, from the habit's own terms and how many reps
 * already exist that day — never sent by the client. A bad habit's penalty
 * escalates past its allowance, so the count matters and a client-supplied
 * number would be a scoreboard anyone could edit.
 */
const logLimit = rateLimit({
  name: 'habit-log',
  limit: 40,
  windowMs: 60_000,
  message: 'That is a lot of taps in one minute. Take a breath and carry on.',
});

router.post('/:habitId/log', logLimit, async (req, res) => {
  const { key, at } = resolveDate(req.body.date);

  /*
   * A day AHEAD of this box is not the future, it is a different timezone.
   *
   * The caller sends its own calendar day. A user east of UTC is already on
   * tomorrow by the server's reckoning — in India that is every evening — and
   * rejecting it as a future date meant every rep logged after half past five
   * came back 400 while the card had already shown it as done. No timezone is
   * more than a day ahead, so one day of slack covers all of them.
   */
  const age = e.daysBetween(key, e.dayKey(new Date()));
  if (age < -1 || age > MAX_BACKFILL_DAYS) {
    return res.status(400).json({
      error: true,
      message: `You can only fill in the last ${MAX_BACKFILL_DAYS} days.`,
    });
  }

  try {
    const habit = await Habit.findOne({ _id: req.params.habitId, userId: req.userId });
    if (!habit) return res.status(404).json({ error: true, message: 'Habit not found' });

    /*
     * How much of it was done. A habit measured in kilometres is logged as
     * '4', not as four separate runs, so the amount rides on the log's count
     * and every total in the app sums it already.
     */
    const amount = Number.isFinite(Number(req.body.amount))
      ? Math.max(1, Math.min(10000, Math.round(Number(req.body.amount))))
      : 1;

    let starsDelta;
    if (habit.polarity === 'bad') {
      // Which slot this rep takes decides whether it is inside the allowance.
      const already = await Log.countDocuments({
        userId: req.userId, refId: habit._id, date: at,
      });
      starsDelta = e.badHabitRepDelta(habit, already);
    } else {
      /*
       * What the period already holds decides what these units are worth:
       * everything up to the goal pays in full, beyond it pays less. Read here
       * rather than sent by the client, which would be asking the tapper how
       * much they should be paid.
       */
      const pStart = periodStartOf(habit, key);
      const pDays = periodDays(habit, pStart);
      const rows = await Log.find({
        userId: req.userId,
        kind: 'habit',
        refId: habit._id,
        date: { $gte: e.dayStart(pDays[0]), $lte: e.dayStart(pDays[pDays.length - 1]) },
      }).lean();
      const doneInPeriod = rows.reduce((sum, r) => sum + (r.count || 1), 0);

      starsDelta = e.goodHabitDelta(habit, amount, doneInPeriod, pStart);
    }

    const log = await Log.create({
      userId: req.userId, kind: 'habit', refId: habit._id,
      date: at, count: amount, starsDelta,
    });

    return res.json({ error: false, log, starsDelta });
  } catch (err) {
    return res.status(400).json({ error: true, message: err.message || 'Could not log that' });
  }
});

/** Undo the most recent rep for a day. The only sanctioned delete. */
/**
 * Take units back off a day, newest first.
 *
 * A row is no longer one rep. Since a measured habit logs "4km" as a single
 * row of four, and a burst of taps is debounced into one row of five, deleting
 * the newest row removed everything it carried — one undo on a five-tap row
 * took the count from five to zero.
 *
 * So this decrements. A row is only deleted once nothing is left of it, and
 * its stars are reduced in proportion to what remains, which is exact for the
 * flat rates and close enough for the tapered one.
 */
router.delete('/:habitId/log', async (req, res) => {
  const { at } = resolveDate(req.query.date);
  const asked = Number(req.query.amount);
  let remaining = Number.isFinite(asked) ? Math.max(1, Math.round(asked)) : 1;

  try {
    const rows = await Log.find({
      userId: req.userId, refId: req.params.habitId, date: at,
    }).sort({ createdAt: -1 });

    if (rows.length === 0) {
      return res.status(404).json({ error: true, message: 'Nothing to undo' });
    }

    let removedStars = 0;
    let removedUnits = 0;

    for (const row of rows) {
      if (remaining <= 0) break;
      const have = Math.max(1, row.count || 1);
      const take = Math.min(have, remaining);

      if (take >= have) {
        removedStars += row.starsDelta;
        await Log.deleteOne({ _id: row._id });
      } else {
        const left = have - take;
        const keptStars = Math.round(row.starsDelta * (left / have));
        removedStars += row.starsDelta - keptStars;
        await Log.updateOne({ _id: row._id }, { count: left, starsDelta: keptStars });
      }

      removedUnits += take;
      remaining -= take;
    }

    return res.json({ error: false, removed: removedStars, units: removedUnits });
  } catch {
    return res.status(500).json({ error: true, message: 'Internal Server Error' });
  }
});


/**
 * Renegotiate this period's target.
 *
 * The week you actually had is not always the week you planned. Someone who
 * meant to run 8 and managed 5 because they spent the time skipping has not
 * failed the week, they have swapped its contents — and a tracker that calls
 * that a failure teaches people to stop telling it the truth.
 *
 * Only THIS period moves. The standing goal is untouched, so next week still
 * asks for the original number, and the change is kept with its reason so the
 * history says what happened rather than quietly reading as a hit target.
 */
router.patch('/:habitId/renegotiate', logLimit, async (req, res) => {
  const { periodStart, target, reason } = req.body;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart || '')) {
    return res.status(400).json({ error: true, message: 'A period start is required.' });
  }
  const next = Math.max(0, Math.round(Number(target)));
  if (!Number.isFinite(next)) {
    return res.status(400).json({ error: true, message: 'A new target is required.' });
  }

  try {
    const habit = await Habit.findOne({ _id: req.params.habitId, userId: req.userId });
    if (!habit) return res.status(404).json({ error: true, message: 'Habit not found' });

    const was = e.effectiveTarget(habit, periodStart);
    if (next > was) {
      return res.status(400).json({
        error: true,
        message: 'A renegotiated target can only be lower. Just do more to go higher.',
      });
    }

    habit.periodOverrides = (habit.periodOverrides || [])
      .filter((o) => o.periodStart !== periodStart);
    habit.periodOverrides.push({
      periodStart, target: next, was, reason: String(reason || '').slice(0, 140),
    });
    await habit.save();

    return res.json({ error: false, habit, was, target: next, message: 'Target adjusted for this period' });
  } catch (err) {
    return res.status(400).json({ error: true, message: err.message || 'Could not adjust that' });
  }
});

module.exports = router;
module.exports.MAX_BACKFILL_DAYS = MAX_BACKFILL_DAYS;
