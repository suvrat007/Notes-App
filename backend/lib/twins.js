const Habit = require('../models/habit.model.js');
const Log = require('../models/log.model.js');
const e = require('../engine/stars.js');

/**
 * The same real-world act, promised twice.
 *
 * You commit to the gym four times a week. Your crew commits to six. Those are
 * two different promises but ONE activity — when you go, you have gone for
 * both, and having to tap two rows to say so is a lie about what happened.
 *
 * A twin is a personal habit and a crew habit that name the same thing. The
 * name is the identity of a habit, so matching on a normalised name is the
 * honest test; anything cleverer would be guessing at intent.
 */

/** "  Gym!! " and "gym" are the same promise. */
const normalise = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * The counterpart of `habit`, if the user keeps one.
 *
 * Strictly one personal and one crew: two habits that both belong to crews are
 * two different crews' business, and linking them would let one crew's tap
 * score another crew's board.
 */
async function twinOf(userId, habit) {
  const key = normalise(habit.name);
  if (!key) return null;

  const siblings = await Habit.find({
    userId,
    archived: false,
    polarity: habit.polarity,
    _id: { $ne: habit._id },
  }).lean();

  const wantCrew = !habit.groupId;
  return siblings.find(
    (h) => normalise(h.name) === key && Boolean(h.groupId) === wantCrew,
  ) || null;
}

/**
 * Credit the twin for work already logged against its counterpart.
 *
 * The rep counts on both; the STARS are paid once, on the row the user
 * actually tapped. Paying both would make duplicating every crew habit
 * personally the cheapest way to earn, which is the same self-assessment
 * loophole the crew board is built to avoid.
 *
 * The twin's own daily cap still applies. If your crew allows two a day and
 * you allow one, the second crew rep does not force a second personal one.
 */
async function mirrorTo(userId, twin, amount, key, at) {
  if (!twin) return null;

  const cap = twin.dailyTarget || 0;
  let credit = amount;

  if (cap > 0) {
    const rows = await Log.find({
      userId, kind: 'habit', refId: twin._id, date: at,
    }).lean();
    const already = e.repsOn(rows, twin._id, key);
    credit = Math.min(credit, cap - already);
    if (credit <= 0) return null;
  }

  return Log.create({
    userId,
    kind: 'habit',
    refId: twin._id,
    date: at,
    count: credit,
    // Zero on purpose: the work was already paid for on the other row.
    starsDelta: 0,
  });
}

module.exports = { twinOf, mirrorTo, normalise };
