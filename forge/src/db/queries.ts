/**
 * Pure CRUD over Dexie. NO star math lives here — deltas arrive
 * pre-computed by `engine/`. This layer only reads and writes rows.
 */
import { db, migrateHabit, type Habit, type Task, type LogEntry, type Reward, type LogKind } from './schema';
import { newId } from '../lib/id';
import { todayStr } from '../lib/dates';

/**
 * Strictly-increasing timestamp. Two logs written in the same millisecond
 * (rapid tapping, or a voice batch committing several items at once) would
 * otherwise tie, making "undo the last rep" ambiguous — and the bad-habit
 * ladder means the tied entries can carry different deltas.
 */
let lastTs = 0;
const nowIso = () => {
  let t = Date.now();
  if (t <= lastTs) t = lastTs + 1;
  lastTs = t;
  return new Date(t).toISOString();
};

/* ---------------- Habits ---------------- */

export type NewHabit = Partial<Habit> & Pick<Habit, 'name' | 'polarity'>;

export async function addHabit(input: NewHabit): Promise<Habit> {
  // `id` is set after the spread so a caller can never supply one.
  const habit: Habit = {
    icon: '⚡',
    starsPerRep: 10,
    dailyAllowance: 0,
    overagePenalty: 5,
    freeWithinAllowance: false,
    targetReps: 0,
    targetPeriodWeeks: 1,
    isRecurringTask: false,
    color: input.polarity === 'bad' ? '#e5484d' : '#3ecf8e',
    archived: false,
    createdAt: nowIso(),
    ...input,
    id: newId(),
  };
  await db.habits.add(habit);
  return habit;
}

export async function updateHabit(id: string, patch: Partial<Habit>): Promise<void> {
  await db.habits.update(id, patch);
}

export async function archiveHabit(id: string): Promise<void> {
  await db.habits.update(id, { archived: true });
}

export async function listActiveHabits(): Promise<Habit[]> {
  const all = await db.habits.toArray();
  // Normalise on read as well as in the v2 upgrade: a row can reach the table
  // without a version bump (import, another tab, a partially-applied upgrade),
  // and the rest of the app must never see a legacy shape.
  return all
    .filter((h) => !h.archived)
    .map(migrateHabit)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getHabit(id: string): Promise<Habit | undefined> {
  const h = await db.habits.get(id);
  return h ? migrateHabit(h) : undefined;
}

/* ---------------- Tasks ---------------- */

export type NewTask = Partial<Task> & Pick<Task, 'name'>;

export async function addTask(input: NewTask): Promise<Task> {
  const task: Task = {
    dueDate: todayStr(),
    stars: 10,
    done: false,
    doneAt: null,
    linkedHabitId: null,
    missedHandled: false,
    createdAt: nowIso(),
    ...input,
    id: newId(),
  };
  await db.tasks.add(task);
  return task;
}

export async function updateTask(id: string, patch: Partial<Task>): Promise<void> {
  await db.tasks.update(id, patch);
}

export async function toggleTaskDone(id: string, done: boolean): Promise<void> {
  await db.tasks.update(id, { done, doneAt: done ? nowIso() : null });
}

export async function deleteTask(id: string): Promise<void> {
  await db.tasks.delete(id);
}

export async function listTasksForDate(dateStr: string): Promise<Task[]> {
  return db.tasks.where('dueDate').equals(dateStr).toArray();
}

/** Overdue, still-open tasks that the missed sweep has not yet penalised. */
export async function listUnhandledOverdueTasks(beforeDate: string): Promise<Task[]> {
  const all = await db.tasks.where('dueDate').below(beforeDate).toArray();
  return all.filter((t) => !t.done && !t.missedHandled);
}

/* ---------------- Logs (append-only ledger) ---------------- */

export type NewLog = {
  date: string;
  kind: LogKind;
  refId: string;
  count?: number;
  starsDelta: number;
};

export async function addLog(input: NewLog): Promise<LogEntry> {
  const entry: LogEntry = {
    id: newId(),
    count: 1,
    createdAt: nowIso(),
    ...input,
  };
  await db.logs.add(entry);
  return entry;
}

/** Remove the most recent log for a ref on a date. The only sanctioned delete. */
export async function undoLastLogFor(refId: string, date: string): Promise<LogEntry | null> {
  const entries = await db.logs.where('[refId+date]').equals([refId, date]).toArray();
  if (entries.length === 0) return null;
  entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const last = entries[entries.length - 1];
  await db.logs.delete(last.id);
  return last;
}

export async function listLogsInRange(startStr: string, endStr: string): Promise<LogEntry[]> {
  return db.logs.where('date').between(startStr, endStr, true, true).toArray();
}

export async function listLogsForDate(dateStr: string): Promise<LogEntry[]> {
  return db.logs.where('date').equals(dateStr).toArray();
}

export async function listLogsFor(refId: string, date: string): Promise<LogEntry[]> {
  return db.logs.where('[refId+date]').equals([refId, date]).toArray();
}

export async function listAllLogs(): Promise<LogEntry[]> {
  return db.logs.toArray();
}

/* ---------------- Rewards ---------------- */

export async function addReward(name: string, cost: number): Promise<Reward> {
  const reward: Reward = { id: newId(), name, cost, archived: false };
  await db.rewards.add(reward);
  return reward;
}

export async function updateReward(id: string, patch: Partial<Reward>): Promise<void> {
  await db.rewards.update(id, patch);
}

export async function archiveReward(id: string): Promise<void> {
  await db.rewards.update(id, { archived: true });
}

export async function listRewards(): Promise<Reward[]> {
  const all = await db.rewards.toArray();
  // Cheapest first: closest-to-reach reads best, and it gives the list a
  // stable order (raw IndexedDB order is by random UUID, so it would shuffle).
  return all
    .filter((r) => !r.archived)
    .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
}

/* ---------------- AppState ---------------- */

export async function getAppState() {
  return db.appState.get('singleton');
}

export async function addLifetimeStars(amount: number): Promise<void> {
  if (amount <= 0) return; // lifetime is monotonic — positives only
  await db.transaction('rw', db.appState, async () => {
    const s = await db.appState.get('singleton');
    if (s) await db.appState.update('singleton', { lifetimeStars: s.lifetimeStars + amount });
  });
}

/** Undo support: the one place lifetime may decrease, reversing a prior earn. */
export async function subtractLifetimeStars(amount: number): Promise<void> {
  if (amount <= 0) return;
  await db.transaction('rw', db.appState, async () => {
    const s = await db.appState.get('singleton');
    if (s) {
      await db.appState.update('singleton', {
        lifetimeStars: Math.max(0, s.lifetimeStars - amount),
      });
    }
  });
}

/* ---------------- Daily targets ---------------- */

export async function getDailyTarget(date: string) {
  return db.dailyTargets.get(date);
}

export async function setDailyTarget(date: string, value: number): Promise<void> {
  await db.dailyTargets.put({ date, value });
}

export async function listDailyTargets() {
  return db.dailyTargets.toArray();
}
