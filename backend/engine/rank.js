/**
 * Rank curve. Pure — lifetime stars in, level/title/progress out.
 *
 * TEN ranks over 30 levels, three levels apiece.
 *
 * Level N costs `100 * N^1.9` cumulative stars. The exponent was 1.6, which
 * put the ceiling within a few months of ordinary use — a ladder you finish is
 * a ladder that stops pulling. At 1.9 the top is roughly 2.6x further away and
 * every rank costs meaningfully more than the one below it: Recruit to Initiate
 * is a week, Warlord to Immortal is a season.
 *
 * Lives on the SERVER so the rank a user sees is the rank the database agrees
 * with. A client-computed rank is a scoreboard anyone can edit.
 */

const MAX_LEVEL = 30;

/** How steeply each level costs more than the last. */
const CURVE = 1.9;

/*
 * `badge` names an emblem the client draws; the shapes escalate the way real
 * insignia do — chevrons, then shields, then stars, then a crown. Kept as a
 * key rather than a file so the server never ships artwork.
 */
const BANDS = [
  { name: 'Recruit',     from: 1,  to: 3,  tier: 1,  color: '#8a929e', badge: 'chevron1' },
  { name: 'Initiate',    from: 4,  to: 6,  tier: 2,  color: '#9aa6b4', badge: 'chevron2' },
  { name: 'Disciplined', from: 7,  to: 9,  tier: 3,  color: '#5b9dd9', badge: 'chevron3' },
  { name: 'Steadfast',   from: 10, to: 12, tier: 4,  color: '#4bb3c4', badge: 'shield' },
  { name: 'Ironclad',    from: 13, to: 15, tier: 5,  color: '#3ecf8e', badge: 'shieldBar' },
  { name: 'Relentless',  from: 16, to: 18, tier: 6,  color: '#7fc96b', badge: 'diamond' },
  { name: 'Vanguard',    from: 19, to: 21, tier: 7,  color: '#c0b3a5', badge: 'star' },
  { name: 'Paragon',     from: 22, to: 24, tier: 8,  color: '#e0b062', badge: 'starCircle' },
  { name: 'Warlord',     from: 25, to: 27, tier: 9,  color: '#e5484d', badge: 'blades' },
  { name: 'Immortal',    from: 28, to: 30, tier: 10, color: '#f2e6c9', badge: 'crown' },
];

/** Cumulative stars needed to REACH level n. Level 1 is free. */
function starsForLevel(n) {
  if (n <= 1) return 0;
  return Math.round(100 * Math.pow(n, CURVE));
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

  // What the NEXT named rank is, so the ladder shows something to aim at
  // rather than only the next number.
  const nextBand = BANDS.find((b) => b.from > level) ?? null;

  return {
    level,
    title: band.name,
    tier: band.tier,
    color: band.color,
    badge: band.badge,
    levelFloor,
    nextAt,
    toNext: nextAt === null ? 0 : Math.max(0, nextAt - stars),
    progress,
    nextTitle: nextBand?.name ?? null,
    nextTitleAt: nextBand ? starsForLevel(nextBand.from) : null,
  };
}

module.exports = { MAX_LEVEL, CURVE, BANDS, starsForLevel, bandFor, levelFor, rankFor };
