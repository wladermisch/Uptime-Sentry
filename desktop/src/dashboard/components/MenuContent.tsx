import * as React from 'react';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import AnalyticsRoundedIcon from '@mui/icons-material/AnalyticsRounded';
import PeopleRoundedIcon from '@mui/icons-material/PeopleRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';
import HelpRoundedIcon from '@mui/icons-material/HelpRounded';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import TrackChangesRoundedIcon from '@mui/icons-material/TrackChangesRounded';

const mainListItems = [
  { text: 'Home', value: 'home', icon: <HomeRoundedIcon /> },
  { text: 'Profiles', value: 'profiles', icon: <ChecklistRoundedIcon /> },
  { text: 'Targets', value: 'targets', icon: <TrackChangesRoundedIcon /> },
  { text: 'Analytics', value: 'analytics', icon: <AnalyticsRoundedIcon /> },
  { text: 'Reports', value: 'reports', icon: <AssignmentRoundedIcon /> },
];

const secondaryListItems = [
  { text: 'Settings', value: 'settings', icon: <SettingsRoundedIcon /> },
  { text: 'About', value: 'about', icon: <InfoRoundedIcon /> },
  { text: 'Feedback', value: 'feedback', icon: <HelpRoundedIcon /> },
];

export default function MenuContent() {
  const [active, setActive] = React.useState('home');

  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) setActive(detail);
    };
    window.addEventListener('nav-tab', handler);
    return () => { window.removeEventListener('nav-tab', handler); };
  }, []);

  const handleNav = (tab: string) => {
    window.dispatchEvent(new CustomEvent('nav-tab', { detail: tab }));
  };

  return (
    <Stack sx={{ flexGrow: 1, p: 1, justifyContent: 'space-between' }}>
      <List dense>
        {mainListItems.map((item) => (
          <ListItem key={item.value} disablePadding sx={{ display: 'block' }}>
            <ListItemButton 
              selected={active === item.value}
              onClick={() => { handleNav(item.value); }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <List dense>
        {secondaryListItems.map((item) => (
          <ListItem key={item.value} disablePadding sx={{ display: 'block' }}>
            <ListItemButton 
              selected={active === item.value}
              onClick={() => handleNav(item.value)}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Stack>
  );
}
