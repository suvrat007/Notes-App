const Group = require('../models/group.model.js');
const Task = require('../models/task.model.js');
const Habit = require('../models/habit.model.js');
const Log = require('../models/log.model.js');
const e = require('../engine/stars.js');
const crew = require('../engine/crew.js');

/**
 * Shared assignments, weekly standings, and paying out the podium.
 *
 * A shared item is NOT a new kind of thing to log. It is stamped out as an
 * ordinary Habit or Task on each member's own list, tagged with the crew it
 * came from. That one decision is what makes the whole feature disappear into
 * the app: crew work shows on Home, counts on the Roadmap, appears on the
 * Calendar, settles its own weekly shortfall and answers to voice, because it
 * IS a habit and IS a task — not a copy of one kept in step by hand.
 */

/** Stamp one shared item onto one member's list. */
async function fanOutOne(group, item, userId, dateKey) {
  if (item.kind === 'task') {
    return Task.create({
      userId,
      title: item.title,
      type: item.type,
      baseReward: item.baseReward,
      targetCount: item.targetCount,
      repCadence: item.repCadence,
      targetDate: e.dayStart(dateKey),
      groupId: group._id,
      groupItemId: item._id,
    });
  }

  return Habit.create({
    userId,
    name: item.title,
    polarity: item.polarity,
    starsPerRep: item.starsPerRep,
    dailyTarget: item.dailyTarget,
    targetReps: item.targetReps,
    targetPeriodWeeks: item.targetPeriodWeeks,
    unit: item.unit,
    dailyAllowance: item.dailyAllowance,
    overagePenalty: item.overagePenalty,
    freeWithinAllowance: item.freeWithinAllowance,
    shortfallPenalty: item.shortfallPenalty,
    groupId: group._id,
    groupItemId: item._id,
  });
}

/** Give a shared item to everyone currently in the crew. */
async function fanOutToMembers(group, item, dateKey) {
  return Promise.all(
    group.members.map((m) => fanOutOne(group, item, m.userId, dateKey)),
  );
}

/**
 * Give a new member everything the crew already agreed to.
 *
 * Without this a newcomer is scored on a board they have no way of climbing.
 */
async function fanOutToNewcomer(group, userId, dateKey) {
  return Promise.all(
    group.sharedItems.map((s) => fanOutOne(group, s, userId, dateKey)),
  );
}

/**
 * Stars each member earned on this crew's assignment over a set of days.
 *
 * Read from the LEDGER rather than from the habits and tasks themselves: a
 * row holds only its current state, so it cannot say which week the work
 * landed in. The ledger can, which is what makes a weekly board possible.
 *
 * Both kinds are counted, and penalties count too — a crew that agreed to
 * stop smoking should see a slip cost the person who slipped, or the "no
 * smoking" line is decoration.
 */
async function scoresFor(group, dayKeys) {
  const memberIds = group.members.map((m) => m.userId);

  const [tasks, habits] = await Promise.all([
    Task.find({ groupId: group._id, userId: { $in: memberIds } }).select('_id userId').lean(),
    Habit.find({ groupId: group._id, userId: { $in: memberIds } }).select('_id userId').lean(),
  ]);

  const owner = new Map([
    ...tasks.map((t) => [String(t._id), String(t.userId)]),
    ...habits.map((h) => [String(h._id), String(h.userId)]),
  ]);

  const rows = await Log.find({
    kind: { $in: ['task', 'habit'] },
    refId: { $in: [...tasks.map((t) => t._id), ...habits.map((h) => h._id)] },
    date: {
      $gte: e.dayStart(dayKeys[0]),
      $lte: e.dayStart(dayKeys[dayKeys.length - 1]),
    },
  }).lean();

  const tally = new Map(memberIds.map((id) => [String(id), 0]));
  for (const r of rows) {
    const uid = owner.get(String(r.refId));
    if (uid === undefined) continue;
    tally.set(uid, (tally.get(uid) || 0) + (r.starsDelta || 0));
  }

  /*
   * Clamped at zero for the board only. A bad week should cost stars — and it
   * does, in the ledger — but a NEGATIVE leaderboard position is meaningless,
   * and being ranked below someone who has not started is not information.
   */
  return memberIds.map((id) => ({
    userId: String(id),
    stars: Math.max(0, tally.get(String(id)) || 0),
  }));
}

