import { db, type AppState } from './schema';
import { mondayOf, todayStr } from '../lib/dates';

export const DEFAULT_SETTINGS = {
  weekResetDay: 1, // Monday
  negativeFloor: false,
  dailyTargetAuto: true,
};

/**
 * Create the singleton AppState row if absent, and roll `weekStartDate`
 * forward when a new week has begun. Idempotent — safe on every startup.
 */
export async function ensureAppState(): Promise<AppState> {
  const monday = mondayOf(todayStr());

  return db.transaction('rw', db.appState, async () => {
    const existing = await db.appState.get('singleton');

    if (!existing) {
      const fresh: AppState = {
        id: 'singleton',
        lifetimeStars: 0,
        weekStartDate: monday,
        settings: { ...DEFAULT_SETTINGS },
      };
      await db.appState.add(fresh);
      return fresh;
    }

    if (existing.weekStartDate !== monday) {
      // New week: the balance is derived from logs, so only the marker moves.
      await db.appState.update('singleton', { weekStartDate: monday });
      return { ...existing, weekStartDate: monday };
    }

    return existing;
  });
}
