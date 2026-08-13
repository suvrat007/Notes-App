const express = require('express');
const Reward = require('../models/reward.model.js');
const Log = require('../models/log.model.js');
const { authenticateToken } = require('../utilities.js');
const e = require('../engine/stars.js');
const { lifetimeStarsFor } = require('../lib/totals.js');

const router = express.Router();
router.use(authenticateToken);

/** The ladder itself, so the UI never hard-codes its own copy of the tiers. */
router.get('/tiers', (req, res) => res.json({ error: false, tiers: e.DAMAGE_TIERS }));

router.get('/', async (req, res) => {
  try {
    const [rewards, lifetime] = await Promise.all([
      Reward.find({ userId: req.userId, archived: false }).sort({ createdAt: 1 }),
      lifetimeStarsFor(req.userId),
    ]);

    // Price them here rather than in the browser: the cost moves with the
    // lifetime total, and the server is the only thing that knows that number.
    const priced = rewards.map((r) => ({
      _id: r._id,
      name: r.name,
      damagePct: r.damagePct,
      cost: e.rewardCost(lifetime, r.damagePct),
    }));
    return res.json({ error: false, rewards: priced, lifetime });
  } catch {
    return res.status(500).json({ error: true, message: 'Internal Server Error' });
  }
});

/** What the system reckons a reward should cost, before the user overrides it. */
router.get('/suggest', (req, res) => {
  return res.json({ error: false, damagePct: e.suggestDamage(req.query.name || '') });
});

router.post('/', async (req, res) => {
  const { name, damagePct } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: true, message: 'Reward name is required' });
  }
  try {
    const reward = await Reward.create({
      userId: req.userId,
      name: String(name).trim(),
      // An unstated tier gets the system's guess rather than a hard default,
      // so a "week off" is not quietly priced like a coffee.
      damagePct: damagePct || e.suggestDamage(name),
    });
    return res.json({ error: false, reward, message: 'Reward created' });
  } catch (err) {
    return res.status(400).json({ error: true, message: err.message || 'Could not create reward' });
  }
});

router.patch('/:rewardId', async (req, res) => {
  const patch = {};
  if (req.body.name !== undefined) patch.name = String(req.body.name).trim();
  if (req.body.damagePct !== undefined) patch.damagePct = req.body.damagePct;
  try {
    const reward = await Reward.findOneAndUpdate(
      { _id: req.params.rewardId, userId: req.userId },
      { $set: patch },
      { new: true, runValidators: true },
    );
    if (!reward) return res.status(404).json({ error: true, message: 'Reward not found' });
    return res.json({ error: false, reward });
  } catch (err) {
    return res.status(400).json({ error: true, message: err.message || 'Could not update reward' });
  }
});

router.delete('/:rewardId', async (req, res) => {
  try {
    const reward = await Reward.findOneAndUpdate(
      { _id: req.params.rewardId, userId: req.userId },
      { $set: { archived: true } },
      { new: true },
    );
    if (!reward) return res.status(404).json({ error: true, message: 'Reward not found' });
    return res.json({ error: false, message: 'Reward removed' });
  } catch {
    return res.status(500).json({ error: true, message: 'Internal Server Error' });
  }
});

/**
 * Spend it.
 *
 * The price is a SHARE of everything earned, worked out at this moment, and it
 * lands on the lifetime total — so a week off really does cost you rank. The
 * client sends no number; it could only be wrong or dishonest.
 */
router.post('/:rewardId/redeem', async (req, res) => {
  try {
    const reward = await Reward.findOne({ _id: req.params.rewardId, userId: req.userId });
    if (!reward) return res.status(404).json({ error: true, message: 'Reward not found' });

    const lifetime = await lifetimeStarsFor(req.userId);
    const cost = e.rewardCost(lifetime, reward.damagePct);
    if (cost <= 0) {
      return res.status(400).json({
        error: true,
        message: 'Nothing earned yet, so nothing to spend. Log something first.',
      });
    }

    const log = await Log.create({
      userId: req.userId,
      kind: 'redeem',
      refId: reward._id,
      date: e.dayStart(e.dayKey(new Date())),
      count: 1,
      starsDelta: -cost,
    });

    return res.json({
      error: false, log, cost, damagePct: reward.damagePct,
      message: `Redeemed ${reward.name} — ${reward.damagePct}% of your total, ${cost} stars.`,
    });
  } catch (err) {
    return res.status(400).json({ error: true, message: err.message || 'Could not redeem that' });
  }
});

module.exports = router;
