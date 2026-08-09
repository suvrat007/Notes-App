/**
 * Recurring-task bridge (pure).
 *
 * A habit flagged `isRecurringTask` should also appear as a row on the daily
 * task list. Rather than materialising a Task row per habit per day, we
 * synthesise a virtual row from the habit and read its done-state from the
 * habit's own reps that day — so a single tap has both effects and there is
 * exactly one source of truth. That structurally prevents the double-count
 * the spec warns about: there is no second record to fall out of sync.
 */
import type { HabitLike } from './types';

export interface VirtualTaskRow {
  /** Synthetic, stable per habit+date. Never written to the tasks table. */
  id: string;
  habitId: string;
  name: string;
  icon: string;
  stars: number;
  done: boolean;
  virtual: true;
}

export function virtualTaskId(habitId: string, date: string): string {
  return `habit:${habitId}:${date}`;
}

export function buildRecurringRows<T extends HabitLike & { name: string; icon: string }>(
  habits: T[],
  date: string,
  repsFor: (habitId: string) => number,
): VirtualTaskRow[] {
  return habits
    .filter((h) => (h as unknown as { isRecurringTask: boolean }).isRecurringTask)
    .filter((h) => h.polarity === 'good')
    .map((h) => ({
      id: virtualTaskId(h.id, date),
      habitId: h.id,
      name: h.name,
      icon: h.icon,
      stars: h.starsPerRep,
      done: repsFor(h.id) > 0,
      virtual: true as const,
    }));
}
