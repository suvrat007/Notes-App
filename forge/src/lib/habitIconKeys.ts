/**
 * Habit icon KEYS and the legacy-emoji mapping.
 *
 * Kept separate from the SVG components so the db layer can normalise a
 * stored icon without importing anything from `components/`.
 */

export const HABIT_ICON_KEYS = [
  'dumbbell', 'book', 'run', 'meditate', 'water', 'bowl', 'bed', 'pen',
  'guitar', 'broom', 'cigarette', 'beer', 'burger', 'phone', 'gamepad',
  'cart', 'sleepy', 'coffee', 'bolt',
] as const;

export type HabitIconKey = (typeof HABIT_ICON_KEYS)[number];

export const DEFAULT_ICON: HabitIconKey = 'bolt';

const KEYS = new Set<string>(HABIT_ICON_KEYS);

/** Emoji previously offered by the picker, mapped to their replacements. */
const EMOJI_TO_KEY: Record<string, HabitIconKey> = {
  '🏋': 'dumbbell', '📚': 'book', '🏃': 'run', '🧘': 'meditate', '💧': 'water',
  '🥗': 'bowl', '🛏': 'bed', '✍': 'pen', '🎸': 'guitar', '🧹': 'broom',
  '🚬': 'cigarette', '🍺': 'beer', '🍔': 'burger', '📱': 'phone', '🎮': 'gamepad',
  '🛒': 'cart', '😴': 'sleepy', '☕': 'coffee', '⚡': 'bolt',
};

/**
 * Map a stored icon value to a key.
 *
 * Emoji are matched with variation selectors, ZWJs and skin-tone modifiers
 * stripped — '🏋️' and '🏋' differ only by an invisible U+FE0F, so a naive
 * lookup would miss every icon the old picker actually wrote.
 *
 * An unrecognised value is returned unchanged so the UI can still render it
 * as text rather than losing it.
 */
export function normalizeIconKey(icon: string | undefined): string {
  if (!icon) return DEFAULT_ICON;
  if (KEYS.has(icon)) return icon;
  const bare = icon.replace(/[︎️‍]|[\u{1F3FB}-\u{1F3FF}]/gu, '');
  return EMOJI_TO_KEY[bare] ?? icon;
}

export function isKnownIconKey(icon: string): boolean {
  return KEYS.has(normalizeIconKey(icon));
}
