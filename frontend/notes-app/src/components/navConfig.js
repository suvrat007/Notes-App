import { Home, Map, CalendarDays, ScrollText, SlidersHorizontal, Activity, Users } from 'lucide-react';

/**
 * Six slots. Each one is a flex-1 share of a 420px bar, so a sixth still
 * leaves ~67px per target — comfortably past the 44px a thumb needs. A
 * seventh would not, and the labels would start truncating.
 *
 * Squad earns a place on the rail rather than a link buried in More: a
 * scoreboard nobody passes is a scoreboard nobody checks, and the whole point
 * of the crew week is that you keep an eye on it.
 */
export const TABS = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'roadmap', label: 'Roadmap', icon: Map },
  { key: 'manage', label: 'Manage', icon: SlidersHorizontal },
  { key: 'squad', label: 'Squad', icon: Users },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'statistic', label: 'Stats', icon: Activity },
];

/** Reachable from the More menu rather than the main rail. */
export const EXTRA_TABS = [
  { key: 'data', label: 'Ledger', icon: ScrollText },
];
