/**
 * Reward affordability + the "you've been able to afford this for a while"
 * nudge. Pure — takes logs and rewards in, returns view-model out.
 */
import type { LogLike, RewardLike } from './types';
import { dayNet } from './stars';

export interface RewardView {
  id: string;
  name: string;
  cost: number;
  affordable: boolean;
  /** Share of lifetime stars this costs. */
  damagePct: number;
  /** Stars still needed; 0 when affordable. */
  remaining: number;
  /** Consecutive days (ending today) this has been affordable. */
  affordableDays: number;
  /** True once it has been affordable for NUDGE_AFTER_DAYS or more. */
  nudge: boolean;
}

export const NUDGE_AFTER_DAYS = 2;

/**
 * What a reward costs, as a share of everything you have earned.
 *
 * A flat price ages badly: 200★ is a fortune at level 2 and pocket change at
 * level 20, so the same cheesecake stops meaning anything. A percentage keeps
 * the sting proportional — a week off always costs you a week off.
 */
export type DamageTier = 20 | 40 | 60 | 80 | 100;

export const DAMAGE_TIERS: { pct: DamageTier; label: string; blurb: string }[] = [
  { pct: 20,  label: 'Small',   blurb: 'a treat' },
  { pct: 40,  label: 'Fair',    blurb: 'a proper night off' },
  { pct: 60,  label: 'Heavy',   blurb: 'a real indulgence' },
  { pct: 80,  label: 'Severe',  blurb: 'most of what you built' },
  { pct: 100, label: 'Total',   blurb: 'back to zero' },
];

/** Stars a reward takes right now. Rounds up, so 1% of anything still costs. */
export function rewardCost(lifetimeStars: number, pct: DamageTier | number): number {
  const safe = Math.max(0, Math.min(100, pct || 0));
  return Math.ceil(Math.max(0, lifetimeStars) * (safe / 100));
}

/**
 * The system's opening offer, from what the thing IS.
 *
 * Only a starting point — the user always sees it and can move it. Guessing
 * beats making someone price every treat from scratch, and guessing low is
 * the safe direction: an under-priced reward is a smaller mistake than one
 * that silently wipes a month of work.
 */
const BIG = /\b(week|weekend|holiday|vacation|trip|days? off|time off|console|phone|laptop|watch|bike|tattoo|splurge)\b/i;
const MEDIUM = /\b(night out|dinner|concert|gig|match|game|massage|spa|shopping|takeaway|meal out)\b/i;

export function suggestDamage(name: string): DamageTier {
  const n = name.trim();
  if (!n) return 20;
  if (/\bweek off\b|\bweek's? off\b/i.test(n)) return 100;
  if (BIG.test(n)) return 80;
  if (MEDIUM.test(n)) return 40;
  return 20;
}

/**
 * Running balance at the end of each date in `dates`, in order.
 * The week's balance is cumulative, so each day builds on the last.
 */
export function runningBalances(
  logs: LogLike[],
  dates: string[],
  opts: { floor?: boolean } = {},
): number[] {
  let acc = 0;
  return dates.map((d) => {
    acc += dayNet(logs, d, opts);
    return acc;
  });
}

/**
 * How many consecutive days up to and including the last date the balance
 * has been at or above `cost`. 0 if not currently affordable.
 */
export function affordableStreak(balances: number[], cost: number): number {
  let streak = 0;
  for (let i = balances.length - 1; i >= 0; i--) {
    if (balances[i] >= cost) streak++;
    else break;
  }
  return streak;
}

export function buildRewardViews(
  rewards: Array<RewardLike & { name: string; damagePct?: number }>,
  balance: number,
  balancesByDay: number[],
  lifetimeStars = 0,
): RewardView[] {
  return rewards.map((r) => {
    /*
     * Priced off lifetime stars, but still gated on the WEEK's balance: the
     * damage lands on rank, and letting someone cash out a rank they have not
     * actually been running this week would make the ledger decorative.
     */
    const pct = (r as { damagePct?: number }).damagePct ?? 20;
    const cost = rewardCost(lifetimeStars, pct);
    const affordable = balance >= cost;
    const affordableDays = affordableStreak(balancesByDay, cost);
    return {
      id: r.id,
      name: r.name,
      cost,
      damagePct: pct,
      affordable,
      remaining: affordable ? 0 : cost - balance,
      affordableDays,
      nudge: affordable && affordableDays >= NUDGE_AFTER_DAYS,
    };
  });
}
