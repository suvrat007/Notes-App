import { useCallback, useEffect, useState } from 'react';

/**
 * Small, local preferences.
 *
 * These are about how the app LOOKS to one person on one device, not what is
 * true about their data — so they live in localStorage rather than costing a
 * round trip and a column. Anything that belongs to the account belongs on the
 * server; this is only for the things a device gets to decide.
 */
const PREFIX = 'pref:';

export const readPref = (key, fallback) => {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};

/** Same shape as useState, with the value persisted and shared across tabs. */
export function usePref(key, fallback) {
  const [value, setValue] = useState(() => readPref(key, fallback));

  const set = useCallback((next) => {
    setValue((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(resolved));
        // So a second tab, or another component reading the same key, follows.
        window.dispatchEvent(new CustomEvent('pref-change', { detail: { key } }));
      } catch {
        /* a device that will not store it still gets the change this session */
      }
      return resolved;
    });
  }, [key]);

  useEffect(() => {
    const sync = (e) => {
      if (e.detail?.key === key || e.key === PREFIX + key) setValue(readPref(key, fallback));
    };
    window.addEventListener('pref-change', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('pref-change', sync);
      window.removeEventListener('storage', sync);
    };
  }, [key, fallback]);

  return [value, set];
}

/** Yesterday's unfinished work, shown on the home screen. On by default. */
export const SHOW_BACKLOG = 'show-backlog';
/**
 * How many days past its due date owed work stays on the home screen.
 *
 * Two by default: long enough that something missed on a busy day is still
 * there to finish, short enough that the list does not turn into a fortnight
 * of accumulated guilt. The server sends up to CARRY_MAX days, so this only
 * narrows what is already there.
 */
export const CARRY_DAYS = 'carry-days';
export const CARRY_MAX = 14;
