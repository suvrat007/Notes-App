/**
 * Habit icon set — line icons drawn in `currentColor` so a habit's icon picks
 * up the good/bad accent of the card it sits on, the way emoji never could.
 *
 * A habit stores a KEY (`'dumbbell'`), not a glyph. Anything unrecognised is
 * rendered as raw text, so pre-existing emoji still show rather than vanishing
 * if a key is ever missing.
 */
import { normalizeIconKey, type HabitIconKey } from '../lib/habitIconKeys';

type P = { size?: number; className?: string };

const s = (size: number, w = 1.75) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: w,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
});

const Dumbbell = ({ size = 22 }: P) => (
  <svg {...s(size)}><path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12" /></svg>
);
const Book = ({ size = 22 }: P) => (
  <svg {...s(size)}>
    <path d="M12 6.5C10.5 5 8.2 4.5 4.5 4.8v12.4c3.7-.3 6 .2 7.5 1.7 1.5-1.5 3.8-2 7.5-1.7V4.8c-3.7-.3-6 .2-7.5 1.7z" />
    <path d="M12 6.5v12" />
  </svg>
);
const Run = ({ size = 22 }: P) => (
  <svg {...s(size)}>
    <circle cx="15" cy="4.5" r="1.8" />
    <path d="M13.6 8.2 10 10.6l2.2 2.6.7 4.9" />
    <path d="M12.2 13.2 8.6 15l-2 4.2" />
    <path d="m13.6 8.2 3.6 1.5 2.3 3M9.9 10.6 5.6 9.9" />
  </svg>
);
// Cross-legged, not a bust — the first attempt read as a generic avatar.
const Meditate = ({ size = 22 }: P) => (
  <svg {...s(size)}>
    <circle cx="12" cy="4.6" r="2.1" />
    <path d="M12 7.4v3.4" />
    <path d="M12 10.2c-2 0-3.8 1.2-4.8 2.6M12 10.2c2 0 3.8 1.2 4.8 2.6" />
    <path d="M5.8 16.2c1.6-2.4 3.8-3.6 6.2-3.6s4.6 1.2 6.2 3.6" />
    <path d="M5.8 16.2c1.6 2.2 3.8 3.2 6.2 3.2s4.6-1 6.2-3.2" />
  </svg>
);
const Water = ({ size = 22 }: P) => (
  <svg {...s(size)}><path d="M12 3.5c3.2 3.6 5.5 6.5 5.5 9.3A5.5 5.5 0 0 1 6.5 12.8c0-2.8 2.3-5.7 5.5-9.3z" /></svg>
);
const Bowl = ({ size = 22 }: P) => (
  <svg {...s(size)}>
    <path d="M3 11.5h18a9 9 0 0 1-18 0z" />
    <path d="M2 11.5h20" />
    <path d="M9 8c0-1.2 1.1-1.5 1.1-2.7M14 8c0-1.2 1.1-1.5 1.1-2.7" />
  </svg>
);
const Bed = ({ size = 22 }: P) => (
  <svg {...s(size)}>
    <path d="M3 18v-8M3 13h18v5M21 18v-4" />
    <path d="M7.5 10a1.8 1.8 0 1 0 0-.1M10.5 13V10h7a3.5 3.5 0 0 1 3.5 3" />
  </svg>
);
const Pen = ({ size = 22 }: P) => (
  <svg {...s(size)}>
    <path d="M16.5 3.9 20.1 7.5 8.6 19H5v-3.6z" />
    <path d="m14.4 6 3.6 3.6" />
  </svg>
);
/**
 * A round body alone reads as a lollipop at 20px — the recognisable signal is
 * a long fretted neck with tuning pegs, so the body is smaller and the neck
 * carries the identity.
 */
