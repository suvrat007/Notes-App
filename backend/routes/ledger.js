const express = require('express');
const Log = require('../models/log.model.js');
const Habit = require('../models/habit.model.js');
const Task = require('../models/task.model.js');
const Reward = require('../models/reward.model.js');
const { authenticateToken } = require('../utilities.js');
const e = require('../engine/stars.js');
const { lifetimeStarsFor } = require('../lib/totals.js');

const router = express.Router();
router.use(authenticateToken);

const KIND_LABEL = {
  habit: 'Habit',
  task: 'Task',
  redeem: 'Reward',
  'missed-task': 'Missed',
};

/**
 * The ledger itself: every star, and where it came from.
 *
 * This is the one screen that shows the raw truth rather than a summary. Every
 * total elsewhere in the app is a sum over exactly these rows, so if a number
 * ever looks wrong, this is the page that says why.
 */
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(500, Math.max(20, Number(req.query.limit) || 200));

    const logs = await Log.find({ userId: req.userId })
      .sort({ date: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    // Resolve the names in bulk rather than per row.
    const [habits, tasks, rewards] = await Promise.all([
      Habit.find({ userId: req.userId }).select('name polarity').lean(),
      Task.find({ userId: req.userId }).select('title').lean(),
      Reward.find({ userId: req.userId }).select('name').lean(),
    ]);
    const names = new Map();
    for (const h of habits) names.set(String(h._id), h.name);
    for (const t of tasks) names.set(String(t._id), t.title);
    for (const r of rewards) names.set(String(r._id), r.name);

    const entries = logs.map((l) => ({
      _id: l._id,
      date: e.dayKey(l.date),
      kind: l.kind,
      kindLabel: KIND_LABEL[l.kind] ?? l.kind,
      // A deleted habit still has history; saying so beats a blank row.
      name: names.get(String(l.refId)) ?? 'Removed',
      count: l.count || 1,
      starsDelta: l.starsDelta,
    }));

    const earned = entries.reduce((s, x) => (x.starsDelta > 0 ? s + x.starsDelta : s), 0);
    const lost = entries.reduce((s, x) => (x.starsDelta < 0 ? s + x.starsDelta : s), 0);

    return res.json({
      error: false,
      entries,
      totals: {
        earned,
        lost,
        net: earned + lost,
        lifetime: await lifetimeStarsFor(req.userId),
        count: entries.length,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: true, message: err.message || 'Internal Server Error' });
  }
});

module.exports = router;
