/**
 * Push a task to the user's own Google Tasks or Calendar.
 *
 * Done from the BROWSER with a token the user grants in the moment. The server
 * never sees a Google token and never stores one, which means this app cannot
 * touch anyone's calendar while they are not looking, and there is no long-lived
 * credential of ours to leak.
 *
 * The scopes are requested LAZILY, the first time someone actually pushes
 * something. Asking for calendar access during sign-up, from someone who only
 * wanted a habit tracker, is how consent screens get dismissed.
 */
import { googleClientId, isGoogleConfigured, GoogleSignInError } from './google';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

export const TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks';
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

let scriptPromise = null;

function loadGis() {
  const ready = window.google?.accounts?.oauth2;
  if (ready) return Promise.resolve(ready);

  scriptPromise ??= new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    const el = existing ?? document.createElement('script');
    const settle = () => {
      const o = window.google?.accounts?.oauth2;
      if (o) resolve(o);
      else reject(new GoogleSignInError('Google client failed to load.'));
    };
    el.addEventListener('load', settle);
    el.addEventListener('error', () => {
      scriptPromise = null;
      reject(new GoogleSignInError("Couldn't reach Google."));
    });
    if (!existing) {
      el.src = GIS_SRC;
      el.async = true;
      el.defer = true;
      document.head.appendChild(el);
    } else if (window.google?.accounts?.oauth2) settle();
  });
  return scriptPromise;
}

/*
 * Tokens live in memory only, keyed by scope. They expire in an hour and are
 * gone the moment the tab closes: nothing to steal from storage later.
 */
const tokens = new Map();

async function tokenFor(scope) {
  const held = tokens.get(scope);
  if (held && Date.now() < held.expiresAt - 60_000) return held.token;

  if (!isGoogleConfigured()) {
    throw new GoogleSignInError('This build has no Google client ID.');
  }

  const oauth2 = await loadGis();
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: googleClientId(),
      scope,
      callback: (resp) => {
        if (!resp.access_token) {
          reject(new GoogleSignInError(resp.error_description || 'Google refused access.'));
          return;
        }
        tokens.set(scope, {
          token: resp.access_token,
          expiresAt: Date.now() + (resp.expires_in ?? 3600) * 1000,
        });
        resolve(resp.access_token);
      },
      error_callback: (err) => {
        const kind = err?.type ?? '';
        if (kind.includes('popup_closed')) reject(new GoogleSignInError('Cancelled.'));
        else if (kind.includes('popup_failed')) {
          reject(new GoogleSignInError('The Google window was blocked. Allow pop-ups and try again.'));
        } else reject(new GoogleSignInError(err?.message || 'Google access failed.'));
      },
    });
    // MUST be inside a click, or the browser blocks the popup.
    client.requestAccessToken({ prompt: '' });
  });
}

async function call(url, token, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new GoogleSignInError(detail?.error?.message || `Google returned ${res.status}`);
  }
  return res.json();
}

/** Add the task to Google Tasks, due on its own date. */
export async function pushToGoogleTasks(task) {
  const token = await tokenFor(TASKS_SCOPE);
  // RFC3339. Google Tasks stores only the DATE part, so the time is arbitrary.
  const due = task.date ? `${task.date}T00:00:00.000Z` : undefined;
  const created = await call(`${TASKS_API}/lists/@default/tasks`, token, {
    title: task.title,
    notes: task.targetCount > 1 ? `${task.targetCount} to finish` : undefined,
    due,
  });
  return created.id;
}

/**
 * Add the task to Google Calendar.
 *
 * With a time it becomes a timed event; without one an all-day entry, because
 * inventing 9am for "sometime Tuesday" puts a wrong commitment in someone's
 * day. A repeating task carries its rule across as a real RRULE rather than
 * copying dozens of separate events.
 */
export async function pushToGoogleCalendar(task) {
  const token = await tokenFor(CALENDAR_SCOPE);
  const date = task.date;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const body = { summary: task.title };

  if (task.dueTime) {
    const start = `${date}T${task.dueTime}:00`;
    const [h, m] = task.dueTime.split(':').map(Number);
    const end = `${date}T${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    body.start = { dateTime: start, timeZone: tz };
    body.end = { dateTime: end, timeZone: tz };
  } else {
    const next = new Date(`${date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    body.start = { date };
    body.end = { date: next.toISOString().slice(0, 10) };
  }

  const RRULE = { daily: 'FREQ=DAILY', weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY' };
  if (RRULE[task.horizon]) body.recurrence = [`RRULE:${RRULE[task.horizon]}`];

  const created = await call(`${CALENDAR_API}/calendars/primary/events`, token, body);
  return created.id;
}