const Guitar = ({ size = 22 }: P) => (
  <svg {...s(size, 1.6)}>
    <ellipse cx="7.6" cy="16.4" rx="4.4" ry="4.6" />
    <circle cx="7.6" cy="15.2" r="1.2" />
    <path d="M10.4 13.4 18.2 5.6" />
    <path d="m12.6 10.5 1.6 1.6M15 8.1l1.6 1.6" />
    <circle cx="18.4" cy="4.4" r=".9" />
    <circle cx="19.9" cy="5.9" r=".9" />
  </svg>
);
// Upright handle + flared bristle head; the angled version read as a blade.
const Broom = ({ size = 22 }: P) => (
  <svg {...s(size)}>
    <path d="M12 3v8" />
    <path d="M8.2 11h7.6l1.7 3.4H6.5z" />
    <path d="M9 14.4v3.4M12 14.4v3.8M15 14.4v3.4" />
  </svg>
);
const Cigarette = ({ size = 22 }: P) => (
  <svg {...s(size)}>
    <path d="M3 14.5h14V18H3zM14 14.5V18" />
    <path d="M20 14.5V18" />
    <path d="M18 11V9.5a2 2 0 0 0-2-2 2 2 0 0 1-2-2V4" />
  </svg>
);
const Beer = ({ size = 22 }: P) => (
  <svg {...s(size)}>
    <path d="M5.5 8h9v11a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19z" />
    <path d="M14.5 10.5h2.8a1.7 1.7 0 0 1 0 3.4h-2.8" />
    <path d="M5.5 8c0-2 1.5-3 3-3s1.5-1.5 3-1.5S14.5 5 14.5 8" />
  </svg>
);
const Burger = ({ size = 22 }: P) => (
  <svg {...s(size)}>
    <path d="M3.5 10.2c0-3.5 3.8-5.9 8.5-5.9s8.5 2.4 8.5 5.9z" />
    <path d="M3.5 13.1h17" />
    <path d="M3.9 15.8h16.2c0 2.2-3.6 3.9-8.1 3.9s-8.1-1.7-8.1-3.9z" />
  </svg>
);
const Phone = ({ size = 22 }: P) => (
  <svg {...s(size)}>
    <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
    <path d="M10.5 5.5h3M12 18.3v.01" />
  </svg>
);
const Gamepad = ({ size = 22 }: P) => (
  <svg {...s(size)}>
    <path d="M8 8h8a5 5 0 0 1 5 5v1.2a3 3 0 0 1-5.4 1.8L14.5 15h-5l-1.1 1a3 3 0 0 1-5.4-1.8V13a5 5 0 0 1 5-5z" />
    <path d="M7 11v2.4M5.8 12.2h2.4M16 11.4v.01M17.6 12.8v.01" />
  </svg>
);
const Cart = ({ size = 22 }: P) => (
  <svg {...s(size)}>
    <path d="M2.5 3.5h2.2l2.3 10.4h9.6l2.4-7.4H6" />
    <circle cx="9" cy="18.5" r="1.4" />
    <circle cx="16" cy="18.5" r="1.4" />
  </svg>
);
const Sleepy = ({ size = 22 }: P) => (
  <svg {...s(size)}>
    <path d="M20.5 13.2A8 8 0 0 1 10 3.3a8.5 8.5 0 1 0 10.5 9.9z" />
    <path d="M14.5 3.5h4l-4 4h4" />
  </svg>
);
const Coffee = ({ size = 22 }: P) => (
  <svg {...s(size)}>
    <path d="M4 9h12v5.5a4.5 4.5 0 0 1-9 0z" />
    <path d="M16 10.5h2.3a2.2 2.2 0 0 1 0 4.4H16" />
    <path d="M4 20h12" />
    <path d="M8 5.5v-1M12 5.5v-1" />
  </svg>
);
const Bolt = ({ size = 22 }: P) => (
  <svg {...s(size)}><path d="M13.5 2.5 4.5 13.5h6l-.5 8 9-11h-6z" /></svg>
);

export const HABIT_ICONS: { key: HabitIconKey; label: string; Icon: (p: P) => React.ReactElement }[] = [
  { key: 'dumbbell', label: 'Training', Icon: Dumbbell },
  { key: 'book', label: 'Reading', Icon: Book },
  { key: 'run', label: 'Running', Icon: Run },
  { key: 'meditate', label: 'Meditation', Icon: Meditate },
  { key: 'water', label: 'Water', Icon: Water },
  { key: 'bowl', label: 'Eating well', Icon: Bowl },
  { key: 'bed', label: 'Sleep', Icon: Bed },
  { key: 'pen', label: 'Writing', Icon: Pen },
  { key: 'guitar', label: 'Practice', Icon: Guitar },
  { key: 'broom', label: 'Chores', Icon: Broom },
  { key: 'cigarette', label: 'Smoking', Icon: Cigarette },
  { key: 'beer', label: 'Drinking', Icon: Beer },
  { key: 'burger', label: 'Junk food', Icon: Burger },
  { key: 'phone', label: 'Phone', Icon: Phone },
  { key: 'gamepad', label: 'Gaming', Icon: Gamepad },
  { key: 'cart', label: 'Spending', Icon: Cart },
  { key: 'sleepy', label: 'Oversleeping', Icon: Sleepy },
  { key: 'coffee', label: 'Caffeine', Icon: Coffee },
  { key: 'bolt', label: 'Other', Icon: Bolt },
];

const BY_KEY = new Map(HABIT_ICONS.map((i) => [i.key as string, i.Icon]));

/** Render a habit icon. Unknown values fall back to raw text, never nothing. */
export function HabitIcon({ name, size = 22 }: { name: string; size?: number }) {
  const Icon = BY_KEY.get(normalizeIconKey(name));
  if (!Icon) return <span aria-hidden="true">{name}</span>;
  return <Icon size={size} />;
}
