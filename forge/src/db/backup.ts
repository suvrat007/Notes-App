/**
 * Whole-database export / import. This is FORGE's only cross-device story —
 * there is no server, so a JSON file is how data moves between installs.
 */
import { db, migrateHabit, type Habit, type Task, type LogEntry, type Reward, type AppState, type DailyTarget } from './schema';

export const BACKUP_VERSION = 3;

export interface Backup {
  forge: true;
  version: number;
  exportedAt: string;
  habits: Habit[];
  tasks: Task[];
  logs: LogEntry[];
  rewards: Reward[];
  appState: AppState[];
  dailyTargets: DailyTarget[];
}

export async function exportBackup(): Promise<Backup> {
  const [habits, tasks, logs, rewards, appState, dailyTargets] = await Promise.all([
    db.habits.toArray(),
    db.tasks.toArray(),
    db.logs.toArray(),
    db.rewards.toArray(),
    db.appState.toArray(),
    db.dailyTargets.toArray(),
  ]);
  return {
    forge: true,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    habits, tasks, logs, rewards, appState, dailyTargets,
  };
}

/** v1/v2 backups predate `dueTime`; those tasks were all-day by definition. */
function migrateTask(t: Task, i: number): Task {
  // Backups predating manual ordering carry no `order`. Falling back to the
  // array index preserves the order the export was written in, which is the
  // order the user last saw.
  return { ...t, dueTime: t.dueTime ?? null, order: t.order ?? i };
}

export function backupToBlob(b: Backup): Blob {
  return new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' });
}

export class InvalidBackupError extends Error {}

/** Structural check before we wipe anything. */
export function validateBackup(raw: unknown): asserts raw is Backup {
  const b = raw as Partial<Backup>;
  if (!b || typeof b !== 'object' || b.forge !== true) {
    throw new InvalidBackupError('Not a FORGE backup file.');
  }
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    throw new InvalidBackupError(`Backup version ${b.version} is newer than this app supports.`);
  }
  for (const k of ['habits', 'tasks', 'logs', 'rewards', 'appState'] as const) {
    if (!Array.isArray(b[k])) throw new InvalidBackupError(`Backup is missing "${k}".`);
  }
}

/**
 * Replace the entire database with the backup's contents.
 * Validated first, then applied in ONE transaction so a failure part-way
 * cannot leave the user with a half-wiped database.
 */
export async function importBackup(raw: unknown): Promise<void> {
  validateBackup(raw);

  await db.transaction(
    'rw',
    [db.habits, db.tasks, db.logs, db.rewards, db.appState, db.dailyTargets,
     db.syncLinks, db.syncQueue],
    async () => {
      await Promise.all([
        db.habits.clear(), db.tasks.clear(), db.logs.clear(),
        db.rewards.clear(), db.appState.clear(), db.dailyTargets.clear(),
        // Sync state is deliberately NOT in the backup and is wiped on import.
        // Its ids point at Google objects belonging to whichever account was
        // connected when the export was taken — carrying them to another
        // install would have FORGE editing events it does not own.
        db.syncLinks.clear(), db.syncQueue.clear(),
      ]);
      await Promise.all([
        // v1 backups carry `weeklyTarget`; bring them up to the current shape.
        db.habits.bulkAdd(raw.habits.map(migrateHabit)),
        db.tasks.bulkAdd(raw.tasks.map(migrateTask)),
        db.logs.bulkAdd(raw.logs),
        db.rewards.bulkAdd(raw.rewards),
        // Land disconnected. The restored tasks have no sync links, so leaving
        // this on would recreate every event — duplicating the lot if this
        // install talks to the same Google account. Reconnecting is one tap.
        db.appState.bulkAdd(
          raw.appState.map((s) => ({
            ...s,
            settings: { ...s.settings, googleConnected: false },
          })),
        ),
        db.dailyTargets.bulkAdd(raw.dailyTargets ?? []),
      ]);
    },
  );
}
