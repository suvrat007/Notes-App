/**
 * Pure CRUD over Dexie. NO star math lives here — deltas arrive
 * pre-computed by `engine/`. This layer only reads and writes rows.
 */
import {
  db, migrateHabit,
  type Habit, type Task, type LogEntry, type Reward, type LogKind, type TaskHorizon,
} from './schema';
import { occurrenceDates, missingDates, repeats } from '../engine/series';
import { newId } from '../lib/id';
import { todayStr, weekStartOf, weekDates, addDays } from '../lib/dates';
import { DEFAULT_ICON } from '../lib/habitIconKeys';

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

/** Manual position first, creation order as the tiebreaker. */
function byOrder<T extends { order?: number; createdAt: string }>(a: T, b: T): number {
  const d = (a.order ?? 0) - (b.order ?? 0);
  return d !== 0 ? d : a.createdAt.localeCompare(b.createdAt);
}

/* ---------------- Habits ---------------- */

export type NewHabit = Partial<Habit> & Pick<Habit, 'name' | 'polarity'>;

export async function addHabit(input: NewHabit): Promise<Habit> {
  // A new habit belongs at the END of the manual order, never jumping the queue.
  const order = await db.habits.count();
  // `id` is set after the spread so a caller can never supply one.
  const habit: Habit = {
    order,
    icon: DEFAULT_ICON,
    starsPerRep: 10,
    dailyAllowance: 0,
    overagePenalty: 5,
    freeWithinAllowance: false,
    dailyTarget: 0,
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
    .sort(byOrder);
}

export async function getHabit(id: string): Promise<Habit | undefined> {
  const h = await db.habits.get(id);
  return h ? migrateHabit(h) : undefined;
}

/* ---------------- Tasks ---------------- */

export type NewTask = Partial<Task> & Pick<Task, 'name'>;

export async function addTask(input: NewTask): Promise<Task> {
  // New tasks join the end of the day's manual order.
  const order = await db.tasks.count();
  const task: Task = {
    order,
    dueDate: todayStr(),
    dueTime: null,
    stars: 10,
    targetCount: 1,
    doneCount: 0,
    horizon: 'once',
    seriesId: null,
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
  const rows = await db.tasks.where('dueDate').equals(dateStr).toArray();
  return rows.sort(byOrder);
}

/** Every task due today or later, for the Manage screen. */
export async function listUpcomingTasks(fromDate: string): Promise<Task[]> {
  const rows = await db.tasks.where('dueDate').aboveOrEqual(fromDate).toArray();
  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || byOrder(a, b));
}

/**
 * Persist a manual order.
 *
 * Positions are rewritten as a dense 0..n-1 sequence inside one transaction,
 * so a half-applied reorder can never leave two rows claiming the same slot.
 */
export async function reorderHabits(idsInOrder: string[]): Promise<void> {
  await db.transaction('rw', db.habits, async () => {
    await Promise.all(idsInOrder.map((id, i) => db.habits.update(id, { order: i })));
  });
}

export async function reorderTasks(idsInOrder: string[]): Promise<void> {
  await db.transaction('rw', db.tasks, async () => {
    await Promise.all(idsInOrder.map((id, i) => db.tasks.update(id, { order: i })));
  });
}

/**
 * How far back an unfinished task keeps following you. Without a limit a task
 * abandoned in March would still be on the list in June, which trains people
 * to ignore the list; two weeks is long enough to be a real nag and short
 * enough that the list stays about now.
 */
export const CARRY_OVER_DAYS = 14;

/**
 * Unfinished work from earlier days, to be shown alongside `dateStr`'s own.
 *
 * "Finish 2 PDFs" with one done does not stop existing at midnight — the
 * remaining one is still owed, and burying it on a past date is the same as
 * deleting it. Repeating tasks are excluded on purpose: a daily task already
 * has a fresh row waiting for today, so carrying yesterday's would show the
 * same thing twice.
 */
export async function listCarriedOverTasks(dateStr: string): Promise<Task[]> {
  const floor = addDays(dateStr, -CARRY_OVER_DAYS);
  const rows = await db.tasks
    .where('dueDate').between(floor, dateStr, true, false)
    .toArray();
  return rows
    .filter((t) => !t.done && !t.seriesId)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || byOrder(a, b));
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

export async function addReward(
  name: string, cost: number, damagePct = 20,
): Promise<Reward> {
  const reward: Reward = { id: newId(), name, cost, damagePct, archived: false };
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

/* ---------------- Repeating task series ---------------- */

/**
 * Turn a task into a repeating series, or change how often it repeats.
 *
 * Switching to `once` stops future repeats but keeps this occurrence — the
 * user is saying "not any more", not "that never happened".
 */
export async function setTaskHorizon(taskId: string, horizon: TaskHorizon): Promise<void> {
  const task = await db.tasks.get(taskId);
  if (!task) return;

  if (!repeats(horizon)) {
    await db.transaction('rw', db.tasks, async () => {
      if (task.seriesId) await deleteFutureOccurrences(task.seriesId, task.dueDate, true);
      await db.tasks.update(taskId, { horizon, seriesId: null });
    });
    return;
  }

  const seriesId = task.seriesId ?? newId();
  await db.tasks.update(taskId, { horizon, seriesId });
  await generateSeries(seriesId);
}

/**
 * Materialise any missing future occurrences of a series.
 *
 * Idempotent and additive: existing rows are never touched, so completions,
 * edits and sync links survive every top-up.
 */
export async function generateSeries(seriesId: string, from = todayStr()): Promise<number> {
  const rows = await db.tasks.where('seriesId').equals(seriesId).toArray();
  if (rows.length === 0) return 0;

  // The earliest occurrence anchors the cadence, so the weekday stays put.
  const anchor = rows.reduce((a, b) => (a.dueDate <= b.dueDate ? a : b));
  if (!repeats(anchor.horizon)) return 0;

  const wanted = occurrenceDates(anchor.dueDate, anchor.horizon, from);
  const missing = missingDates(wanted, rows.map((r) => r.dueDate));
  if (missing.length === 0) return 0;

  const order = await db.tasks.count();
  const created: Task[] = missing.map((dueDate, i) => ({
    ...anchor,
    id: newId(),
    dueDate,
    // A fresh occurrence starts untouched, whatever state the anchor is in.
    done: false,
    doneAt: null,
    doneCount: 0,
    missedHandled: false,
    createdAt: nowIso(),
    order: order + i,
  }));

  await db.tasks.bulkAdd(created);
  return created.length;
}

/** Top up every active series. Called on load so a series never runs dry. */
export async function generateAllSeries(from = todayStr()): Promise<number> {
  /*
   * This runs on every load, so it must cost nothing when there is nothing to
   * do. An indexed lookup returns immediately for the common case of a user
   * with no repeating tasks; the full table scan it replaces taxed every
   * single startup for a feature most loads never touch.
   */
  const repeating = await db.tasks.where('seriesId').notEqual('').toArray();
  if (repeating.length === 0) return 0;

  const ids = [...new Set(repeating.map((t) => t.seriesId).filter((s): s is string => !!s))];
  let made = 0;
  for (const id of ids) made += await generateSeries(id, from);
  return made;
}

/**
 * Drop occurrences after a date — "I finished this early, stop reminding me".
 *
 * Past and present occurrences stay: they carry the ledger entries that earned
 * the stars, and deleting them would rewrite history.
 */
export async function deleteFutureOccurrences(
  seriesId: string,
  after: string,
  keepDate = false,
): Promise<string[]> {
  const rows = await db.tasks.where('seriesId').equals(seriesId).toArray();
  const doomed = rows.filter((t) => (keepDate ? t.dueDate > after : t.dueDate >= after) && !t.done);
  await db.tasks.bulkDelete(doomed.map((t) => t.id));
  return doomed.map((t) => t.id);
}

/** Copy a task onto every remaining day of its week. */
export async function duplicateAcrossWeek(taskId: string, weekStartDay = 1): Promise<number> {
  const task = await db.tasks.get(taskId);
  if (!task) return 0;

  const start = weekStartOf(task.dueDate, weekStartDay);
  const dates = weekDates(start).filter((d) => d > task.dueDate);
  const existing = await db.tasks.where('dueDate').anyOf(dates).toArray();
  const clash = new Set(existing.filter((t) => t.name === task.name).map((t) => t.dueDate));

  const order = await db.tasks.count();
  const rows: Task[] = dates
    .filter((d) => !clash.has(d))
    .map((dueDate, i) => ({
      ...task,
      id: newId(),
      dueDate,
      done: false,
      doneAt: null,
      doneCount: 0,
      missedHandled: false,
      createdAt: nowIso(),
      order: order + i,
    }));

  if (rows.length > 0) await db.tasks.bulkAdd(rows);
  return rows.length;
}

/** Single task by id, for callers that only have the id. */
export async function getTaskById(id: string): Promise<Task | undefined> {
  return db.tasks.get(id);
}