/** The seven days of the week beginning `weekStartKey`. */
const weekDays = (weekStartKey) =>
  Array.from({ length: 7 }, (_, i) => e.addDays(weekStartKey, i));

/** This week's live board, in finishing order. */
async function liveStandings(group, todayKey) {
  const weekStart = e.weekStartOf(todayKey, 1);
  const scores = await scoresFor(group, weekDays(weekStart));
  return { weekStart, ranked: crew.standings(scores) };
}

/**
 * Pay out any week that has closed since anyone last looked.
 *
 * Runs on read, like the shortfall settlement it sits beside, and for the
 * same reason: there is no scheduler in this deployment, and a payout nobody
 * is present to see is a payout nobody enjoys.
 *
 * Only the week immediately before the current one is ever settled. Someone
 * returning after a month should not be handed four weeks of back pay for
 * contests they were not part of.
 */
async function settlePodium(group, todayKey) {
  const thisWeek = e.weekStartOf(todayKey, 1);
  const lastWeek = e.addDays(thisWeek, -7);

  if (group.lastPodiumWeek === lastWeek) return [];
  // A crew younger than the week being judged never competed in it.
  if (e.dayKey(group.createdAt) > lastWeek) {
    await Group.updateOne({ _id: group._id }, { lastPodiumWeek: lastWeek });
    return [];
  }

  const scores = await scoresFor(group, weekDays(lastWeek));
  const ranked = crew.standings(scores);
  const awards = crew.podiumAwards(ranked, group.members.length);

  /*
   * Claim the week BEFORE writing any stars. Two tabs opening at once would
   * otherwise both read "not settled" and both pay; losing a payout to a
   * clash is recoverable, paying twice is not.
   */
  const claim = await Group.updateOne(
    { _id: group._id, lastPodiumWeek: group.lastPodiumWeek ?? null },
    { lastPodiumWeek: lastWeek },
  );
  if (claim.modifiedCount === 0) return [];

  const endOfWeek = e.dayStart(e.addDays(lastWeek, 6));

  for (const a of awards) {
    await Log.create({
      userId: a.userId,
      kind: 'crew-podium',
      refId: group._id,
      // Dated to the last day of the week it judges, so the ledger reads in
      // the order things actually happened.
      date: endOfWeek,
      count: 0,
      starsDelta: a.award,
    });
  }

  return awards.map((a) => ({ ...a, groupId: group._id, name: group.name, week: lastWeek }));
}

/**
 * Detach one member's copies of a shared item, or remove them outright.
 *
 * Untouched copies go; anything with history is cut loose from the crew and
 * stays on the member's list as ordinary work. Deleting something a member
 * already earned stars for would take those stars back, and the ledger rows
 * would point at a habit that no longer exists.
 */
async function releaseItem(itemId, filter = {}) {
  await Promise.all([
    Task.deleteMany({ ...filter, groupItemId: itemId, doneCount: 0 }),
    Habit.deleteMany({ ...filter, groupItemId: itemId, lastShortfallPeriod: null, archived: false,
      _id: { $nin: await Log.distinct('refId', { kind: 'habit' }) } }),
  ]);
  await Promise.all([
    Task.updateMany({ ...filter, groupItemId: itemId }, { groupId: null, groupItemId: null }),
    Habit.updateMany({ ...filter, groupItemId: itemId }, { groupId: null, groupItemId: null }),
  ]);
}

module.exports = {
  fanOutToMembers,
  fanOutToNewcomer,
  scoresFor,
  liveStandings,
  settlePodium,
  releaseItem,
  weekDays,
};
