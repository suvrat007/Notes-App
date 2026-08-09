/**
 * Structural inputs for the engine.
 *
 * The engine deliberately does NOT import from `db/` — it depends on the
 * shape of the data, not on Dexie. These types are the contract; the Dexie
 * row types satisfy them structurally.
 */

export type Polarity = 'good' | 'bad';
export type LogKind = 'habit' | 'task' | 'redeem' | 'missed-task';

export interface HabitLike {
  id: string;
  polarity: Polarity;
  starsPerRep: number;
  dailyAllowance: number;
  overagePenalty: number;
  freeWithinAllowance: boolean;
  /** Reps wanted across one goal period. */
  targetReps: number;
  /** Length of that period in weeks (1 = weekly). */
  targetPeriodWeeks: number;
  /** Anchor the period tiling starts from (the habit's createdAt). */
  createdAt?: string;
}

export interface TaskLike {
  id: string;
  stars: number;
}

export interface RewardLike {
  id: string;
  cost: number;
}

export interface LogLike {
  date: string;
  kind: LogKind;
  refId: string;
  count: number;
  starsDelta: number;
}
