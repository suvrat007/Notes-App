import { db } from './schema';
import * as q from './queries';
import { missedTaskDelta } from '../engine/stars';
import { todayStr } from '../lib/dates';

/**
 * Penalise tasks whose dueDate has passed while still undone.
 *
 * Runs on startup. `missedHandled` is the idempotence guard — without it a
 * second reload would charge the user again for the same missed task. The
 * flag and the log are written in one transaction so a crash between them
 * can't produce a penalty that never gets marked (or vice versa).
 *
 * Returns the number of tasks penalised.
 */
export async function sweepMissedTasks(): Promise<number> {
  const today = todayStr();
  const overdue = await q.listUnhandledOverdueTasks(today);
  if (overdue.length === 0) return 0;

  await db.transaction('rw', db.tasks, db.logs, async () => {
    for (const t of overdue) {
      // Re-read inside the transaction: another tab may have handled it.
      const fresh = await db.tasks.get(t.id);
      if (!fresh || fresh.done || fresh.missedHandled) continue;

      await db.logs.add({
        id: crypto.randomUUID(),
        date: fresh.dueDate, // the penalty belongs to the day it was due
        kind: 'missed-task',
        refId: fresh.id,
        count: 1,
        starsDelta: missedTaskDelta(fresh),
        createdAt: new Date().toISOString(),
      });
      await db.tasks.update(fresh.id, { missedHandled: true });
    }
  });

  return overdue.length;
}
