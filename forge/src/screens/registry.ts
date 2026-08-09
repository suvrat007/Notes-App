export const SCREENS = [
  { key: 'home', label: 'Home', icon: '🔨' },
  { key: 'roadmap', label: 'Roadmap', icon: '🗺️' },
  { key: 'stats', label: 'Stats', icon: '📊' },
  { key: 'profile', label: 'Profile', icon: '🛡️' },
] as const;

export type ScreenKey = (typeof SCREENS)[number]['key'];
