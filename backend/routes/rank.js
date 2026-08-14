const express = require('express');
const { authenticateToken } = require('../utilities.js');
const rank = require('../engine/rank.js');
const { lifetimeStarsFor } = require('../lib/totals.js');

const router = express.Router();
router.use(authenticateToken);

/**
 * The whole ladder, and where the caller stands on it.
 *
 * A rank only motivates if you can see what is above it. Handing over every
 * band with the price of entry lets the client show the climb rather than just
 * the current step, and keeps the curve defined in exactly one place.
 *
 * GET /rank/ladder
 */
router.get('/ladder', async (req, res) => {
  try {
    const lifetime = await lifetimeStarsFor(req.userId);
    const here = rank.rankFor(lifetime);

    const bands = rank.BANDS.map((b) => ({
      name: b.name,
      tier: b.tier,
      color: b.color,
      badge: b.badge,
      fromLevel: b.from,
      toLevel: b.to,
      enterAt: rank.starsForLevel(b.from),
      reached: here.level >= b.from,
      current: here.level >= b.from && here.level <= b.to,
    }));

    return res.json({ error: false, lifetime, rank: here, bands, maxLevel: rank.MAX_LEVEL });
  } catch (err) {
    return res.status(500).json({ error: true, message: err.message || 'Could not load the ladder' });
  }
});

module.exports = router;
