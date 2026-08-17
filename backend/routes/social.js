const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/user.model.js');
const Group = require('../models/group.model.js');
const Friendship = require('../models/friendship.model.js');
const Task = require('../models/task.model.js');
const { authenticateToken } = require('../utilities.js');
const { rateLimit } = require('../lib/ratelimit.js');
const { lifetimeStarsFor } = require('../lib/totals.js');
const rank = require('../engine/rank.js');
const e = require('../engine/stars.js');
const crewEngine = require('../engine/crew.js');
const crew = require('../lib/crew.js');

const router = express.Router();
router.use(authenticateToken);

/*
 * Invitations and crew creation are rate limited, and joining hardest of all.
 * An unthrottled join endpoint is a way to guess codes; six characters is
 * plenty against a person and nothing at all against a loop.
 */
const inviteLimit = rateLimit({
  limit: 20, windowMs: 60 * 60 * 1000, name: 'social-invite',
  message: 'That is a lot of invitations at once. Try again shortly.',
});
const joinLimit = rateLimit({
  limit: 10, windowMs: 10 * 60 * 1000, name: 'social-join',
  message: 'Too many join attempts. Wait a few minutes.',
});

/** Unambiguous characters only: no O/0 or I/1 to misread over a message. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

async function freshCode() {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = Array.from({ length: 6 },
      () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
    if (!(await Group.exists({ inviteCode: code }))) return code;
  }
  throw new Error('could not allocate an invite code');
}

const todayKey = (raw) =>
  (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : e.dayKey(new Date()));

/** Public facts about a person: enough to rank them, nothing more. */
async function publicProfile(user) {
  const lifetime = await lifetimeStarsFor(user._id);
  return {
    _id: user._id,
    fullName: user.fullName,
    lifetime,
    rank: rank.rankFor(lifetime),
  };
}

/** The caller's membership row, or null if they are not in this crew. */
const membershipOf = (group, userId) =>
  group.members.find((m) => String(m.userId) === String(userId)) || null;

/* ------------------------------------------------------------------ *
 * The whole Squad page in one read.
 * ------------------------------------------------------------------ */
router.get('/', async (req, res) => {
  try {
    const date = todayKey(req.query.date);
    const me = String(req.userId);

    const links = await Friendship.find({
      $or: [{ a: me }, { b: me }],
    }).lean();

    const otherId = (f) => (String(f.a) === me ? f.b : f.a);
    const people = await User.find({
      _id: { $in: links.map(otherId) },
    }).select('fullName email').lean();
    const byId = new Map(people.map((p) => [String(p._id), p]));

    const friends = [];
    const incoming = [];
    const outgoing = [];

    for (const f of links) {
      const person = byId.get(String(otherId(f)));
      if (!person) continue;
      const profile = await publicProfile(person);
      if (f.status === 'accepted') friends.push({ ...profile, linkId: f._id });
      else if (String(f.requestedBy) === me) outgoing.push({ ...profile, linkId: f._id });
      else incoming.push({ ...profile, linkId: f._id });
    }

    // Highest first, because a leaderboard sorted by name is a contact list.
    friends.sort((x, y) => y.lifetime - x.lifetime);

    const groups = await Group.find({ 'members.userId': me });

    const crews = [];
    const payouts = [];
    for (const g of groups) {
      // Any week that closed while nobody was looking is paid out now.
      const settled = await crew.settlePodium(g, date);
      payouts.push(...settled.filter((s) => String(s.userId) === me));

      const { weekStart, ranked } = await crew.liveStandings(g, date);
      const mine = ranked.find((r) => r.userId === me);
      crews.push({
        _id: g._id,
        name: g.name,
        inviteCode: g.inviteCode,
        isOwner: String(g.ownerId) === me,
        memberCount: g.members.length,
        sharedCount: g.sharedTasks.length,
        weekStart,
        myPlace: mine?.place ?? null,
        myStars: mine?.stars ?? 0,
        topPrize: crewEngine.topPrize(g.members.length),
      });
    }

    res.json({ error: false, friends, incoming, outgoing, crews, payouts });
  } catch (err) {
    console.error('GET /social', err);
    res.status(500).json({ error: true, message: 'Could not load your squad' });
  }
});

/* ------------------------------------------------------------------ *
 * Friends
 * ------------------------------------------------------------------ */
