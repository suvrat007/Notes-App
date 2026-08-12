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
  /** Manual sort position. Lower first; ties fall back to createdAt. */
  order: number;
}

export interface Task {
  id: string;
  name: string;
  dueDate: string; // YYYY-MM-DD
  /**
   * Local `HH:MM`, or null for "sometime that day".
   * Only Google sync reads this: null becomes an all-day event, a time becomes
   * a timed one. FORGE's own star maths is day-keyed and ignores it entirely.
   */
  dueTime: string | null;
  stars: number; // reward if done
  done: boolean;
  doneAt: string | null;
  linkedHabitId: string | null;
  /** Set once the missed-task sweep has penalised this task, so it never repeats. */
  missedHandled: boolean;
  createdAt: string;
  /** Manual sort position within its day. */
  order: number;
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
  /** Use the AI parser for voice when a key is configured and we are online. */
  aiParsing?: boolean;

  /**
   * The user has connected Google at least once. We cannot check this by
   * reading a token — tokens live in memory only — so this flag is what tells
   * startup it's worth attempting a silent re-auth.
   */
  googleConnected?: boolean;
  /** Push tasks to Google Calendar as events. */
  googleCalendar?: boolean;
  /** Push tasks to Google Tasks (what "Google Reminders" became). */
  googleTasks?: boolean;
  /** Target calendar; 'primary' unless the user picks another. */
  googleCalendarId?: string;
  /** Target task list; '@default' unless the user picks another. */
  googleTaskListId?: string;
}

/** Which Google product a sync row refers to. */
export type SyncTarget = 'calendar' | 'tasks';

/** 'delete' is used once the local task row is already gone. */
export type SyncOp = 'upsert' | 'delete';

/**
 * A local task's counterpart in Google. Kept until the remote object is
 * confirmed deleted, because it holds the only id we can delete by.
 */
export interface SyncLink {
  /** `${target}:${taskId}` */
  id: string;
  target: SyncTarget;
  taskId: string;
  remoteId: string;
  syncedAt: string;
}

/**
 * Outbox entry. Exactly one pending op per (target, task) — the id is that
 * pair, so re-queuing a task that already has work pending overwrites rather
 * than stacking. Drain re-reads live task state, so a coalesced entry always
 * pushes the newest version rather than replaying a stale intermediate one.
 */
export interface SyncQueueItem {
  /** `${target}:${taskId}` */
  id: string;
  target: SyncTarget;
  taskId: string;
  op: SyncOp;
  attempts: number;
  lastError: string | null;
  queuedAt: string;
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
    order: h.order ?? 0,
  };
}

export class ForgeDB extends Dexie {
  habits!: Table<Habit, string>;
  tasks!: Table<Task, string>;
  logs!: Table<LogEntry, string>;
  rewards!: Table<Reward, string>;
  appState!: Table<AppState, string>;
  dailyTargets!: Table<DailyTarget, string>;
  syncLinks!: Table<SyncLink, string>;
  syncQueue!: Table<SyncQueueItem, string>;

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

    // v3: Google sync. Tasks gained an optional time-of-day, and two new
    // tables carry the remote ids and the offline outbox.
    this.version(3)
      .stores({
        habits: 'id, name, polarity, archived',
        tasks: 'id, dueDate, done, [dueDate+done], linkedHabitId, missedHandled',
        logs: 'id, date, kind, refId, [date+kind], [refId+date]',
        rewards: 'id, archived',
        appState: 'id',
        dailyTargets: 'date',
        syncLinks: 'id, target, taskId',
        syncQueue: 'id, target, taskId',
      })
      .upgrade(async (tx) => {
        await tx.table('tasks').toCollection().modify((t) => {
          // Existing tasks stay all-day, which is what they effectively were.
          t.dueTime = t.dueTime ?? null;
        });
      });

    // v4: manual ordering. Positions are seeded from creation order so the
    // first render of the Manage screen matches what the user already sees.
    this.version(4)
      .stores({
        habits: 'id, name, polarity, archived, order',
        tasks: 'id, dueDate, done, [dueDate+done], linkedHabitId, missedHandled, order',
        logs: 'id, date, kind, refId, [date+kind], [refId+date]',
        rewards: 'id, archived',
        appState: 'id',
        dailyTargets: 'date',
        syncLinks: 'id, target, taskId',
        syncQueue: 'id, target, taskId',
      })
      .upgrade(async (tx) => {
        for (const table of ['habits', 'tasks']) {
          const rows = await tx.table(table).toArray();
          rows.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
          await Promise.all(
            rows.map((r, i) => tx.table(table).update(r.id, { order: i })),
          );
        }
      });
  }
}

export const db = new ForgeDB();
