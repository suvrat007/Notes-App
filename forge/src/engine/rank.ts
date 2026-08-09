/**
 * Rank curve. Pure — lifetime stars in, level/title/progress out.
 *
 * Level N requires `100 * N^1.6` cumulative stars. 30 levels max.
 */

export const MAX_LEVEL = 30;

export interface Band {
  name: string;
  from: number; // inclusive level
  to: number;   // inclusive level
  /** Art tier key — 5 tiers is enough visual variety. */
  tier: 1 | 2 | 3 | 4 | 5;
  color: string;
}

export const BANDS: Band[] = [
  { name: 'Recruit',     from: 1,  to: 5,  tier: 1, color: '#8a929e' },
  { name: 'Disciplined', from: 6,  to: 10, tier: 2, color: '#5b9dd9' },
  { name: 'Ironclad',    from: 11, to: 18, tier: 3, color: '#3ecf8e' },
  { name: 'Vanguard',    from: 19, to: 25, tier: 4, color: '#ff6a2b' },
  { name: 'Warlord',     from: 26, to: 30, tier: 5, color: '#e5484d' },
];

/** Cumulative stars needed to REACH level n. Level 1 is free (0 stars). */
export function starsForLevel(n: number): number {
  if (n <= 1) return 0;
  return Math.round(100 * Math.pow(n, 1.6));
}

export interface RankInfo {
  level: number;
  title: string;
  tier: 1 | 2 | 3 | 4 | 5;
  color: string;
  /** Cumulative stars needed for the current level. */
  levelFloor: number;
  /** Cumulative stars needed for the next level; null at max. */
  nextAt: number | null;
  /** Stars still needed to level up; 0 at max. */
  toNext: number;
  /** 0..1 progress through the current level. 1 at max. */
  progress: number;
}

export function bandFor(level: number): Band {
  return BANDS.find((b) => level >= b.from && level <= b.to) ?? BANDS[BANDS.length - 1];
}

export function levelFor(lifetimeStars: number): number {
  let level = 1;
  for (let n = 2; n <= MAX_LEVEL; n++) {
    if (lifetimeStars >= starsForLevel(n)) level = n;
    else break;
  }
  return level;
}

export function rankFor(lifetimeStars: number): RankInfo {
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
