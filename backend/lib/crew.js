const Group = require('../models/group.model.js');
const Task = require('../models/task.model.js');
const Log = require('../models/log.model.js');
const e = require('../engine/stars.js');
const crew = require('../engine/crew.js');

/**
 * Shared tasks, weekly standings, and paying out the podium.
 *
 * A shared task is NOT a new kind of thing to log. It is stamped out as an
 * ordinary Task on each member's own list, tagged with the group it came
 * from, so every existing path — the debounced counter, the stars engine,
 * carry-over, the roll animation — works on it unchanged. The alternative was
 * a parallel completion model, which would have meant reimplementing all of
 * that and keeping the two in step forever.
 */

/** Stamp one shared task onto one member's list. */
async function fanOutOne(group, shared, userId, dateKey) {
  return Task.create({
    userId,
    title: shared.title,
    type: shared.type,
    baseReward: shared.baseReward,
    targetCount: shared.targetCount,
    repCadence: shared.repCadence,
    targetDate: e.dayStart(dateKey),
    groupId: group._id,
    groupTaskId: shared._id,
  });
}

/** Give a shared task to everyone currently in the crew. */
async function fanOutToMembers(group, shared, dateKey) {
  return Promise.all(
    group.members.map((m) => fanOutOne(group, shared, m.userId, dateKey)),
  );
}

/** Give a new member every shared task the crew already has. */
async function fanOutToNewcomer(group, userId, dateKey) {
  return Promise.all(
    group.sharedTasks.map((s) => fanOutOne(group, s, userId, dateKey)),
  );
}

/**
 * Stars each member earned on this crew's tasks over a set of days.
 *
 * Read from the LEDGER rather than from the tasks themselves: a task row
 * holds only its current state, so it cannot say which week the work landed
 * in. The ledger can, which is what makes a weekly board possible at all.
 */
async function scoresFor(group, dayKeys) {
  const memberIds = group.members.map((m) => m.userId);

  const tasks = await Task.find({
    groupId: group._id,
    userId: { $in: memberIds },
  }).select('_id userId').lean();

  const owner = new Map(tasks.map((t) => [String(t._id), String(t.userId)]));

  const rows = await Log.find({
    kind: 'task',
    refId: { $in: tasks.map((t) => t._id) },
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

module.exports = {
  fanOutToMembers,
  fanOutToNewcomer,
  scoresFor,
  liveStandings,
  settlePodium,
  weekDays,
};