router.post('/friends', inviteLimit, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: true, message: 'An email is required' });

    const them = await User.findOne({ email }).select('fullName email');
    /*
     * The same answer whether or not the account exists. Anything else turns
     * this into a way to test which email addresses are registered.
     */
    const vague = { error: true, message: 'No invitation could be sent to that address' };
    if (!them) return res.status(404).json(vague);
    if (String(them._id) === String(req.userId)) {
      return res.status(400).json({ error: true, message: 'You are already your own best company' });
    }

    const pair = Friendship.pair(req.userId, them._id);
    const existing = await Friendship.findOne(pair);
    if (existing) {
      return res.status(409).json({
        error: true,
        message: existing.status === 'accepted' ? 'You are already friends' : 'That invitation is already pending',
      });
    }

    await Friendship.create({ ...pair, requestedBy: req.userId });
    res.json({ error: false, message: `Invitation sent to ${them.fullName}` });
  } catch (err) {
    console.error('POST /social/friends', err);
    res.status(500).json({ error: true, message: 'Could not send that invitation' });
  }
});

router.post('/friends/:id/accept', async (req, res) => {
  try {
    const link = await Friendship.findById(req.params.id);
    if (!link) return res.status(404).json({ error: true, message: 'No such invitation' });

    const me = String(req.userId);
    const mine = String(link.a) === me || String(link.b) === me;
    // Only the person who was invited can accept it.
    if (!mine || String(link.requestedBy) === me) {
      return res.status(403).json({ error: true, message: 'That invitation is not yours to accept' });
    }

    link.status = 'accepted';
    link.acceptedAt = new Date();
    await link.save();
    res.json({ error: false, message: 'Friend added' });
  } catch (err) {
    console.error('POST /social/friends/accept', err);
    res.status(500).json({ error: true, message: 'Could not accept that invitation' });
  }
});

/** Declines a request and removes a friend — the same act from either side. */
router.delete('/friends/:id', async (req, res) => {
  try {
    const me = String(req.userId);
    const link = await Friendship.findOne({
      _id: req.params.id,
      $or: [{ a: me }, { b: me }],
    });
    if (!link) return res.status(404).json({ error: true, message: 'No such friend' });
    await link.deleteOne();
    res.json({ error: false, message: 'Removed' });
  } catch (err) {
    console.error('DELETE /social/friends', err);
    res.status(500).json({ error: true, message: 'Could not remove that' });
  }
});

/* ------------------------------------------------------------------ *
 * Crews
 * ------------------------------------------------------------------ */
router.post('/crews', inviteLimit, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: true, message: 'Name your crew' });

    const group = await Group.create({
      name: name.slice(0, 40),
      ownerId: req.userId,
      inviteCode: await freshCode(),
      members: [{ userId: req.userId }],
      sharedTasks: [],
    });
    res.json({ error: false, crew: { _id: group._id, name: group.name, inviteCode: group.inviteCode } });
  } catch (err) {
    console.error('POST /social/crews', err);
    res.status(500).json({ error: true, message: 'Could not create that crew' });
  }
});

router.post('/crews/join', joinLimit, async (req, res) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase();
    const date = todayKey(req.body.date);
    if (!code) return res.status(400).json({ error: true, message: 'Enter an invite code' });

    const group = await Group.findOne({ inviteCode: code });
    if (!group) return res.status(404).json({ error: true, message: 'No crew has that code' });
    if (membershipOf(group, req.userId)) {
      return res.status(409).json({ error: true, message: 'You are already in that crew' });
    }

    group.members.push({ userId: req.userId });
    await group.save();
    // A newcomer starts with the same assignment as everyone else, or they
    // would be scored on a board they have no way of climbing.
    await crew.fanOutToNewcomer(group, req.userId, date);

    res.json({ error: false, message: `Joined ${group.name}`, crewId: group._id });
  } catch (err) {
    console.error('POST /social/crews/join', err);
    res.status(500).json({ error: true, message: 'Could not join that crew' });
  }
});

