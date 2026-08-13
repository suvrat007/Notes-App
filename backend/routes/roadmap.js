const express = require('express');
const Habit = require('../models/habit.model.js');
const { authenticateToken } = require('../utilities.js');
const e = require('../engine/stars.js');
const rank = require('../engine/rank.js');
const { logsInRange, lifetimeStarsFor } = require('../lib/totals.js');

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
    const today = e.dayKey(new Date());
    const weekStart = e.weekStartOf(today, 1);
    const days = e.weekDates(weekStart);

    const [habits, logs, lifetime] = await Promise.all([
      Habit.find({ userId: req.userId, archived: false, polarity: 'good' })
        .sort({ order: 1, createdAt: 1 }).lean(),
      logsInRange(req.userId, weekStart, days[6]),
      lifetimeStarsFor(req.userId),
    ]);

    // How far through the week we are, by whole days lived including today.
    const elapsedDays = Math.min(7, e.daysBetween(weekStart, today) + 1);
    const elapsed = elapsedDays / 7;

    const nodes = habits
      .filter((h) => h.targetReps > 0)
      .map((h) => {
        const done = e.repsInDates(logs, h._id, days);
        const target = h.targetReps;
        // The pace line: what "on track" looks like at this point in the week.
        const expected = Math.round(target * elapsed * 10) / 10;
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
          target,
          done,
          remaining: Math.max(0, target - done),
          fill: Math.max(0, Math.min(1, done / target)),
          expected,
          /* Positive means ahead of pace. Rounded to one place, because
             "0.3 ahead" is a real distinction and "0.312" is noise. */
          aheadBy: Math.round((done - target * elapsed) * 10) / 10,
          onTrack: done >= expected,
          perDay,
          daysLeft: Math.max(0, 7 - elapsedDays),
          starsIfFinished: Math.max(0, target - done) * h.starsPerRep,
        };
      });

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
