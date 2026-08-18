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
const { settleShortfalls, periodStartOf, periodDays } = require('../lib/shortfall.js');
const { normalise } = require('../lib/twins.js');
const Group = require('../models/group.model.js');
const { settleOverdue } = require('../lib/overdue.js');

const router = express.Router();
router.use(authenticateToken);

/** How far back an unfinished task keeps following you. */
const CARRY_OVER_DAYS = 14;

/**
 * What a task looks like on a given day.
 *
 * `doneToday` and `remainingToday` are computed here rather than in the browser
 * because the cadence rule is the whole point: a `daily` task allows one rep a
 * day no matter how many are still owed overall, so the control has to know
 * today's allowance and not just the total. A client working that out for
 * itself would be a second copy of the rule, free to disagree.
 */
function taskView(task, logs, dateKey) {
  /*
   * A task's row holds its RUNNING total, not that day's units, so today's
   * work is the difference between today's row and the best of the days
   * before it. Counting rows instead would call a five-day job "1 today"
   * forever.
   */
  const rows = logs.filter((l) => l.kind === 'task' && String(l.refId) === String(task._id));
  const before = rows
    .filter((l) => e.dayKey(l.date) < dateKey)
    .reduce((max, l) => Math.max(max, l.completedCount || 0), 0);
  const todayRow = rows.find((l) => e.dayKey(l.date) === dateKey);
  const doneToday = Math.max(0, (todayRow?.completedCount ?? before) - before);

  const remainingTotal = Math.max(0, (task.targetCount ?? 1) - (task.doneCount ?? 0));
  const perDayCap = task.repCadence === 'daily' ? 1 : remainingTotal;

  return {
    ...task,
    doneToday,
    // How many more this task will accept TODAY.
    remainingToday: Math.max(0, Math.min(perDayCap - doneToday, remainingTotal)),
    remainingTotal,
    // True when today's share is met but the task itself is not finished.
    doneForToday: task.repCadence === 'daily' && doneToday >= 1 && remainingTotal > 0,
    spansToDue: !!task.dueDate,
    dueKey: task.dueDate ? e.dayKey(task.dueDate) : null,
    daysLeft: task.dueDate ? e.daysBetween(dateKey, e.dayKey(task.dueDate)) : null,
  };
}

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

    /*
     * Closed goal periods are settled BEFORE anything is totalled, or a
     * shortfall charged this request would not appear in the figures the
     * same request returns.
     */
    const settled = await settleShortfalls(req.userId, todayKey);
    // A deadline nothing enforces is a suggestion.
    const missed = await settleOverdue(req.userId, todayKey);

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
    const ownTasks = await Task.find({ userId: req.userId, targetDate: activeDate })
      .sort({ order: 1, createdAt: 1 }).lean();

    /*
     * A task with a deadline belongs to EVERY day until that deadline.
     *
     * "Finish the report by Friday" entered on Monday used to appear on Monday
     * and then disappear, resurfacing only once it was late. It stays in front
     * of you for the whole window it was given, and leaves the moment it is
     * finished rather than when the calendar says so.
     */
    const spanningRaw = await Task.find({
      userId: req.userId,
      dueDate: { $gte: activeDate },
      targetDate: { $lt: activeDate },
      /*
       * Unfinished, or finished TODAY. Both are fetched and the second is
       * decided below: doneAt is a real instant in UTC while dateKey is the
       * CALLER's calendar day, and between local midnight and UTC midnight
       * those disagree — a task ticked at half past midnight in India has a
       * doneAt that sits before the day it belongs to.
       */
      $or: [{ done: false }, { doneAt: { $ne: null } }],
    }).sort({ dueDate: 1, order: 1 }).lean();

    const spanning = spanningRaw.filter(
      (t) => !t.done || e.dayKey(t.doneAt) === dateKey,
    );

    const dayTasks = [...ownTasks, ...spanning];
    const spanningIds = new Set(spanning.map((t) => String(t._id)));

    /*
     * Unfinished work does not stop being owed at midnight. Repeating tasks are
     * excluded because a daily task already has a fresh row waiting for today —
     * carrying yesterday's would show the same thing twice. So are tasks still
     * inside their own deadline, which are already listed above as today's.
     */
    const carriedRaw = await Task.find({
      userId: req.userId,
      done: false,
      seriesId: null,
      targetDate: { $gte: e.dayStart(e.addDays(dateKey, -CARRY_OVER_DAYS)), $lt: activeDate },
    }).sort({ targetDate: 1, order: 1 }).lean();

    const carried = carriedRaw.filter((t) => !spanningIds.has(String(t._id)));

    const lifetime = await lifetimeStarsFor(req.userId);

    /* ---- per-habit figures the UI would otherwise recompute wrongly ---- */
    const habitViews = habits.map((h) => {
      const repsToday = e.repsOn(logs, h._id, dateKey);

      /*
       * The habit's OWN period, not always the week.
       *
       * "Ten questions a month" is judged over its month; measuring it against
       * the current week would show 2/10 on a Monday and reset every seven
       * days, which is neither the goal that was set nor a number anyone can
       * act on.
       */
      const periodStart = periodStartOf(h, dateKey);
      const days = periodDays(h, periodStart);
      const doneThisPeriod = e.repsInDates(logs, h._id, days);
      const target = e.effectiveTarget(h, periodStart);

      return {
        ...h,
        repsToday,
        repsThisPeriod: doneThisPeriod,
        periodStart,
        periodEnd: days[days.length - 1],
        // Struck off once it is met, and it keeps counting past the target
        // because beating a goal should read as beating it.
        goalMet: target > 0 && doneThisPeriod >= target,
        overBy: target > 0 ? Math.max(0, doneThisPeriod - target) : 0,
        remainingInPeriod: target > 0 ? Math.max(0, target - doneThisPeriod) : 0,
        // What the NEXT tap will cost or earn, so the card never lies about it.
        // What the NEXT unit earns, AFTER the taper past the goal — so a card
        // sitting at three times its target says 0 instead of promising full
        // price for work that will not be paid for.
        nextDelta: h.polarity === 'bad'
          ? e.badHabitRepDelta(h, repsToday)
          : e.goodHabitDelta(h, 1, doneThisPeriod),
      };
    });

    /*
     * Which of these are the same promise made twice.
     *
     * A personal "gym 4 a week" and a crew's "gym 6 a week" are one activity,
     * and logging either credits both (see lib/twins.js). The UI has to say so
     * on the row, or a count moving on its own looks like a bug.
     */
    const byName = new Map();
    for (const v of habitViews) {
      const key = `${v.polarity}:${normalise(v.name)}`;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(v);
    }
    for (const group of byName.values()) {
      const own = group.find((x) => !x.groupId);
      const crew = group.find((x) => x.groupId);
      if (!own || !crew) continue;
      own.twin = { _id: crew._id, name: crew.name, crew: true, target: crew.targetReps };
      crew.twin = { _id: own._id, name: own.name, crew: false, target: own.targetReps };
    }

    /* ---- what the crews expect of you, named so the UI can group it ---- */
    const crewIds = [...new Set(habitViews.filter((h) => h.groupId).map((h) => String(h.groupId)))];
    const crewNames = crewIds.length
      ? Object.fromEntries(
          (await Group.find({ _id: { $in: crewIds } }).select('name').lean())
            .map((g) => [String(g._id), g.name]),
        )
      : {};

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
      /** Crew name per group id, so a crew row can say whose it is. */
      crewNames,
      settled,
      missed,
      tasks: dayTasks.map((t) => taskView(t, logs, dateKey)),
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
