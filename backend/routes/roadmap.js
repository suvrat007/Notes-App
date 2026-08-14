const express = require('express');
const Habit = require('../models/habit.model.js');
const Task = require('../models/task.model.js');
const { authenticateToken } = require('../utilities.js');
const e = require('../engine/stars.js');
const rank = require('../engine/rank.js');
const { logsInRange, lifetimeStarsFor } = require('../lib/totals.js');
const { periodStartOf, periodDays } = require('../lib/shortfall.js');

const router = express.Router();
router.use(authenticateToken);

/**
 * THE ROADMAP — the week as something you can win.
 *
 * A habit with a goal is a promise with a deadline, and the only two numbers
 * that matter are "how much have I done" and "how much SHOULD I have done by
 * now". Showing the first without the second is how someone reaches Sunday
 * with five sessions left and no idea it was coming.
 */
router.get('/', async (req, res) => {
  try {
    // The caller's calendar day wins: a UTC server is still on yesterday
    // until the morning in India, and would draw the wrong week.
    const serverKey = e.dayKey(new Date());
    const today = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '')
      ? req.query.date
      : serverKey;
    const weekStart = e.weekStartOf(today, 1);
    const days = e.weekDates(weekStart);

    const [habits, roadTasks, logs, lifetime] = await Promise.all([
      Habit.find({ userId: req.userId, archived: false, polarity: 'good' })
        .sort({ order: 1, createdAt: 1 }).lean(),
      Task.find({ userId: req.userId, onRoadmap: true }).sort({ order: 1 }).lean(),
      // Wide enough for the longest goal period in play, not just this week.
      logsInRange(req.userId, e.addDays(weekStart, -84), days[6]),
      lifetimeStarsFor(req.userId),
    ]);

    // How far through the week we are, by whole days lived including today.
    const elapsedDays = Math.min(7, e.daysBetween(weekStart, today) + 1);
    const elapsed = elapsedDays / 7;

    let nodes = habits
      .filter((h) => h.targetReps > 0)
      .map((h) => {
        /*
         * Each goal is judged over ITS OWN period.
         *
         * "Ten questions a month" measured against this week would read 2/10
         * every Monday and reset each Sunday — a number that is never true and
         * never actionable. The pace line stretches over the same span, so a
         * monthly goal is only "behind" if it is behind for the month.
         */
        const pStart = periodStartOf(h, today);
        const pDays = periodDays(h, pStart);
        const pLength = pDays.length;
        const pElapsedDays = Math.min(pLength, e.daysBetween(pStart, today) + 1);
        const pElapsed = pElapsedDays / pLength;

        const done = e.repsInDates(logs, h._id, pDays);
        const target = e.effectiveTarget(h);
        const expected = Math.round(target * pElapsed * 10) / 10;

        // The strip is always the current WEEK, whatever the period: seven
        // boxes is a shape people can read, thirty is a smear.
        const perDay = days.map((d) => ({
          date: d,
          reps: e.repsOn(logs, h._id, d),
          isToday: d === today,
          isFuture: d > today,
        }));

        return {
          _id: h._id,
          name: h.name,
          starsPerRep: h.starsPerRep,
          unit: h.unit || '',
          periodWeeks: Math.max(1, h.targetPeriodWeeks || 1),
          periodStart: pStart,
          periodEnd: pDays[pLength - 1],
          target,
          done,
          remaining: Math.max(0, target - done),
          fill: Math.max(0, Math.min(1, done / target)),
          // Met goals are struck off rather than removed, and beating one
          // reads as beating it instead of silently capping at 100%.
          met: done >= target,
          overBy: Math.max(0, done - target),
          expected,
          /* Positive means ahead of pace. Rounded to one place, because
             "0.3 ahead" is a real distinction and "0.312" is noise. */
          aheadBy: Math.round((done - target * pElapsed) * 10) / 10,
          onTrack: done >= expected,
          perDay,
          daysLeft: Math.max(0, pLength - pElapsedDays),
          starsIfFinished: Math.max(0, target - done) * h.starsPerRep,
          // What stopping here would cost when the period closes.
          shortfallIfStopped: e.shortfallDelta(h, done),
        };
      });

    /*
     * Tasks the user put on the roadmap.
     *
     * "Go to the gym, once a week" is the same promise as a habit with a goal
     * of 1 — just written as a task. Counting the week's OCCURRENCES of the
     * series is what makes it a track: how many landed, out of how many the
     * repeat schedules in a week.
     */
    const bySeries = new Map();
    for (const t of roadTasks) {
      const key = t.seriesId || String(t._id);
      if (!bySeries.has(key)) bySeries.set(key, []);
      bySeries.get(key).push(t);
    }

    const weekSet = new Set(days);
    const taskNodes = [...bySeries.values()].map((group) => {
      const head = group[0];
      const thisWeek = group.filter((t) => weekSet.has(e.dayKey(t.targetDate)));
      const target = Math.max(1, thisWeek.length);
      const done = thisWeek.filter((t) => t.done).length;
      const expected = Math.round(target * elapsed * 10) / 10;

      return {
        _id: String(head._id),
        name: head.title,
        isTask: true,
        starsPerRep: head.baseReward,
        target,
        done,
        remaining: Math.max(0, target - done),
        fill: Math.max(0, Math.min(1, done / target)),
        expected,
        met: done >= target,
        overBy: Math.max(0, done - target),
        aheadBy: Math.round((done - target * elapsed) * 10) / 10,
        onTrack: done >= expected,
        perDay: days.map((d) => ({
          date: d,
          reps: thisWeek.filter((t) => e.dayKey(t.targetDate) === d && t.done).length,
          isToday: d === today,
          isFuture: d > today,
        })),
        daysLeft: Math.max(0, 7 - elapsedDays),
        starsIfFinished: Math.max(0, target - done) * head.baseReward,
      };
    });

    nodes.push(...taskNodes);

    const totalTarget = nodes.reduce((s, n) => s + n.target, 0);
    const totalDone = nodes.reduce((s, n) => s + n.done, 0);

    return res.json({
      error: false,
      weekStart,
      today,
      elapsedDays,
      daysLeft: Math.max(0, 7 - elapsedDays),
      nodes,
      summary: {
        target: totalTarget,
        done: totalDone,
        fill: totalTarget === 0 ? 0 : Math.min(1, totalDone / totalTarget),
        onTrack: nodes.length > 0 && nodes.every((n) => n.onTrack),
        // What finishing every goal is worth, so the week has a visible prize.
        starsOnTheTable: nodes.reduce((s, n) => s + n.starsIfFinished, 0),
      },
      rank: rank.rankFor(lifetime),
      lifetime,
    });
  } catch (err) {
    return res.status(500).json({ error: true, message: err.message || 'Internal Server Error' });
  }
});

module.exports = router;
