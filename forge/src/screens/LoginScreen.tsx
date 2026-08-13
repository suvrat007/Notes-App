import { motion } from 'framer-motion';
import { useAuth } from '../store/useAuth';
import { IconCheck } from '../components/icons';

/**
 * The gate. Nothing else in the app renders until this is answered.
 *
 * It says plainly what signing in does and does not do. FORGE keeps everything
 * in this browser, so an account decides whose tracker opens — it is not a lock
 * on the data, and claiming otherwise would be a lie told to someone deciding
 * whether to trust the app with a year of their life.
 */
export default function LoginScreen() {
  const { signIn, busy, error, configured, status, account, heldBy, takeOver, cancelTakeOver } =
    useAuth();

  /* ---- Two accounts, one device: the user picks, we never guess. ---- */
  if (status === 'conflict') {
    return (
      <div className="login" data-testid="screen-login">
        <div className="login__card">
          <h1 className="login__mark">FORGE</h1>
          <h2 className="login__title">This device already has a tracker</h2>
          <p className="login__body" data-testid="conflict-body">
            The habits and stars saved here belong to{' '}
            <b>{heldBy?.email || heldBy?.name}</b>, but you signed in as{' '}
            <b>{account?.email || account?.name}</b>.
          </p>
          <p className="login__warn">
            Continuing as {account?.email || 'the new account'} erases everything
            saved here first. There is no copy anywhere else, and it cannot be undone.
          </p>

          <button className="btn btn--danger" data-testid="takeover-yes"
                  disabled={busy} onClick={() => void takeOver()}>
            Erase it and start fresh
          </button>
          <button className="btn btn--ghost" data-testid="takeover-no"
                  onClick={() => void cancelTakeOver()}>
            Cancel — keep {heldBy?.name || 'the existing'} data
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login" data-testid="screen-login">
      <motion.div className="login__card"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}>
        <h1 className="login__mark">FORGE</h1>
        <p className="login__tagline">Build the habit. Earn the rank.</p>

        <h2 className="login__title">Sign in to start</h2>
        <p className="login__body">
          Your tracker is tied to a Google account, so it is yours and not
          whoever picks up this device next.
        </p>

        {configured() ? (
          <button className="btn btn--google" data-testid="google-signin"
                  disabled={busy} onClick={() => void signIn()}>
            <GoogleMark />
            {busy ? 'Waiting for Google…' : 'Continue with Google'}
          </button>
        ) : (
          <p className="login__warn" data-testid="login-unconfigured">
            This build has no Google client ID, so sign-in is switched off.
            Set <code>VITE_GOOGLE_CLIENT_ID</code> in <code>.env</code> and rebuild.
          </p>
        )}

        {error && (
          <p className="login__error" role="alert" data-testid="login-error">{error}</p>
        )}

        {/* Said up front, not buried in a settings page nobody opens. */}
        <ul className="login__facts">
          <li><IconCheck size={14} /> Everything stays on this device, and works offline.</li>
          <li><IconCheck size={14} /> Nothing is uploaded unless you turn on Google sync.</li>
          <li><IconCheck size={14} /> Signing out keeps your data — it does not delete it.</li>
        </ul>
        <p className="login__fineprint">
          Because there is no server, an account decides whose tracker opens.
          It is not a lock: anyone who can unlock this device can read the data.
        </p>
      </motion.div>
    </div>
  );
}

/** Google's mark, inline — a remote image would break the offline shell. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.12 24.55c0-1.64-.15-3.22-.42-4.73H24v8.95h11.84a10.12 10.12 0 0 1-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.38z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7A21.99 21.99 0 0 0 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18A13.2 13.2 0 0 1 11 24c0-1.45.25-2.86.69-4.18v-5.7H4.34A22 22 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z" />
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.94 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </svg>
  );
}
