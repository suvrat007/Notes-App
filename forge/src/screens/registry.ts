import { IconHome, IconRoadmap, IconStats, IconProfile, IconManage, type IconProps } from '../components/icons';

export type ScreenDef = {
  key: 'home' | 'roadmap' | 'stats' | 'profile' | 'manage';
  label: string;
  /** Sidebar only — one line on what the screen is for. */
  blurb: string;
  Icon: (p: IconProps) => React.ReactElement;
};

export const SCREENS: ScreenDef[] = [
  { key: 'home', label: 'Home', blurb: 'Log today', Icon: IconHome },
  { key: 'roadmap', label: 'Roadmap', blurb: 'Weekly pace', Icon: IconRoadmap },
  { key: 'stats', label: 'Stats', blurb: 'Trends', Icon: IconStats },
  { key: 'manage', label: 'Manage', blurb: 'Order & edit', Icon: IconManage },
  { key: 'profile', label: 'Profile', blurb: 'Rank & rewards', Icon: IconProfile },
];

export type ScreenKey = ScreenDef['key'];
