/**
 * Rank curve. Pure — lifetime stars in, level/title/progress out.
 *
 * Level N requires `100 * N^1.6` cumulative stars, which keeps early levels
 * quick enough to feel worth chasing and later ones slow enough to mean
 * something. 30 levels is the ceiling.
 *
 * Lives on the SERVER so the rank a user sees is the rank the database agrees
 * with. A client-computed rank is a scoreboard anyone can edit.
 */

const MAX_LEVEL = 30;

const BANDS = [
  { name: 'Recruit',     from: 1,  to: 5,  tier: 1, color: '#8a929e' },
  { name: 'Disciplined', from: 6,  to: 10, tier: 2, color: '#5b9dd9' },
  { name: 'Ironclad',    from: 11, to: 18, tier: 3, color: '#3ecf8e' },
  { name: 'Vanguard',    from: 19, to: 25, tier: 4, color: '#c0b3a5' },
  { name: 'Warlord',     from: 26, to: 30, tier: 5, color: '#e5484d' },
];

/** Cumulative stars needed to REACH level n. Level 1 is free. */
function starsForLevel(n) {
  if (n <= 1) return 0;
  return Math.round(100 * Math.pow(n, 1.6));
}

function bandFor(level) {
  return BANDS.find((b) => level >= b.from && level <= b.to) ?? BANDS[BANDS.length - 1];
}

function levelFor(lifetimeStars) {
  let level = 1;
  for (let n = 2; n <= MAX_LEVEL; n++) {
    if (lifetimeStars >= starsForLevel(n)) level = n;
    else break;
  }
  return level;
}

function rankFor(lifetimeStars) {
  const stars = Math.max(0, lifetimeStars);
  const level = levelFor(stars);
  const band = bandFor(level);
  const levelFloor = starsForLevel(level);
  const nextAt = level >= MAX_LEVEL ? null : starsForLevel(level + 1);

  const progress = nextAt === null
    ? 1
    : Math.max(0, Math.min(1, (stars - levelFloor) / (nextAt - levelFloor)));

  return {
    level,
    title: band.name,
    tier: band.tier,
    color: band.color,
    levelFloor,
    nextAt,
    toNext: nextAt === null ? 0 : Math.max(0, nextAt - stars),
    progress,
  };
}

module.exports = { MAX_LEVEL, BANDS, starsForLevel, bandFor, levelFor, rankFor };
