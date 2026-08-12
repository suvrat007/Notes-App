/**
 * Line icons drawn on the forge/metal metaphor.
 *
 * All of them stroke in `currentColor` so they inherit the theme's ember /
 * dim-steel states instead of dragging a second palette (colour emoji) into
 * a deliberately monochrome UI.
 */

export type IconProps = {
  size?: number;
  className?: string;
};

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
});

/** Home — the anvil, echoing the app icon. */
export function IconHome({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 9h11c0 2.2-1.4 3.6-3 4v2h2.5v3h-8v-3H8v-2c-1.6-.4-3-1.8-3-4" />
      <path d="M14 9c2.6 0 4.4-.7 5.6-2.1.6-.7.1-1.6-.7-1.4-1.4.4-2.8.6-4.1.6" />
    </svg>
  );
}

/** Roadmap — milestone nodes along a track. */
export function IconRoadmap({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="5" cy="12" r="2.4" />
      <circle cx="19" cy="12" r="2.4" />
      <path d="M7.4 12h9.2" strokeDasharray="2.6 2.4" />
      <path d="M12 5.5v2M12 16.5v2" />
    </svg>
  );
}

/** Stats — bar chart. */
export function IconStats({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 20h16" />
      <path d="M7 20v-6M12 20V6M17 20v-9" />
    </svg>
  );
}

/** Profile — the rank crest. */
export function IconProfile({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3l7.5 2.8v5.4c0 4.4-3.2 7.6-7.5 9.1-4.3-1.5-7.5-4.7-7.5-9.1V5.8z" />
      <path d="M9.4 12l1.9 1.9 3.4-3.6" />
    </svg>
  );
}

/** Microphone — voice capture. */
export function IconMic({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="9" y="3" width="6" height="10" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
    </svg>
  );
}

/** Flag — the end node of the weekly roadmap. */
export function IconFlag({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6 21V4" />
      <path d="M6 4.5h11l-2.2 3.6L17 12H6" />
    </svg>
  );
}

/** Flame — an active streak. Filled, so it reads at small sizes. */
export function IconFlame({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} fill="currentColor" strokeWidth={0}>
      <path d="M12 2.5s5.2 4 5.2 8.6a5.2 5.2 0 0 1-10.4 0c0-1.3.4-2.4 1-3.4.3 1 .9 1.8 1.7 2.1.5-2.9 1-5.1 2.5-7.3z" />
    </svg>
  );
}

/** Plus — the log-a-rep tap zone. */
export function IconPlus({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2.25} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Check — a completed task. */
export function IconCheck({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2.5} className={className}>
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  );
}

/** Manage — stacked rows with a drag affordance. */
export function IconManage({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 7h11M4 12h11M4 17h11" />
      <path d="M19 5.5v13" />
      <path d="m17 7.5 2-2 2 2M17 16.5l2 2 2-2" />
    </svg>
  );
}
