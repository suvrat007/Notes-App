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
  /** Stars still needed; 0 when affordable. */
  remaining: number;
  /** Consecutive days (ending today) this has been affordable. */
  affordableDays: number;
  /** True once it has been affordable for NUDGE_AFTER_DAYS or more. */
  nudge: boolean;
}

export const NUDGE_AFTER_DAYS = 2;

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
  rewards: RewardLike[] & Array<{ name: string }>,
  balance: number,
  balancesByDay: number[],
): RewardView[] {
  return rewards.map((r) => {
    const affordable = balance >= r.cost;
    const affordableDays = affordableStreak(balancesByDay, r.cost);
    return {
      id: r.id,
      name: r.name,
      cost: r.cost,
      affordable,
      remaining: affordable ? 0 : r.cost - balance,
      affordableDays,
      nudge: affordable && affordableDays >= NUDGE_AFTER_DAYS,
    };
  });
}
