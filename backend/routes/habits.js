const express = require('express');
const Habit = require('../models/habit.model.js');
const Log = require('../models/log.model.js');
const { authenticateToken } = require('../utilities.js');
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
    'isRecurringTask', 'order',
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
router.post('/:habitId/log', async (req, res) => {
  const { key, at } = resolveDate(req.body.date);

  const age = e.daysBetween(key, e.dayKey(new Date()));
  if (age < 0 || age > MAX_BACKFILL_DAYS) {
    return res.status(400).json({
      error: true,
      message: `You can only fill in the last ${MAX_BACKFILL_DAYS} days.`,
    });
  }

  try {
    const habit = await Habit.findOne({ _id: req.params.habitId, userId: req.userId });
    if (!habit) return res.status(404).json({ error: true, message: 'Habit not found' });

    let starsDelta;
    if (habit.polarity === 'bad') {
      // Which slot this rep takes decides whether it is inside the allowance.
      const already = await Log.countDocuments({
        userId: req.userId, refId: habit._id, date: at,
      });
      starsDelta = e.badHabitRepDelta(habit, already);
    } else {
      starsDelta = e.goodHabitDelta(habit);
    }

    const log = await Log.create({
      userId: req.userId, kind: 'habit', refId: habit._id,
      date: at, count: 1, starsDelta,
    });

    return res.json({ error: false, log, starsDelta });
  } catch (err) {
    return res.status(400).json({ error: true, message: err.message || 'Could not log that' });
  }
});

/** Undo the most recent rep for a day. The only sanctioned delete. */
router.delete('/:habitId/log', async (req, res) => {
  const { at } = resolveDate(req.query.date);
  try {
    const last = await Log.findOne({
      userId: req.userId, refId: req.params.habitId, date: at,
    }).sort({ createdAt: -1 });

    if (!last) return res.status(404).json({ error: true, message: 'Nothing to undo' });
    await Log.deleteOne({ _id: last._id });
    return res.json({ error: false, removed: last.starsDelta });
  } catch {
    return res.status(500).json({ error: true, message: 'Internal Server Error' });
  }
});

module.exports = router;
module.exports.MAX_BACKFILL_DAYS = MAX_BACKFILL_DAYS;
