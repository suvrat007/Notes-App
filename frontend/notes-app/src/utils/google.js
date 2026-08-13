/**
 * Google sign-in, on our own button.
 *
 * Google's drop-in button renders in an iframe and cannot be restyled, which
 * would put a stock white pill in the middle of a dark console UI. So we use
 * the token flow from our own button instead and let the SERVER decide whether
 * the token is real — see /auth/google, which checks the token was issued to
 * this application before it trusts a thing about it.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';

export const googleClientId = () => (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
export const isGoogleConfigured = () => googleClientId().length > 0;

export class GoogleSignInError extends Error {}

let scriptPromise = null;

function loadGis() {
  const ready = window.google?.accounts?.oauth2;
  if (ready) return Promise.resolve(ready);

  scriptPromise ??= new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    const el = existing ?? document.createElement('script');

    const settle = () => {
      const oauth2 = window.google?.accounts?.oauth2;
      if (oauth2) resolve(oauth2);
      else reject(new GoogleSignInError('Google sign-in loaded but exposed no client.'));
    };

    el.addEventListener('load', settle);
    el.addEventListener('error', () => {
      // Being offline is temporary; don't cache the failure forever.
      scriptPromise = null;
      reject(new GoogleSignInError("Couldn't reach Google. Check your connection."));
    });

    if (!existing) {
      el.src = GIS_SRC;
      el.async = true;
      el.defer = true;
      document.head.appendChild(el);
    } else if (window.google?.accounts?.oauth2) {
      settle();
    }
  });

  return scriptPromise;
}

let tokenClient = null;

/**
 * Ask Google for an access token.
 *
 * MUST be called from a click. The flow opens a popup, and every browser blocks
 * popups no gesture asked for — on iOS most of all.
 */
export async function requestGoogleAccessToken() {
  if (!isGoogleConfigured()) {
    throw new GoogleSignInError(
      'This build has no Google client ID, so Google sign-in is unavailable.',
    );
  }

  const oauth2 = await loadGis();
  tokenClient ??= oauth2.initTokenClient({
    client_id: googleClientId(),
    // Only enough to know who they are. Signing in should not hand over a calendar.
    scope: 'openid email profile',
    callback: () => {},
  });

  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.access_token) resolve(resp.access_token);
      else reject(new GoogleSignInError(resp.error_description || resp.error || 'Google returned no account.'));
    };
    tokenClient.error_callback = (err) => {
      const kind = err?.type ?? '';
      if (kind.includes('popup_failed')) {
        reject(new GoogleSignInError('The sign-in window was blocked. Allow pop-ups, then try again.'));
      } else if (kind.includes('popup_closed')) {
        reject(new GoogleSignInError('Sign-in was cancelled.'));
      } else {
        reject(new GoogleSignInError(err?.message || 'Google sign-in failed. Try again.'));
      }
    };

    // 'select_account' rather than 'consent': someone signing in wants to pick
    // an account, not re-approve scopes they already granted.
    tokenClient.requestAccessToken({ prompt: 'select_account' });
  });
}
