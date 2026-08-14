const express = require('express');
const Habit = require('../models/habit.model.js');
const Task = require('../models/task.model.js');
const Reward = require('../models/reward.model.js');
const BreakDay = require('../models/breakday.model.js');
const User = require('../models/user.model.js');
const { authenticateToken } = require('../utilities.js');
const e = require('../engine/stars.js');
const rank = require('../engine/rank.js');
const { lifetimeStarsFor, logsInRange, weekBalanceOf } = require('../lib/totals.js');

const router = express.Router();
router.use(authenticateToken);

/** How far back an unfinished task keeps following you. */
const CARRY_OVER_DAYS = 14;

/**
 * Everything the dashboard needs for one day, in one round trip.
 *
 * The alternative is six requests that each re-authenticate, each re-read the
 * ledger, and arrive out of order — so the star total renders before the
 * habits it was computed from. One call keeps the screen internally consistent
 * and is the difference between a snappy dashboard and a flickering one.
 *
 * GET /state?date=YYYY-MM-DD  (defaults to today)
 */
router.get('/', async (req, res) => {
  try {
    const serverKey = e.dayKey(new Date());
    const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '')
      ? req.query.date
      : serverKey;

    /*
     * "Today" is whichever is later: this box's UTC day or the day the caller
     * says it is where they are. A server in UTC is still on yesterday until
     * 5:30am in India, and a ledger window that ends there would drop every
     * log the user has just made. Looking BACK at an older day keeps the real
     * today as the window's end, so the week's totals stay whole.
     */
    const todayKey = dateKey > serverKey ? dateKey : serverKey;

    const weekStartKey = e.weekStartOf(todayKey, 1);
    const activeDate = e.dayStart(dateKey);

    const [habits, rewards, user, breakDay] = await Promise.all([
      Habit.find({ userId: req.userId, archived: false }).sort({ order: 1, createdAt: 1 }).lean(),
      Reward.find({ userId: req.userId, archived: false }).sort({ createdAt: 1 }).lean(),
      User.findById(req.userId).lean(),
      BreakDay.findOne({ userId: req.userId, date: activeDate }).lean(),
    ]);

    // One wide read of the ledger, sliced below, rather than a query per figure.
    const windowStart = e.addDays(
      weekStartKey < dateKey ? weekStartKey : dateKey,
      -CARRY_OVER_DAYS,
    );
    const logs = await logsInRange(req.userId, windowStart, todayKey);

    /* ---- tasks: the day's own, plus what is still owed from before ---- */
    const dayTasks = await Task.find({ userId: req.userId, targetDate: activeDate })
      .sort({ order: 1, createdAt: 1 }).lean();

    /*
     * Unfinished work does not stop being owed at midnight. Repeating tasks are
     * excluded because a daily task already has a fresh row waiting for today —
     * carrying yesterday's would show the same thing twice.
     */
    const carried = await Task.find({
      userId: req.userId,
      done: false,
      seriesId: null,
      targetDate: { $gte: e.dayStart(e.addDays(dateKey, -CARRY_OVER_DAYS)), $lt: activeDate },
    }).sort({ targetDate: 1, order: 1 }).lean();

    const lifetime = await lifetimeStarsFor(req.userId);

    /* ---- per-habit figures the UI would otherwise recompute wrongly ---- */
    const habitViews = habits.map((h) => {
      const repsToday = e.repsOn(logs, h._id, dateKey);
      const periodDays = e.weekDates(weekStartKey);
      return {
        ...h,
        repsToday,
        repsThisPeriod: e.repsInDates(logs, h._id, periodDays),
        // What the NEXT tap will cost or earn, so the card never lies about it.
        nextDelta: h.polarity === 'bad'
          ? e.badHabitRepDelta(h, repsToday)
          : e.goodHabitDelta(h),
      };
    });

    return res.json({
      error: false,
      date: dateKey,
      today: todayKey,
      isBreakDay: !!breakDay,
      user: user && {
        _id: user._id, fullName: user.fullName, email: user.email,
        avatarUrl: user.avatarUrl,
      },
      habits: habitViews,
      tasks: dayTasks,
      carriedTasks: carried.map((t) => ({
        ...t,
        lateBy: e.daysBetween(e.dayKey(t.targetDate), dateKey),
      })),
      rewards: rewards.map((r) => ({
        _id: r._id, name: r.name, damagePct: r.damagePct,
        cost: e.rewardCost(lifetime, r.damagePct),
      })),
      stars: {
        lifetime,
        rank: rank.rankFor(lifetime),
        dayNet: e.dayNet(logs, dateKey),
        weekBalance: weekBalanceOf(logs, weekStartKey),
        weekStart: weekStartKey,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: true, message: err.message || 'Internal Server Error' });
  }
});

module.exports = router;
module.exports.CARRY_OVER_DAYS = CARRY_OVER_DAYS;
