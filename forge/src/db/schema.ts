import Dexie, { type Table } from 'dexie';
import { normalizeIconKey } from '../lib/habitIconKeys';

export type Polarity = 'good' | 'bad';
export type LogKind = 'habit' | 'task' | 'redeem' | 'missed-task';

export interface Habit {
  id: string;
  name: string;
  icon: string; // emoji or icon key
  polarity: Polarity;
  starsPerRep: number; // good: earn; bad: base penalty magnitude
  dailyAllowance: number; // bad habits only; reps up to this = base penalty
  overagePenalty: number; // bad habits only; extra stars lost per rep over allowance
  /** Bad habits: if true, reps within allowance are free (0) and only overage costs. */
  freeWithinAllowance: boolean;
  /** Good habits: reps wanted across one goal period; 0 = no goal. */
  targetReps: number;
  /** Length of that goal period in weeks. 1 = weekly (the original behaviour). */
  targetPeriodWeeks: number;
  isRecurringTask: boolean; // also appears on daily task list
  color: string;
  archived: boolean;
  createdAt: string;
}

export interface Task {
  id: string;
  name: string;
  dueDate: string; // YYYY-MM-DD
  stars: number; // reward if done
  done: boolean;
  doneAt: string | null;
  linkedHabitId: string | null;
  /** Set once the missed-task sweep has penalised this task, so it never repeats. */
  missedHandled: boolean;
  createdAt: string;
}

/** APPEND-ONLY LEDGER. Never edit/delete except via explicit undo. */
export interface LogEntry {
  id: string;
  date: string; // YYYY-MM-DD the entry applies to
  kind: LogKind;
  refId: string; // habit/task/reward id
  count: number; // reps this entry represents (usually 1)
  starsDelta: number; // signed; already computed by engine
  createdAt: string;
}

export interface Reward {
  id: string;
  name: string;
  cost: number; // stars to redeem
  archived: boolean;
}

export interface Settings {
  weekResetDay: number; // 1 = Monday
  negativeFloor: boolean;
  dailyTargetAuto: boolean;
}

export interface AppState {
  id: 'singleton';
  lifetimeStars: number; // sum of POSITIVE earns only; never decreases
  weekStartDate: string; // Monday of current week
  settings: Settings;
}

/** Accepted daily target for a given date (Phase 5). */
export interface DailyTarget {
  date: string; // YYYY-MM-DD, primary key
  value: number;
}

/** Shape of a v1 habit row, needed by the v2 upgrade and by v1 imports. */
export interface HabitV1 extends Omit<Habit, 'targetReps' | 'targetPeriodWeeks'> {
  weeklyTarget?: number;
}

/**
 * Bring a habit row from any earlier shape up to the current one.
 * v1 stored `weeklyTarget`; that is exactly a 1-week period target.
 */
export function migrateHabit(h: HabitV1 & Partial<Habit>): Habit {
  const { weeklyTarget, ...rest } = h;
  return {
    ...(rest as Habit),
    // Habits used to store an emoji glyph; they now store an icon key.
    icon: normalizeIconKey(h.icon),
    targetReps: h.targetReps ?? weeklyTarget ?? 0,
    targetPeriodWeeks: h.targetPeriodWeeks ?? 1,
  };
}

export class ForgeDB extends Dexie {
  habits!: Table<Habit, string>;
  tasks!: Table<Task, string>;
  logs!: Table<LogEntry, string>;
  rewards!: Table<Reward, string>;
  appState!: Table<AppState, string>;
  dailyTargets!: Table<DailyTarget, string>;

  constructor() {
    super('forge');
    this.version(1).stores({
      habits: 'id, name, polarity, archived',
      tasks: 'id, dueDate, done, [dueDate+done], linkedHabitId, missedHandled',
      logs: 'id, date, kind, refId, [date+kind], [refId+date]',
      rewards: 'id, archived',
      appState: 'id',
      dailyTargets: 'date',
    });

    // v2: goal targets gained a period, so a goal can span more than a week.
    this.version(2)
      .stores({
        habits: 'id, name, polarity, archived',
        tasks: 'id, dueDate, done, [dueDate+done], linkedHabitId, missedHandled',
        logs: 'id, date, kind, refId, [date+kind], [refId+date]',
        rewards: 'id, archived',
        appState: 'id',
        dailyTargets: 'date',
      })
      .upgrade(async (tx) => {
        await tx.table('habits').toCollection().modify((h) => {
          h.targetReps = h.targetReps ?? h.weeklyTarget ?? 0;
          h.targetPeriodWeeks = h.targetPeriodWeeks ?? 1;
          delete h.weeklyTarget;
        });
      });
  }
}

export const db = new ForgeDB();
