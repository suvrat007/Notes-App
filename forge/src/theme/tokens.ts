/**
 * FORGE design tokens — dark metallic. Single source of truth.
 * Mirrored as CSS custom properties in index.css; keep the two in sync.
 */
export const tokens = {
  color: {
    bg: '#0d0f12',
    surface: '#16191e',
    surfaceRaised: '#1e232b',
    steel: '#2a2f38',
    text: '#e6e8eb',
    textDim: '#8a929e',
    accent: '#c0b3a5', // malta — warm stone
    good: '#3ecf8e',
    bad: '#e5484d',
  },
  radius: '10px',
  transition: '180ms',
  /** Minimum tap target — thumbs, not cursors. */
  tap: '48px',
} as const;

export type Tokens = typeof tokens;
