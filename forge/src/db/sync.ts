/**
 * Offline outbox for Google sync.
 *
 * FORGE is offline-first and that must not regress: every local write commits
 * to Dexie unconditionally, and *then* records an intent to push. Nothing here
 * can fail a user action — if Google is unreachable, unauthorized, or simply
 * switched off, the entry waits in `syncQueue` until a later drain.
 *
 * The queue is keyed by `${target}:${taskId}`, so repeated edits to one task
 * coalesce into a single pending entry. Drain re-reads the task from Dexie at
 * push time, which means a coalesced entry always sends the newest state and
 * never replays a stale intermediate version.
 */
import { db, type SyncTarget, type SyncQueueItem, type Settings } from './schema';
import { DEFAULT_CALENDAR_ID, DEFAULT_TASKLIST_ID, isGoogleConfigured } from '../lib/google/config';
import { hasValidToken } from '../lib/google/auth';
import { GoogleApiError, isAlreadyGone } from '../lib/google/api';
import * as cal from '../lib/google/calendar';
import * as gtasks from '../lib/google/tasks';

/** Stop retrying after this many consecutive failures, so a permanently bad
 *  entry can't burn quota forever. Surfaced in the UI as a stuck count. */
const MAX_ATTEMPTS = 5;

/**
 * Strictly-increasing timestamp, same trick as `queries.ts`. `queuedAt` is not
 * decoration: drain compares it to detect an entry that was re-queued while a
 * push was in flight, and two enqueues inside one millisecond would otherwise
 * tie and defeat that check.
 */
let lastTs = 0;
const nowIso = () => {
  let t = Date.now();
  if (t <= lastTs) t = lastTs + 1;
  lastTs = t;
  return new Date(t).toISOString();
};

/** Which targets the user has switched on. */
function activeTargets(settings: Settings): SyncTarget[] {
  const out: SyncTarget[] = [];
  if (settings.googleCalendar) out.push('calendar');
  if (settings.googleTasks) out.push('tasks');
  return out;
}

/* ---------------- Enqueue ---------------- */

/**
 * Record that a task needs pushing. Never throws — callers are mid-action and
 * a sync bookkeeping failure must not roll back a completed local write.
 */
export async function enqueueTask(
  taskId: string,
  op: 'upsert' | 'delete',
  /**
   * Explicit destinations for THIS task, overriding the global settings.
   * Voice capture asks per item ("calendar, tasks, or both?"), and a meeting
   * belongs somewhere different from an errand — a single global toggle
   * cannot express that. Omit to keep the settings-driven behaviour.
   */
  override?: SyncTarget[],
): Promise<void> {
  try {
    const state = await db.appState.get('singleton');
    if (!state?.settings.googleConnected) return;

    const targets = override ?? activeTargets(state.settings);
    if (targets.length === 0) return;

    // A delete only matters if we ever pushed the thing in the first place.
    const rows: SyncQueueItem[] = [];
    for (const target of targets) {
      const id = `${target}:${taskId}`;
      if (op === 'delete' && !(await db.syncLinks.get(id))) continue;
      rows.push({
        id,
        target,
        taskId,
        op,
        attempts: 0,
        lastError: null,
        queuedAt: nowIso(),
      });
    }
    if (rows.length > 0) await db.syncQueue.bulkPut(rows);
  } catch (e) {
    console.warn('[sync] could not queue task', taskId, e);
  }
}

/**
 * Queue a task, then kick a drain off in the background.
 *
 * The drain is deliberately not awaited: tapping "done" must feel instant, and
 * the intent is already durable in `syncQueue` by the time this resolves. A
 * failed push is a queued push, not a lost one.
 */
export async function syncTask(
  taskId: string,
  op: 'upsert' | 'delete',
  override?: SyncTarget[],
): Promise<void> {
  await enqueueTask(taskId, op, override);
  void drainQueue().catch((e) => console.warn('[sync] drain failed', e));
}

/**
 * Queue every existing open task. Used when the user first connects, so the
 * calendar reflects what is already in FORGE rather than only future edits.
 */
export async function enqueueBacklog(): Promise<number> {
  const state = await db.appState.get('singleton');
  if (!state) return 0;
  const targets = activeTargets(state.settings);
  if (targets.length === 0) return 0;

  const tasks = await db.tasks.toArray();
  // Done-and-gone history isn't worth pushing; open work and today's
  // completions are what a calendar is actually useful for.
  const relevant = tasks.filter((t) => !t.done || t.doneAt);

  const rows = relevant.flatMap((t) =>
    targets.map((target) => ({
      id: `${target}:${t.id}`,
      target,
      taskId: t.id,
      op: 'upsert' as const,
      attempts: 0,
      lastError: null,
      queuedAt: nowIso(),
    })),
  );
  await db.syncQueue.bulkPut(rows);
  return relevant.length;
}

/* ---------------- Drain ---------------- */

export interface DrainResult {
  pushed: number;
  failed: number;
  /** Entries left alone because we're offline / not authorized / switched off. */
  skipped: boolean;
  reason?: string;
}

/** One drain at a time — parallel runs would double-create remote objects. */
let draining = false;

/**
 * Remove a queue entry only if it is still the one we just pushed. Dexie has
 * no compare-and-delete, so this reads back and checks the monotonic
 * `queuedAt` stamp before removing.
 */
async function deleteIfUnchanged(item: SyncQueueItem): Promise<void> {
  await db.transaction('rw', db.syncQueue, async () => {
    const current = await db.syncQueue.get(item.id);
    if (current?.queuedAt === item.queuedAt) await db.syncQueue.delete(item.id);
  });
}

