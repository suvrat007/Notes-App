/**
 * Google integration constants.
 *
 * The client ID is public by design — OAuth client IDs are not secrets, and
 * Google's browser flow requires it in the page. A client *secret* must never
 * appear here: Vite inlines every `VITE_*` value into the shipped bundle
 * (see the same warning in `lib/intent/groq.ts`). The browser token flow does
 * not use one, so there is nothing to leak as long as nobody adds it.
 */

export function googleClientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();
}

export function isGoogleConfigured(): boolean {
  return googleClientId().length > 0;
}

/**
 * `calendar.events` rather than full `calendar`: FORGE creates and edits its
 * own events and has no business reading calendar settings or ACLs. Google
 * classes both as sensitive scopes, so a publicly-distributed build needs
 * OAuth verification; a personal install can stay in Testing mode.
 *
 * `tasks` is what the old Google Reminders became — there has never been a
 * public Reminders API, and the Assistant/Calendar reminders were migrated
 * into Tasks, so this is the correct target for "remind me" behaviour.
 */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
].join(' ');

/**
 * Just enough to know WHO is using the app.
 *
 * Deliberately separate from GOOGLE_SCOPES: signing in should not make anyone
 * hand over their calendar. Calendar and Tasks are asked for later, and only
 * by someone who actually turns sync on.
 */
export const IDENTITY_SCOPES = 'openid email profile';

/** Exchanges an access token for the profile behind it. No JWT to verify. */
export const USERINFO_API = 'https://www.googleapis.com/oauth2/v3/userinfo';

export const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
export const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';

/** The Google Identity Services client library. Loaded on demand, never precached. */
export const GIS_SRC = 'https://accounts.google.com/gsi/client';

/** Defaults when the user hasn't picked a specific calendar / list. */
export const DEFAULT_CALENDAR_ID = 'primary';
export const DEFAULT_TASKLIST_ID = '@default';

/** IANA zone for the events we create, e.g. "Asia/Kolkata". */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
