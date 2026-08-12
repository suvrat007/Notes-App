/**
 * Which screen is showing.
 *
 * This lives in a store rather than `App`'s local state because voice commands
 * can navigate ("go to stats"), and the modal that raises them is mounted by
 * whichever screen the user happened to be on — a screen that has no way to
 * reach into App's setState.
 */
import { create } from 'zustand';
import type { ScreenKey } from '../screens/registry';

type NavState = {
  screen: ScreenKey;
  setScreen: (s: ScreenKey) => void;
};

const KEYS: ScreenKey[] = ['home', 'roadmap', 'stats', 'profile', 'manage'];

export const useNav = create<NavState>((set) => ({
  screen: 'home',
  setScreen: (s) => set({ screen: s }),
}));

/** Navigate from an untrusted string (an LLM command), ignoring junk. */
export function navigateTo(name: string): boolean {
  if (!KEYS.includes(name as ScreenKey)) return false;
  useNav.getState().setScreen(name as ScreenKey);
  return true;
}
