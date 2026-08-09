/**
 * Haptics. Android Chrome only — iOS Safari has no Vibration API, so every
 * call is guarded and silently no-ops elsewhere.
 */
function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

function buzz(pattern: number | number[]): void {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw when the document isn't user-activated yet.
  }
}

/** Short tick on a rep log. */
export const tapPulse = () => buzz(15);

/** Slightly heavier for a penalty, so a bad-habit tap feels different. */
export const penaltyPulse = () => buzz([25, 40, 25]);

/** Celebratory pattern on a level-up. */
export const levelUpPulse = () => buzz([40, 60, 40, 60, 120]);
