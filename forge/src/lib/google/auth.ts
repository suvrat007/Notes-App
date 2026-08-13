/**
 * Google OAuth for an app with no server.
 *
 * Google does not issue refresh tokens to browser clients, so the best
 * available is the GIS *token* flow: a ~1 hour access token held in memory.
 * Three consequences we design around rather than paper over:
 *
 *  1. Nothing syncs while the app is closed. That is precisely why
 *     `db/sync.ts` exists — writes queue locally and drain when next open.
 *  2. The token is never persisted. localStorage would expose it to any XSS
 *     and it would be expired by the next launch anyway.
 *  3. On reload we re-request silently (`prompt: ''`), which succeeds without
 *     any UI if the user still has a Google session and already granted the
 *     scopes. If it doesn't, we simply stay disconnected — never a popup the
 *     user didn't ask for, since browsers block those outside a gesture.
 */
import { googleClientId, isGoogleConfigured, GOOGLE_SCOPES, GIS_SRC } from './config';

/* ---------------- Minimal GIS typings ---------------- */
// The `google.accounts.oauth2` surface we use. Typing just this much avoids a
// dependency on @types/google.accounts for four fields.

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface TokenClientError {
  type?: string;
  message?: string;
}

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}

interface GisOAuth2 {
  initTokenClient: (cfg: {
    client_id: string;
    scope: string;
    callback: (resp: TokenResponse) => void;
    error_callback?: (err: TokenClientError) => void;
  }) => TokenClient;
  revoke: (token: string, done: () => void) => void;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GisOAuth2 } };
  }
}

/* ---------------- Script loading ---------------- */

let scriptPromise: Promise<GisOAuth2> | null = null;

/**
 * Load the GIS client once. Deliberately not precached by the service worker
 * (the workbox globs only match local build output), so offline this rejects
 * quickly and the caller falls back to "not connected" rather than hanging.
 */
function loadGis(): Promise<GisOAuth2> {
  const ready = window.google?.accounts?.oauth2;
  if (ready) return Promise.resolve(ready);

  scriptPromise ??= new Promise<GisOAuth2>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const el = existing ?? document.createElement('script');

    const settle = () => {
      const oauth2 = window.google?.accounts?.oauth2;
      if (oauth2) resolve(oauth2);
      else reject(new Error('Google sign-in library loaded but exposed no oauth2 client.'));
    };

    el.addEventListener('load', settle);
    el.addEventListener('error', () => {
      // Let a later attempt retry rather than caching the failure forever —
      // this fails simply by being offline, which is a temporary condition.
      scriptPromise = null;
      reject(new Error("Couldn't reach Google. Check your connection."));
    });

    if (!existing) {
      el.src = GIS_SRC;
      el.async = true;
      el.defer = true;
      document.head.appendChild(el);
    }
  });

  return scriptPromise;
}

/* ---------------- Token state (memory only) ---------------- */

let accessToken: string | null = null;
let expiresAt = 0;
let tokenClient: TokenClient | null = null;
/** In-flight request, so parallel drains share one prompt instead of racing. */
let pending: Promise<string> | null = null;

const listeners = new Set<() => void>();

/** Subscribe to connect/disconnect so UI can re-render. */
export function onAuthChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function announce() {
  for (const fn of listeners) fn();
}

/** Treat a token as stale a minute early so a drain can't start on a dying one. */
const SKEW_MS = 60_000;

export function hasValidToken(): boolean {
  return accessToken !== null && Date.now() < expiresAt - SKEW_MS;
}

export function currentToken(): string | null {
  return hasValidToken() ? accessToken : null;
}

function setToken(token: string, expiresInSec: number) {
  accessToken = token;
  expiresAt = Date.now() + expiresInSec * 1000;
  announce();
}

export class GoogleAuthError extends Error {}

async function client(): Promise<TokenClient> {
  if (tokenClient) return tokenClient;
  if (!isGoogleConfigured()) {
    throw new GoogleAuthError('No Google client ID built in. Set VITE_GOOGLE_CLIENT_ID.');
  }

  const oauth2 = await loadGis();
  tokenClient = oauth2.initTokenClient({
    client_id: googleClientId(),
    scope: GOOGLE_SCOPES,
    // Replaced per-request below; GIS requires one at construction time.
    callback: () => {},
  });
  return tokenClient;
}

/**
 * Get a usable access token.
 *
 * @param interactive true only when a user gesture triggered this. A popup
 *   outside a gesture is blocked by the browser, so background drains must
 *   pass false and accept failure.
 */
export async function getAccessToken(interactive: boolean): Promise<string> {
  if (hasValidToken()) return accessToken as string;
  if (pending) return pending;

  pending = (async () => {
    const tc = await client();

    return await new Promise<string>((resolve, reject) => {
      // GIS has no per-request callback, so rebind before each call. The cast
      // is needed because our narrow TokenClient type hides the mutable field.
      const mutable = tc as TokenClient & {
        callback: (r: TokenResponse) => void;
        error_callback: (e: TokenClientError) => void;
      };

      mutable.callback = (resp) => {
        if (resp.access_token && resp.expires_in) {
          setToken(resp.access_token, resp.expires_in);
          resolve(resp.access_token);
        } else {
          reject(new GoogleAuthError(resp.error_description || resp.error || 'Authorization failed.'));
        }
      };
      mutable.error_callback = (err) => {
        reject(new GoogleAuthError(err.message || err.type || 'Authorization was dismissed.'));
      };

      // '' asks Google to reuse an existing grant silently; 'consent' forces
      // the account-picker + scope screen, which is what a real connect needs.
      tc.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    });
  })();

  try {
    return await pending;
  } finally {
    pending = null;
  }
}

/** Drop the cached token so the next call re-authorizes. Used on a 401. */
export function invalidateToken(): void {
  accessToken = null;
  expiresAt = 0;
  announce();
}

/**
 * Try to restore a session without any UI. Returns whether it worked.
 * Safe to call on every startup — it never prompts.
 */
export async function trySilentAuth(): Promise<boolean> {
  if (!isGoogleConfigured()) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    await getAccessToken(false);
    return true;
  } catch {
    return false;
  }
}

/** Revoke the grant at Google, not just locally. */
export async function disconnect(): Promise<void> {
  const token = accessToken;
  invalidateToken();
  if (!token) return;
  try {
    const oauth2 = await loadGis();
    await new Promise<void>((resolve) => oauth2.revoke(token, resolve));
  } catch {
    // Offline, or the library never loaded. The local token is already gone,
    // which is the part that matters here; the grant can be revoked from the
    // Google account page if the user cares.
  }
}
