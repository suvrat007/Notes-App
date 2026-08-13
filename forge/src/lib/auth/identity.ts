/**
 * Who is using FORGE.
 *
 * WHAT THIS IS: a gate and an identity, not a security boundary. FORGE has no
 * server — every habit, log and star lives in this browser's IndexedDB. Anyone
 * with the unlocked device can open devtools and read it whether or not they
 * signed in. Signing in decides WHOSE data the app opens, keeps one person's
 * tracker off another's screen, and gives Google sync an account to sync with.
 * It does not encrypt anything and it cannot, without a backend to hold a key.
 *
 * WHY THE TOKEN FLOW AND NOT AN ID TOKEN: an ID token is a signed JWT whose
 * signature only means something if a server verifies it. Verifying it here
 * would be theatre — the same code deciding the answer could just say yes. So
 * we take the access token the app already knows how to get, ask Google who it
 * belongs to, and store that. Same trust level, far less machinery.
 */
import { googleClientId, isGoogleConfigured, IDENTITY_SCOPES, USERINFO_API, GIS_SRC }
  from '../google/config';

export interface Account {
  /** Google's stable per-user id. The thing data is keyed to. */
  sub: string;
  email: string;
  name: string;
  picture: string;
}

export class SignInError extends Error {}

/* ---------------- GIS loading (identity's own copy) ---------------- */

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
}

interface GisOAuth2 {
  initTokenClient: (cfg: {
    client_id: string;
    scope: string;
    callback: (resp: TokenResponse) => void;
    error_callback?: (err: { type?: string; message?: string }) => void;
  }) => TokenClient;
}

function gis(): GisOAuth2 | undefined {
  return (window as unknown as {
    google?: { accounts?: { oauth2?: GisOAuth2 } };
  }).google?.accounts?.oauth2;
}

let scriptPromise: Promise<GisOAuth2> | null = null;

function loadGis(): Promise<GisOAuth2> {
  const ready = gis();
  if (ready) return Promise.resolve(ready);

  scriptPromise ??= new Promise<GisOAuth2>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const el = existing ?? document.createElement('script');

    const settle = () => {
      const oauth2 = gis();
      if (oauth2) resolve(oauth2);
      else reject(new SignInError('Google sign-in loaded but exposed no client.'));
    };

    el.addEventListener('load', settle);
    el.addEventListener('error', () => {
      // Being offline is temporary, so don't cache the failure forever.
      scriptPromise = null;
      reject(new SignInError("Couldn't reach Google. Check your connection and try again."));
    });

    if (!existing) {
      el.src = GIS_SRC;
      el.async = true;
      el.defer = true;
      document.head.appendChild(el);
    } else {
      // Already in the document from the sync module — it may have finished.
      if (gis()) settle();
    }
  });

  return scriptPromise;
}

/*
 * Its own token client, with its own scopes. Sharing the sync module's client
 * would mean asking for Calendar and Tasks access just to see a name.
 */
let tokenClient: TokenClient | null = null;

async function identityClient(): Promise<TokenClient> {
  if (tokenClient) return tokenClient;
  if (!isGoogleConfigured()) {
    throw new SignInError(
      'This build has no Google client ID, so sign-in is unavailable. '
      + 'Set VITE_GOOGLE_CLIENT_ID and rebuild.',
    );
  }
  const oauth2 = await loadGis();
  tokenClient = oauth2.initTokenClient({
    client_id: googleClientId(),
    scope: IDENTITY_SCOPES,
    callback: () => {},   // rebound per request below
  });
  return tokenClient;
}

/**
 * Ask Google who the user is.
 *
 * MUST be called from a click. The flow opens a popup, and every browser
 * blocks popups that no gesture asked for — on iOS most of all.
 */
export async function signInWithGoogle(): Promise<Account> {
  const tc = await identityClient();

  const token = await new Promise<string>((resolve, reject) => {
    const mutable = tc as TokenClient & {
      callback: (r: TokenResponse) => void;
      error_callback: (e: { type?: string; message?: string }) => void;
    };

    mutable.callback = (resp) => {
      if (resp.access_token) resolve(resp.access_token);
      else {
        reject(new SignInError(
          resp.error_description || resp.error || 'Google did not return an account.',
        ));
      }
    };
    mutable.error_callback = (err) => {
      // popup_closed / popup_failed_to_open are the two the user can act on,
      // and the generic message for either is useless on a phone.
      const kind = err.type ?? '';
      if (kind.includes('popup_failed')) {
        reject(new SignInError(
          'The sign-in window was blocked. Allow pop-ups for this site, then try again.',
        ));
      } else if (kind.includes('popup_closed')) {
        reject(new SignInError('Sign-in was cancelled.'));
      } else {
        reject(new SignInError(err.message || 'Sign-in failed. Try again.'));
      }
    };

    // 'select_account' rather than 'consent': someone signing in wants to
    // choose which account, not to re-approve scopes they already granted.
    tc.requestAccessToken({ prompt: 'select_account' });
  });

  return await fetchProfile(token);
}

async function fetchProfile(token: string): Promise<Account> {
  let res: Response;
  try {
    res = await fetch(USERINFO_API, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new SignInError('Signed in, but could not reach Google to read your profile.');
  }
  if (!res.ok) throw new SignInError(`Google rejected the profile request (${res.status}).`);

  const j = await res.json().catch(() => null) as {
    sub?: string; email?: string; name?: string; picture?: string;
  } | null;

  if (!j?.sub) throw new SignInError('Google returned a profile with no account id.');

  return {
    sub: j.sub,
    email: j.email ?? '',
    // Falling back to the email keeps the greeting from reading "Welcome, ".
    name: j.name || j.email || 'Signed in',
    picture: j.picture ?? '',
  };
}
