const express = require('express');
const crypto = require('crypto');
const Habit = require('../models/habit.model.js');
const Task = require('../models/task.model.js');
const { authenticateToken } = require('../utilities.js');
const e = require('../engine/stars.js');

const router = express.Router();
router.use(authenticateToken);

/** How far ahead a repeating task materialises real rows. */
const GENERATE_AHEAD_DAYS = 62;

const STEP = { daily: 1, weekly: 7, monthly: 30 };

/**
 * Persist a manual order.
 *
 * Positions are rewritten as a dense 0..n-1 run in ONE pass, so a half-applied
 * reorder can never leave two rows claiming the same slot — which is what makes
 * a dragged list quietly re-sort itself on the next load.
 */
router.patch('/habits/order', async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : null;
  if (!ids) return res.status(400).json({ error: true, message: 'ids array required' });
  try {
    await Promise.all(ids.map((id, i) =>
      Habit.updateOne({ _id: id, userId: req.userId }, { $set: { order: i } })));
    return res.json({ error: false, message: 'Order saved' });
  } catch (err) {
    return res.status(400).json({ error: true, message: err.message || 'Could not save order' });
  }
});

router.patch('/tasks/order', async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : null;
  if (!ids) return res.status(400).json({ error: true, message: 'ids array required' });
  try {
    await Promise.all(ids.map((id, i) =>
      Task.updateOne({ _id: id, userId: req.userId }, { $set: { order: i } })));
    return res.json({ error: false, message: 'Order saved' });
  } catch (err) {
    return res.status(400).json({ error: true, message: err.message || 'Could not save order' });
  }
});

/**
 * Make a task repeat — or stop it.
 *
 * Occurrences are MATERIALISED as one row per date rather than computed from a
 * rule. The overdue sweep, per-day completion and the ledger are all day-keyed
 * already, and a rule-based model would mean rewriting all three to ask "does
 * this rule fire today" everywhere they currently ask "is there a row".
 */
router.patch('/tasks/:taskId/repeat', async (req, res) => {
  const horizon = ['once', 'daily', 'weekly', 'monthly'].includes(req.body.horizon)
    ? req.body.horizon
    : null;
  if (!horizon) {
    return res.status(400).json({ error: true, message: 'horizon must be once|daily|weekly|monthly' });
  }

  try {
    const task = await Task.findOne({ _id: req.params.taskId, userId: req.userId });
    if (!task) return res.status(404).json({ error: true, message: 'Task not found' });

    /* ---- stopping: tear down what has not happened yet ---- */
    if (horizon === 'once') {
      let removed = 0;
      if (task.seriesId) {
        const r = await Task.deleteMany({
          userId: req.userId,
          seriesId: task.seriesId,
          done: false,
          // Finished early means the FUTURE goes; the past is history and stays.
          targetDate: { $gt: task.targetDate },
        });
        removed = r.deletedCount;
      }
      task.horizon = 'once';
      task.seriesId = null;
      await task.save();
      return res.json({ error: false, removed, message: 'No longer repeating' });
    }

    /* ---- starting or changing: rebuild the future from this task ---- */
    if (task.seriesId) {
      await Task.deleteMany({
        userId: req.userId,
        seriesId: task.seriesId,
        done: false,
        targetDate: { $gt: task.targetDate },
      });
    }

    const seriesId = task.seriesId || crypto.randomUUID();
    task.horizon = horizon;
    task.seriesId = seriesId;
    await task.save();

    const startKey = e.dayKey(task.targetDate);
    const step = STEP[horizon];
    const copies = [];
    for (let d = step; d <= GENERATE_AHEAD_DAYS; d += step) {
      copies.push({
        userId: req.userId,
        title: task.title,
        type: task.type,
        targetCount: task.targetCount,
        doneCount: 0,
        baseReward: task.baseReward,
        penaltyIntensity: task.penaltyIntensity,
        dueTime: task.dueTime,
        targetDate: e.dayStart(e.addDays(startKey, d)),
        horizon,
        seriesId,
        order: task.order,
        done: false,
        missedHandled: false,
      });
    }
    if (copies.length) await Task.insertMany(copies);

    return res.json({
      error: false,
      created: copies.length,
      message: `Repeats ${horizon} — ${copies.length} upcoming`,
    });
  } catch (err) {
    return res.status(400).json({ error: true, message: err.message || 'Could not update repeat' });
  }
});