async function pushOne(item: SyncQueueItem, settings: Settings): Promise<void> {
  const link = await db.syncLinks.get(item.id);
  const task = await db.tasks.get(item.taskId);

  const calendarId = settings.googleCalendarId || DEFAULT_CALENDAR_ID;
  const listId = settings.googleTaskListId || DEFAULT_TASKLIST_ID;

  // The task may have been deleted after this entry was queued; the local row
  // is the source of truth, so its absence means "delete" regardless of `op`.
  const shouldDelete = item.op === 'delete' || !task;

  if (shouldDelete) {
    if (link) {
      try {
        if (item.target === 'calendar') await cal.deleteEvent(link.remoteId, calendarId);
        else await gtasks.deleteTask(link.remoteId, listId);
      } catch (e) {
        // Already deleted remotely is the state we wanted anyway.
        if (!isAlreadyGone(e)) throw e;
      }
      await db.syncLinks.delete(item.id);
    }
    return;
  }

  if (link) {
    try {
      if (item.target === 'calendar') await cal.updateEvent(link.remoteId, task, calendarId);
      else await gtasks.updateTask(link.remoteId, task, listId);
      await db.syncLinks.put({ ...link, syncedAt: nowIso() });
      return;
    } catch (e) {
      // The user deleted it from Google's side. Drop the dead link and fall
      // through to recreate, rather than failing this entry forever.
      if (!isAlreadyGone(e)) throw e;
      await db.syncLinks.delete(item.id);
    }
  }

  const remoteId =
    item.target === 'calendar'
      ? await cal.createEvent(task, calendarId)
      : await gtasks.createTask(task, listId);

  await db.syncLinks.put({
    id: item.id,
    target: item.target,
    taskId: item.taskId,
    remoteId,
    syncedAt: nowIso(),
  });
}

/**
 * Push everything pending. Best-effort by design: returns a result instead of
 * throwing, because every caller is a background trigger with no UI to own an
 * error. Entries that fail stay queued with their attempt count bumped.
 */
export async function drainQueue(): Promise<DrainResult> {
  if (draining) return { pushed: 0, failed: 0, skipped: true, reason: 'already running' };

  if (!isGoogleConfigured()) {
    return { pushed: 0, failed: 0, skipped: true, reason: 'no client ID configured' };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { pushed: 0, failed: 0, skipped: true, reason: 'offline' };
  }
  // Drains are never interactive, so without a live token there is nothing to
  // do but wait for the user to reconnect. Leave the queue untouched.
  if (!hasValidToken()) {
    return { pushed: 0, failed: 0, skipped: true, reason: 'not authorized' };
  }

  const state = await db.appState.get('singleton');
  if (!state?.settings.googleConnected) {
    return { pushed: 0, failed: 0, skipped: true, reason: 'sync is off' };
  }

  draining = true;
  let pushed = 0;
  let failed = 0;

  try {
    const items = (await db.syncQueue.toArray())
      .filter((i) => i.attempts < MAX_ATTEMPTS)
      .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));

    for (const item of items) {
      try {
        await pushOne(item, state.settings);
        // Only clear the entry we actually pushed. A push takes a network
        // round-trip, and the user can complete or edit that same task while
        // it is in flight — which re-queues the id. Deleting unconditionally
        // would drop that newer intent and leave Google showing stale state.
        await deleteIfUnchanged(item);
        pushed++;
      } catch (e) {
        failed++;
        const message = e instanceof Error ? e.message : String(e);
        const retriable = !(e instanceof GoogleApiError) || e.retriable;

        // Same guard: a re-queued entry is fresh work and must not inherit
        // the failure count of the attempt it replaced.
        const current = await db.syncQueue.get(item.id);
        if (current?.queuedAt === item.queuedAt) {
          await db.syncQueue.update(item.id, {
            // A permanent failure jumps straight to the cap. Retrying a 400
            // five times to reach the same conclusion helps nobody.
            attempts: retriable ? item.attempts + 1 : MAX_ATTEMPTS,
            lastError: message.slice(0, 200),
          });
        }

        // Auth died or we hit a rate limit — the rest of the batch will fail
        // the same way, so stop rather than burning attempts on all of it.
        if (e instanceof GoogleApiError && (e.status === 401 || e.status === 429 || e.status === 0)) {
          break;
        }
      }
    }
  } finally {
    draining = false;
  }

  return { pushed, failed, skipped: false };
}

/* ---------------- Status / maintenance ---------------- */

export interface QueueStatus {
  pending: number;
  /** Entries that hit the attempt cap and won't be retried automatically. */
  stuck: number;
  lastError: string | null;
}

export async function queueStatus(): Promise<QueueStatus> {
  const items = await db.syncQueue.toArray();
  const stuck = items.filter((i) => i.attempts >= MAX_ATTEMPTS);
  return {
    pending: items.length - stuck.length,
    stuck: stuck.length,
    lastError: items.find((i) => i.lastError)?.lastError ?? null,
  };
}

/** Give capped entries another chance, after the user fixes whatever broke. */
export async function retryStuck(): Promise<void> {
  await db.syncQueue.toCollection().modify((i) => {
    i.attempts = 0;
    i.lastError = null;
  });
}

/**
 * Forget the whole Google relationship locally. Remote objects are left alone
 * on purpose — silently deleting a user's calendar entries because they turned
 * off a toggle would be indefensible.
 */
export async function clearSyncState(): Promise<void> {
  await db.transaction('rw', [db.syncQueue, db.syncLinks], async () => {
    await db.syncQueue.clear();
    await db.syncLinks.clear();
  });
}
