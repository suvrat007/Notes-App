const express = require('express');
const Habit = require('../models/habit.model.js');
const { authenticateToken } = require('../utilities.js');
const e = require('../engine/stars.js');
const a = require('../engine/analytics.js');
const { logsInRange } = require('../lib/totals.js');

const router = express.Router();
router.use(authenticateToken);

/** A phone fits ~12 weeks of heatmap cells; a desktop column fits far more. */
const HEATMAP_WEEKS = 26;

/**
 * Everything the stats screen draws, computed from the ledger.
 *
 * GET /stats?range=day|week|month
 *
 * The client gets rows it can hand straight to a chart. Sending it raw logs and
 * asking it to aggregate would mean two implementations of the same maths that
 * are free to disagree — and the one on the server is the one that matches the
 * database.
 */
router.get('/', async (req, res) => {
  try {
    const range = ['day', 'week', 'month'].includes(req.query.range) ? req.query.range : 'day';
    // The caller's calendar day wins: a UTC server is still on yesterday
    // until the morning in India, and would draw the wrong week.
    const serverKey = e.dayKey(new Date());
    const today = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '')
      ? req.query.date
      : serverKey;
    const weekStart = e.weekStartOf(today, 1);

    // One wide read; every series below is a slice of it.
    const logs = await logsInRange(req.userId, e.addDays(today, -365), today);
    const habits = await Habit.find({ userId: req.userId }).lean();
    const byId = new Map(habits.map((h) => [String(h._id), h]));

    /* ---- this week, day by day ---- */
    const weekDays = e.weekDates(weekStart);
    const week = a.starsPerDay(logs, weekDays).map((p) => ({
      ...p,
      label: new Date(`${p.date}T00:00:00Z`).toLocaleDateString('en-US', {
        weekday: 'short', timeZone: 'UTC',
      }),
    }));

    /* ---- the climb, bucketed so the axis stays readable ---- */
    const span = range === 'day' ? 30 : range === 'week' ? 120 : 365;
    const spanDays = Array.from({ length: span }, (_, i) => e.addDays(today, -(span - 1 - i)));
    const bucket = range === 'day' ? 1 : range === 'week' ? 7 : 30;
    const cumulative = a.cumulativeLifetime(logs, spanDays);
    const climb = [];
    for (let i = 0; i < cumulative.length; i += bucket) {
      const slice = cumulative.slice(i, i + bucket);
      // A cumulative series takes its bucket's LAST value, never a sum.
      const last = slice[slice.length - 1];
      climb.push({ date: slice[0].date, value: last.value, label: slice[0].date.slice(5) });
    }

    /* ---- per habit: net stars, reps, and the streak ---- */
    const heatDays = Array.from({ length: HEATMAP_WEEKS * 7 },
      (_, i) => e.addDays(today, -(HEATMAP_WEEKS * 7 - 1 - i)));

    const perHabit = a.perHabitStats(logs).map((s) => {
      const h = byId.get(s.refId);
      return {
        refId: s.refId,
        name: h?.name ?? 'Archived habit',
        polarity: h?.polarity ?? 'good',
        net: s.net,
        reps: s.reps,
        streak: h
          ? a.habitStreak(logs, s.refId, heatDays, h.targetReps, h.targetPeriodWeeks)
          : { current: 0, record: 0 },
      };
    });

    /* ---- heatmap for one habit, or for every day's net when none is named ---- */
    const heatFor = req.query.habit && byId.has(req.query.habit) ? req.query.habit : null;
    const heat = heatFor
      ? a.repsPerDay(logs, heatFor, heatDays)
      : a.starsPerDay(logs, heatDays);

    return res.json({
      error: false,
      range,
      week,
      climb,
      perHabit,
      heat,
      heatHabit: heatFor,
      habits: habits.filter((h) => !h.archived)
        .map((h) => ({ _id: h._id, name: h.name, polarity: h.polarity })),
    });
  } catch (err) {
    return res.status(500).json({ error: true, message: err.message || 'Internal Server Error' });
  }
});

module.exports = router;