/**
 * Everything to manage, in one read.
 *
 * Repeating tasks collapse to their NEXT occurrence: listing all sixty-odd
 * materialised copies of a daily task would bury everything else, and Manage
 * is where you shape what repeats, not where you tick one day off.
 */
router.get('/', async (req, res) => {
  try {
    const today = e.dayKey(new Date());
    const [habits, tasks] = await Promise.all([
      Habit.find({ userId: req.userId, archived: false }).sort({ order: 1, createdAt: 1 }).lean(),
      Task.find({ userId: req.userId, targetDate: { $gte: e.dayStart(today) } })
        .sort({ targetDate: 1, order: 1 }).lean(),
    ]);

    const seen = new Set();
    const collapsed = [];
    for (const t of tasks) {
      if (t.seriesId) {
        if (seen.has(t.seriesId)) continue;
        seen.add(t.seriesId);
      }
      collapsed.push({
        ...t,
        date: e.dayKey(t.targetDate),
        // The editor reads dueKey; without it every task looked as though it
        // had no deadline, whatever was actually saved.
        dueKey: t.dueDate ? e.dayKey(t.dueDate) : null,
        upcoming: t.seriesId
          ? tasks.filter((x) => x.seriesId === t.seriesId).length
          : 1,
      });
    }

    return res.json({ error: false, habits, tasks: collapsed });
  } catch (err) {
    return res.status(500).json({ error: true, message: err.message || 'Internal Server Error' });
  }
});


/** Put a task on the roadmap, or take it off. */
router.patch('/tasks/:taskId/roadmap', async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.taskId, userId: req.userId });
    if (!task) return res.status(404).json({ error: true, message: 'Task not found' });
    task.onRoadmap = !task.onRoadmap;
    await task.save();
    return res.json({
      error: false,
      onRoadmap: task.onRoadmap,
      message: task.onRoadmap
        ? `"${task.title}" is on the roadmap`
        : `"${task.title}" is off the roadmap`,
    });
  } catch (err) {
    return res.status(400).json({ error: true, message: err.message || 'Could not update' });
  }
});

/**
 * Turn a task into a habit.
 *
 * Some things are only discovered to be habits after living with them for a
 * week. The task's history is NOT carried over: its ledger rows point at a
 * task id and re-pointing them would rewrite what those entries meant.
 */
router.post('/tasks/:taskId/to-habit', async (req, res) => {
  try {
    const task = await Task.findOne({ _id: req.params.taskId, userId: req.userId });
    if (!task) return res.status(404).json({ error: true, message: 'Task not found' });

    const order = await Habit.countDocuments({ userId: req.userId, archived: false });
    const habit = await Habit.create({
      userId: req.userId,
      name: task.title,
      polarity: task.type === 'avoid' ? 'bad' : 'good',
      starsPerRep: task.baseReward || 10,
      // A repeating task already stated how often; carry that as the goal.
      targetReps: task.horizon === 'daily' ? 7 : task.horizon === 'weekly' ? 1 : 0,
      targetPeriodWeeks: task.horizon === 'monthly' ? 4 : 1,
      order,
    });

    // The whole series goes, not just this occurrence — the habit replaces it.
    if (task.seriesId) {
      await Task.deleteMany({ userId: req.userId, seriesId: task.seriesId, done: false });
    } else {
      await Task.deleteOne({ _id: task._id, userId: req.userId });
    }

    return res.json({ error: false, habit, message: `"${habit.name}" is now a habit` });
  } catch (err) {
    return res.status(400).json({ error: true, message: err.message || 'Could not convert' });
  }
});

/** And back the other way. The habit is archived, so its history survives. */
router.post('/habits/:habitId/to-task', async (req, res) => {
  try {
    const habit = await Habit.findOne({ _id: req.params.habitId, userId: req.userId });
    if (!habit) return res.status(404).json({ error: true, message: 'Habit not found' });

    const order = await Task.countDocuments({ userId: req.userId });
    const task = await Task.create({
      userId: req.userId,
      title: habit.name,
      type: habit.polarity === 'bad' ? 'avoid' : 'occasional',
      baseReward: habit.starsPerRep,
      targetCount: 1,
      targetDate: e.dayStart(e.dayKey(new Date())),
      order,
    });

    habit.archived = true;
    await habit.save();

    return res.json({ error: false, task, message: `"${task.title}" is now a task` });
  } catch (err) {
    return res.status(400).json({ error: true, message: err.message || 'Could not convert' });
  }
});

module.exports = router;
