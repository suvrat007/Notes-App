/**
 * FORGE task -> Google Calendar event.
 *
 * One event per task. Tasks with no `dueTime` become all-day events, which is
 * how they already behave in FORGE; a time turns them into a 30-minute block.
 */
import { gfetch } from './api';
import { CALENDAR_API, DEFAULT_CALENDAR_ID, localTimeZone } from './config';
import type { Task } from '../../db/schema';
import { addDays, fromDateStr, toDateStr } from '../dates';

/** How long a timed task blocks out. Tasks have no duration of their own. */
const DEFAULT_DURATION_MIN = 30;

interface EventDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

interface CalendarEvent {
  id: string;
  summary?: string;
  status?: string;
}

/** Local `YYYY-MM-DDTHH:MM:SS` — no Z, because we send an explicit timeZone. */
function localDateTime(dateStr: string, timeStr: string, plusMinutes = 0): string {
  const [h, m] = timeStr.split(':').map(Number);
  const d = fromDateStr(dateStr);
  d.setHours(h, m + plusMinutes, 0, 0);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  // Re-read the date too: +30min at 23:50 legitimately lands on the next day.
  return `${toDateStr(d)}T${hh}:${mm}:00`;
}

function timing(task: Task): { start: EventDateTime; end: EventDateTime } {
  if (!task.dueTime) {
    // All-day events use exclusive end dates, so a one-day event ends the
    // following morning. Passing the same date yields an invalid range.
    return {
      start: { date: task.dueDate },
      end: { date: addDays(task.dueDate, 1) },
    };
  }
  const tz = localTimeZone();
  return {
    start: { dateTime: localDateTime(task.dueDate, task.dueTime), timeZone: tz },
    end: {
      dateTime: localDateTime(task.dueDate, task.dueTime, DEFAULT_DURATION_MIN),
      timeZone: tz,
    },
  };
}

/** Exported for inspection: this mapping is the part most worth eyeballing. */
export function eventBody(task: Task) {
  return {
    // A done task stays on the calendar as a record — striking it with a tick
    // reads better than deleting history the user completed.
    summary: (task.done ? '✓ ' : '') + task.name,
    description: `${task.stars} ★ in FORGE`,
    ...timing(task),
    // Lets a future reconciliation pass find FORGE's own events without
    // guessing from the title. Private = visible only to this app + owner.
    extendedProperties: { private: { forgeTaskId: task.id } },
    reminders: task.dueTime
      ? { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] }
      : { useDefault: true },
  };
}

function base(calendarId: string): string {
  return `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`;
}

export async function createEvent(task: Task, calendarId = DEFAULT_CALENDAR_ID): Promise<string> {
  const ev = await gfetch<CalendarEvent>(base(calendarId), {
    method: 'POST',
    body: eventBody(task),
  });
  return ev.id;
}

export async function updateEvent(
  remoteId: string,
  task: Task,
  calendarId = DEFAULT_CALENDAR_ID,
): Promise<void> {
  await gfetch(`${base(calendarId)}/${encodeURIComponent(remoteId)}`, {
    method: 'PATCH',
    body: eventBody(task),
  });
}

export async function deleteEvent(
  remoteId: string,
  calendarId = DEFAULT_CALENDAR_ID,
): Promise<void> {
  await gfetch(`${base(calendarId)}/${encodeURIComponent(remoteId)}`, { method: 'DELETE' });
}

export interface CalendarSummary {
  id: string;
  summary: string;
  primary?: boolean;
}

/** Writable calendars, for the settings picker. */
export async function listCalendars(): Promise<CalendarSummary[]> {
  const res = await gfetch<{ items?: (CalendarSummary & { accessRole?: string })[] }>(
    `${CALENDAR_API}/users/me/calendarList?minAccessRole=writer`,
  );
  return (res.items ?? []).map((c) => ({ id: c.id, summary: c.summary, primary: c.primary }));
}
