/** Navigation model shared by the rail and the header. */
import * as React from 'react';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import AnalyticsRoundedIcon from '@mui/icons-material/AnalyticsRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';
import HelpRoundedIcon from '@mui/icons-material/HelpRounded';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import TrackChangesRoundedIcon from '@mui/icons-material/TrackChangesRounded';
import EngineeringRoundedIcon from '@mui/icons-material/EngineeringRounded';

export const navItems = [
  { text: 'Home', value: 'home', icon: <HomeRoundedIcon /> },
  { text: 'Maintenance', value: 'maintenance', icon: <EngineeringRoundedIcon /> },
  { text: 'Analytics', value: 'analytics', icon: <AnalyticsRoundedIcon /> },
  { text: 'Reports', value: 'reports', icon: <AssignmentRoundedIcon /> },
  { text: 'Targets', value: 'targets', icon: <TrackChangesRoundedIcon /> },
  { text: 'Profiles', value: 'profiles', icon: <ChecklistRoundedIcon /> },
];

export const secondaryNavItems = [
  { text: 'Settings', value: 'settings', icon: <SettingsRoundedIcon /> },
  { text: 'About', value: 'about', icon: <InfoRoundedIcon /> },
  { text: 'Feedback', value: 'feedback', icon: <HelpRoundedIcon /> },
];

export function navigate(tab: string) {
  window.dispatchEvent(new CustomEvent('nav-tab', { detail: tab }));
}

export type NavItem = (typeof navItems)[number];

/** The person's own sidebar: order within each group, and what is hidden. Home and Settings always stay. */
export interface NavLayout {
  order: string[];
  hidden: string[];
}

const LAYOUT_KEY = 'uptime_sentry_nav_layout';
export const NAV_LAYOUT_CHANGED = 'nav-layout-changed';
export const LOCKED_NAV = new Set(['home', 'settings']);
export const DEFAULT_LAYOUT: NavLayout = {
  order: [...navItems, ...secondaryNavItems].map((i) => i.value),
  hidden: [],
};

export function loadNavLayout(): NavLayout {
  try {
    const raw = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}') as Partial<NavLayout>;
    return {
      order: Array.isArray(raw.order) ? raw.order.filter((v): v is string => typeof v === 'string') : DEFAULT_LAYOUT.order,
      hidden: Array.isArray(raw.hidden) ? raw.hidden.filter((v): v is string => typeof v === 'string' && !LOCKED_NAV.has(v)) : [],
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveNavLayout(layout: NavLayout) {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new CustomEvent(NAV_LAYOUT_CHANGED));
}

/** One group in the person's order; items the saved order doesn't know (new screens) keep their default place at the end. */
export function arrange(items: NavItem[], layout: NavLayout): NavItem[] {
  const pos = (v: string) => {
    const i = layout.order.indexOf(v);
    return i === -1 ? 1000 + items.findIndex((x) => x.value === v) : i;
  };
  return [...items].sort((a, b) => pos(a.value) - pos(b.value));
}

/** The rail as the person arranged it. */
export function useNavLayout(): NavLayout {
  const [layout, setLayout] = React.useState(loadNavLayout);
  React.useEffect(() => {
    const on = () => { setLayout(loadNavLayout()); };
    window.addEventListener(NAV_LAYOUT_CHANGED, on);
    return () => { window.removeEventListener(NAV_LAYOUT_CHANGED, on); };
  }, []);
  return layout;
}
