/**
 * Thin authenticated fetch over the Google REST APIs.
 *
 * Its main job is classifying failures into *retriable* and *permanent*, which
 * is what lets the outbox in `db/sync.ts` decide between leaving an entry
 * queued and dropping it. Getting that wrong either loses a write silently or
 * retries a hopeless one forever.
 */
import { getAccessToken, invalidateToken } from './auth';

export class GoogleApiError extends Error {
  readonly status: number;
  /** Worth trying again later (network, rate limit, server fault). */
  readonly retriable: boolean;

  // Fields assigned in the body rather than as parameter properties: this
  // project builds with `erasableSyntaxOnly`, which rejects the shorthand.
  constructor(message: string, status: number, retriable: boolean) {
    super(message);
    this.status = status;
    this.retriable = retriable;
  }
}

/** 404/410 on a delete means someone beat us to it — the goal state is reached. */
export function isAlreadyGone(e: unknown): boolean {
  return e instanceof GoogleApiError && (e.status === 404 || e.status === 410);
}

type RequestInitJson = Omit<RequestInit, 'body'> & { body?: unknown };

const TIMEOUT_MS = 10_000;

async function once<T>(url: string, init: RequestInitJson, token: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch (e) {
    // Aborts and DNS/offline failures are the definition of "try again later".
    clearTimeout(timer);
    const msg = e instanceof Error && e.name === 'AbortError' ? 'Google request timed out.' : 'Network error reaching Google.';
    throw new GoogleApiError(msg, 0, true);
  }
  clearTimeout(timer);

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const parsed: unknown = text ? safeJson(text) : null;

  if (!res.ok) {
    const message = errorMessage(parsed) ?? `Google API ${res.status}`;
    // 401 -> token died; 403/429 -> quota or rate limit; 5xx -> their side.
    // Everything else (400 bad request, 404 missing) is our problem and will
    // fail identically on every retry.
    const retriable = res.status === 429 || res.status >= 500 || res.status === 403;
    throw new GoogleApiError(message, res.status, retriable);
  }

  return parsed as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function errorMessage(parsed: unknown): string | null {
  const body = parsed as { error?: { message?: string } | string } | null;
  if (!body || typeof body !== 'object') return null;
  if (typeof body.error === 'string') return body.error;
  return body.error?.message ?? null;
}

/**
 * Authenticated request with a single re-auth retry.
 *
 * Never interactive: this runs from background drains, where a popup would be
 * blocked anyway. If the silent refresh fails the error propagates and the
 * outbox keeps the entry for the next attempt.
 */
export async function gfetch<T>(url: string, init: RequestInitJson = {}): Promise<T> {
  const token = await getAccessToken(false);

  try {
    return await once<T>(url, init, token);
  } catch (e) {
    if (!(e instanceof GoogleApiError) || e.status !== 401) throw e;

    // The token expired mid-flight or was revoked. Drop it and take one more
    // run at it; a second 401 means the grant is genuinely gone.
    invalidateToken();
    const fresh = await getAccessToken(false);
    return await once<T>(url, init, fresh);
  }
}
