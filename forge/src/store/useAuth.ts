/**
 * Session state: who is signed in, and whose data this device holds.
 *
 * Kept apart from `useForge` on purpose. The forge store is about one person's
 * habits; this one decides WHICH person, and has to settle before any of that
 * loads. Mixing them would mean the tracker briefly rendering someone else's
 * data while the answer was still being worked out.
 */
import { create } from 'zustand';
import { db, type Session } from '../db/schema';
import { signInWithGoogle, SignInError, type Account } from '../lib/auth/identity';
import { isGoogleConfigured } from '../lib/google/config';

type Status =
  /** Reading the stored session; nothing should render yet. */
  | 'loading'
  /** No session — the gate is up. */
  | 'signed-out'
  /** Signed in and the data belongs to them. */
  | 'ready'
  /**
   * Signed in, but the data on this device belongs to a DIFFERENT account.
   * A decision only the user can make, so the app stops and asks.
   */
  | 'conflict';

type AuthState = {
  status: Status;
  account: Account | null;
  /** The account this device's data belongs to, when it isn't `account`. */
  heldBy: Account | null;
  busy: boolean;
  error: string | null;

  load: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Conflict resolution: wipe local data and start fresh as the new account. */
  takeOver: () => Promise<void>;
  /** Conflict resolution: back out and stay signed out. */
  cancelTakeOver: () => Promise<void>;
  configured: () => boolean;
};

const asAccount = (s: Session): Account =>
  ({ sub: s.sub, email: s.email, name: s.name, picture: s.picture });

/** Everything that is one person's tracker. Cleared on a hand-over. */
const OWNED_TABLES = [
  'habits', 'tasks', 'logs', 'rewards', 'appState', 'dailyTargets',
  'syncLinks', 'syncQueue',
] as const;

export const useAuth = create<AuthState>((set, get) => ({
  status: 'loading',
  account: null,
  heldBy: null,
  busy: false,
  error: null,

  configured: () => isGoogleConfigured(),

  async load() {
    await db.open();
    const row = await db.session.get('singleton');
    if (!row) { set({ status: 'signed-out', account: null }); return; }
    set({ status: 'ready', account: asAccount(row), error: null });
  },

  async signIn() {
    if (get().busy) return;
    set({ busy: true, error: null });
    try {
      const account = await signInWithGoogle();
      const existing = await db.session.get('singleton');

      /*
       * Somebody else's tracker is already on this device. Silently opening it
       * would show one person another's data; silently wiping it would destroy
       * months of work. Neither is ours to choose, so stop and ask.
       */
      if (existing && existing.sub !== account.sub) {
        set({ status: 'conflict', account, heldBy: asAccount(existing), busy: false });
        return;
      }

      await db.session.put({
        id: 'singleton',
        sub: account.sub,
        email: account.email,
        name: account.name,
        picture: account.picture,
        signedInAt: new Date().toISOString(),
      });
      set({ status: 'ready', account, heldBy: null, busy: false, error: null });
    } catch (e) {
      const msg = e instanceof SignInError ? e.message : 'Sign-in failed. Try again.';
      if (!(e instanceof SignInError)) console.error('sign-in:', e);
      set({ busy: false, error: msg });
    }
  },

  async signOut() {
    /*
     * Only the session row goes. The habits stay, because signing out of your
     * own tracker on your own phone should not delete it — signing in again
     * finds everything where it was.
     */
    await db.session.delete('singleton');
    set({ status: 'signed-out', account: null, heldBy: null, error: null });
  },

  async takeOver() {
    const account = get().account;
    if (!account) return;
    set({ busy: true });
    await db.transaction('rw', OWNED_TABLES.map((t) => db.table(t)), async () => {
      for (const t of OWNED_TABLES) await db.table(t).clear();
    });
    await db.session.put({
      id: 'singleton',
      sub: account.sub,
      email: account.email,
      name: account.name,
      picture: account.picture,
      signedInAt: new Date().toISOString(),
    });
    set({ status: 'ready', heldBy: null, busy: false, error: null });
  },

  async cancelTakeOver() {
    set({ status: 'signed-out', account: null, heldBy: null, error: null });
  },
}));
