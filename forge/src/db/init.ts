import { db, type AppState } from './schema';
import { weekStartOf, todayStr } from '../lib/dates';

export const DEFAULT_SETTINGS = {
  weekResetDay: 1, // Monday
  negativeFloor: false,
  dailyTargetAuto: true,
};

/**
 * Create the singleton AppState row if absent, and roll `weekStartDate`
 * forward when a new week has begun. Idempotent — safe on every startup.
 *
 * The week boundary honours the user's `weekResetDay`, so changing that
 * setting immediately re-anchors the current week.
 */
export async function ensureAppState(): Promise<AppState> {
  return db.transaction('rw', db.appState, async () => {
    const existing = await db.appState.get('singleton');

    if (!existing) {
      const fresh: AppState = {
        id: 'singleton',
        lifetimeStars: 0,
        weekStartDate: weekStartOf(todayStr(), DEFAULT_SETTINGS.weekResetDay),
        settings: { ...DEFAULT_SETTINGS },
      };
      await db.appState.add(fresh);
      return fresh;
    }

    // Older rows may predate a settings key; fill any gaps.
    const settings = { ...DEFAULT_SETTINGS, ...existing.settings };
    const start = weekStartOf(todayStr(), settings.weekResetDay);

    // Compare by value — a fresh object literal is never identity-equal, which
    // would otherwise write on every single startup.
    const settingsChanged =
      JSON.stringify(settings) !== JSON.stringify(existing.settings);

    if (existing.weekStartDate !== start || settingsChanged) {
      // The balance is derived from logs, so only the marker moves.
      await db.appState.update('singleton', { weekStartDate: start, settings });
      return { ...existing, weekStartDate: start, settings };
    }

    return existing;
  });
}
