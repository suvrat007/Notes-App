/**
 * iCalendar (.ics) export — the escape hatch for the whole integration.
 *
 * Works with no client ID, no OAuth, no network and no Google account: the
 * user gets a file they can import into Google Calendar, Apple Calendar or
 * Outlook by hand. That matters because the OAuth path can be unavailable for
 * reasons the user cannot fix (offline, an unverified app, a locked-down
 * Workspace account), and FORGE should never be *unable* to get data out.
 */
import type { Task } from '../../db/schema';
import { addDays, fromDateStr, toDateStr } from '../dates';

const DEFAULT_DURATION_MIN = 30;

/** RFC 5545 §3.3.11: backslash, semicolon and comma are escaped; newlines become \n. */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** `YYYYMMDD` for date-valued properties. */
function icsDate(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

/** `YYYYMMDDTHHMMSSZ` — UTC, which sidesteps shipping a VTIMEZONE block. */
function icsUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function localDateTimeUtc(dateStr: string, timeStr: string, plusMinutes = 0): string {
  const [h, m] = timeStr.split(':').map(Number);
  const d = fromDateStr(dateStr);
  d.setHours(h, m + plusMinutes, 0, 0);
  return icsUtc(d);
}

/**
 * RFC 5545 caps lines at 75 octets, continued by CRLF + one space. Long task
 * names are common enough that skipping this produces files some parsers
 * reject outright.
 */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest) parts.push(' ' + rest);
  return parts.join('\r\n');
}

function vevent(task: Task, stamp: string): string[] {
  const lines: string[] = [
    'BEGIN:VEVENT',
    // Stable per task, so re-importing updates the same event instead of
    // creating a duplicate.
    `UID:${task.id}@forge.local`,
    `DTSTAMP:${stamp}`,
    `SUMMARY:${escapeText((task.done ? '✓ ' : '') + task.name)}`,
    `DESCRIPTION:${escapeText(`${task.stars} ★ in FORGE`)}`,
    `STATUS:${task.done ? 'CONFIRMED' : 'TENTATIVE'}`,
  ];

  if (task.dueTime) {
    lines.push(`DTSTART:${localDateTimeUtc(task.dueDate, task.dueTime)}`);
    lines.push(`DTEND:${localDateTimeUtc(task.dueDate, task.dueTime, DEFAULT_DURATION_MIN)}`);
    lines.push('BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'END:VALARM');
  } else {
    // All-day: DTEND is exclusive, same rule as the Calendar API.
    lines.push(`DTSTART;VALUE=DATE:${icsDate(task.dueDate)}`);
    lines.push(`DTEND;VALUE=DATE:${icsDate(addDays(task.dueDate, 1))}`);
  }

  lines.push('END:VEVENT');
  return lines;
}

export function buildIcs(tasks: Task[]): string {
  const stamp = icsUtc(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FORGE//Habit and Task Tracker//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:FORGE',
    ...tasks.flatMap((t) => vevent(t, stamp)),
    'END:VCALENDAR',
  ];
  // CRLF is mandatory, not stylistic — LF-only files are rejected by strict parsers.
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function icsToBlob(ics: string): Blob {
  return new Blob([ics], { type: 'text/calendar;charset=utf-8' });
}

export function icsFilename(): string {
  return `forge-tasks-${toDateStr(new Date())}.ics`;
}
