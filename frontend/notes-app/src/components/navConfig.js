import { Home, Map, CalendarDays, ScrollText, SlidersHorizontal, Activity } from 'lucide-react';

/**
 * Five slots, because a phone's bottom bar cannot hold more and still be
 * tappable. Stats folded into Roadmap's territory would lose the charts, so
 * the ledger and the stats keep their own places and 'More' holds settings.
 */
export const TABS = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'roadmap', label: 'Roadmap', icon: Map },
  { key: 'manage', label: 'Manage', icon: SlidersHorizontal },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'statistic', label: 'Stats', icon: Activity },
];

/** Reachable from the More menu rather than the main rail. */
export const EXTRA_TABS = [
  { key: 'data', label: 'Ledger', icon: ScrollText },
];