router.get('/crews/:id', async (req, res) => {
  try {
    const date = todayKey(req.query.date);
    const group = await Group.findById(req.params.id);
    if (!group || !membershipOf(group, req.userId)) {
      return res.status(404).json({ error: true, message: 'No such crew' });
    }

    await crew.settlePodium(group, date);
    const { weekStart, ranked } = await crew.liveStandings(group, date);

    const people = await User.find({
      _id: { $in: group.members.map((m) => m.userId) },
    }).select('fullName').lean();
    const nameOf = new Map(people.map((p) => [String(p._id), p.fullName]));

    const board = await Promise.all(ranked.map(async (r) => {
      const lifetime = await lifetimeStarsFor(r.userId);
      return {
        userId: r.userId,
        fullName: nameOf.get(r.userId) || 'Someone',
        place: r.place,
        stars: r.stars,
        rank: rank.rankFor(lifetime),
        isMe: r.userId === String(req.userId),
      };
    }));

    res.json({
      error: false,
      crew: {
        _id: group._id,
        name: group.name,
        inviteCode: group.inviteCode,
        isOwner: String(group.ownerId) === String(req.userId),
        weekStart,
        topPrize: crewEngine.topPrize(group.members.length),
        sharedTasks: group.sharedTasks.map((s) => ({
          _id: s._id, title: s.title, type: s.type,
          baseReward: s.baseReward, targetCount: s.targetCount, repCadence: s.repCadence,
        })),
        board,
      },
    });
  } catch (err) {
    console.error('GET /social/crews/:id', err);
    res.status(500).json({ error: true, message: 'Could not load that crew' });
  }
});

/** Add a shared task, and stamp it onto every member's list. */
router.post('/crews/:id/tasks', inviteLimit, async (req, res) => {
  try {
    const date = todayKey(req.body.date);
    const group = await Group.findById(req.params.id);
    if (!group || !membershipOf(group, req.userId)) {
      return res.status(404).json({ error: true, message: 'No such crew' });
    }

    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ error: true, message: 'Give the task a name' });

    group.sharedTasks.push({
      title: title.slice(0, 120),
      type: ['daily', 'occasional', 'avoid'].includes(req.body.type) ? req.body.type : 'daily',
      baseReward: Math.max(0, Number(req.body.baseReward) || 10),
      targetCount: Math.max(1, Number(req.body.targetCount) || 1),
      repCadence: req.body.repCadence === 'daily' ? 'daily' : 'anytime',
      createdBy: req.userId,
    });
    await group.save();

    const shared = group.sharedTasks[group.sharedTasks.length - 1];
    await crew.fanOutToMembers(group, shared, date);

    res.json({ error: false, message: 'Everyone has it now' });
  } catch (err) {
    console.error('POST /social/crews/:id/tasks', err);
    res.status(500).json({ error: true, message: 'Could not add that task' });
  }
});

/**
 * Drop a shared task.
 *
 * The copies go with it, but only the ones nobody has touched — deleting a
 * task someone already completed would take back stars they earned fairly.
 * Finished copies are cut loose from the crew and stay on the member's list
 * as ordinary work.
 */
router.delete('/crews/:id/tasks/:sharedId', async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group || !membershipOf(group, req.userId)) {
      return res.status(404).json({ error: true, message: 'No such crew' });
    }
    const shared = group.sharedTasks.id(req.params.sharedId);
    if (!shared) return res.status(404).json({ error: true, message: 'No such shared task' });

    await Task.deleteMany({ groupTaskId: shared._id, doneCount: 0 });
    await Task.updateMany({ groupTaskId: shared._id }, { groupId: null, groupTaskId: null });

    shared.deleteOne();
    await group.save();
    res.json({ error: false, message: 'Removed from the crew' });
  } catch (err) {
    console.error('DELETE /social/crews/:id/tasks', err);
    res.status(500).json({ error: true, message: 'Could not remove that task' });
  }
});

/**
 * Leave, or disband if you are the last one out.
 *
 * Work already done stays on the leaver's list and keeps its stars; it simply
 * stops counting towards a board they are no longer on.
 */
router.post('/crews/:id/leave', async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group || !membershipOf(group, req.userId)) {
      return res.status(404).json({ error: true, message: 'No such crew' });
    }

    await Task.updateMany(
      { groupId: group._id, userId: req.userId, doneCount: 0 },
      { $set: { groupId: null, groupTaskId: null } },
    );

    group.members = group.members.filter((m) => String(m.userId) !== String(req.userId));

    if (group.members.length === 0) {
      await Task.updateMany({ groupId: group._id }, { $set: { groupId: null, groupTaskId: null } });
      await group.deleteOne();
      return res.json({ error: false, message: 'Crew disbanded' });
    }

    // The owner leaving hands the crew to whoever has been there longest.
    if (String(group.ownerId) === String(req.userId)) group.ownerId = group.members[0].userId;
    await group.save();
    res.json({ error: false, message: `Left ${group.name}` });
  } catch (err) {
    console.error('POST /social/crews/:id/leave', err);
    res.status(500).json({ error: true, message: 'Could not leave that crew' });
  }
});

module.exports = router;
