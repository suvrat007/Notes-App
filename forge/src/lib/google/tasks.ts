/**
 * FORGE task -> Google Tasks item.
 *
 * This is the "Reminders" half of the integration. Google retired standalone
 * Reminders and migrated them into Tasks; there is no Reminders API to target,
 * so anything the user thinks of as a Google reminder lands here.
 */
import { gfetch } from './api';
import { TASKS_API, DEFAULT_TASKLIST_ID } from './config';
import type { Task } from '../../db/schema';

interface GTask {
  id: string;
  title?: string;
  status?: string;
}

/**
 * Google Tasks stores `due` as RFC3339 but **discards the time component** —
 * the API documents it as date-only. So there is no point mapping `dueTime`
 * here; that detail only survives on the Calendar side. Sending UTC midnight
 * is the conventional way to express "this date" without a timezone shifting
 * the day, since Google reads only the date portion back out.
 */
function taskBody(task: Task) {
  return {
    title: task.name,
    notes: `${task.stars} ★ in FORGE`,
    due: `${task.dueDate}T00:00:00.000Z`,
    status: task.done ? 'completed' : 'needsAction',
    // Clearing `completed` is required when reopening: leaving a stale
    // timestamp alongside status 'needsAction' is rejected as inconsistent.
    completed: task.done ? (task.doneAt ?? new Date().toISOString()) : null,
  };
}

function base(listId: string): string {
  return `${TASKS_API}/lists/${encodeURIComponent(listId)}/tasks`;
}

export async function createTask(task: Task, listId = DEFAULT_TASKLIST_ID): Promise<string> {
  const created = await gfetch<GTask>(base(listId), { method: 'POST', body: taskBody(task) });
  return created.id;
}

export async function updateTask(
  remoteId: string,
  task: Task,
  listId = DEFAULT_TASKLIST_ID,
): Promise<void> {
  await gfetch(`${base(listId)}/${encodeURIComponent(remoteId)}`, {
    method: 'PATCH',
    body: taskBody(task),
  });
}

export async function deleteTask(
  remoteId: string,
  listId = DEFAULT_TASKLIST_ID,
): Promise<void> {
  await gfetch(`${base(listId)}/${encodeURIComponent(remoteId)}`, { method: 'DELETE' });
}

export interface TaskListSummary {
  id: string;
  title: string;
}

/** Task lists, for the settings picker. */
export async function listTaskLists(): Promise<TaskListSummary[]> {
  const res = await gfetch<{ items?: TaskListSummary[] }>(`${TASKS_API}/users/@me/lists`);
  return res.items ?? [];
}
