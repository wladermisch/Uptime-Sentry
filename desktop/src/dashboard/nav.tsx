/** Navigation model shared by the rail and the header. */
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import AnalyticsRoundedIcon from '@mui/icons-material/AnalyticsRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';
import HelpRoundedIcon from '@mui/icons-material/HelpRounded';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import TrackChangesRoundedIcon from '@mui/icons-material/TrackChangesRounded';

export const navItems = [
  { text: 'Home', value: 'home', icon: <HomeRoundedIcon /> },
  { text: 'Profiles', value: 'profiles', icon: <ChecklistRoundedIcon /> },
  { text: 'Targets', value: 'targets', icon: <TrackChangesRoundedIcon /> },
  { text: 'Analytics', value: 'analytics', icon: <AnalyticsRoundedIcon /> },
  { text: 'Reports', value: 'reports', icon: <AssignmentRoundedIcon /> },
];

export const secondaryNavItems = [
  { text: 'Settings', value: 'settings', icon: <SettingsRoundedIcon /> },
  { text: 'About', value: 'about', icon: <InfoRoundedIcon /> },
  { text: 'Feedback', value: 'feedback', icon: <HelpRoundedIcon /> },
];

export function navigate(tab: string) {
  window.dispatchEvent(new CustomEvent('nav-tab', { detail: tab }));
}
