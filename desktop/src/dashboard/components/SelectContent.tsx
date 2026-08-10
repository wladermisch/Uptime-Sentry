import * as React from 'react';
import MuiAvatar from '@mui/material/Avatar';
import MuiListItemAvatar from '@mui/material/ListItemAvatar';
import MenuItem from '@mui/material/MenuItem';
import ListItemText from '@mui/material/ListItemText';
import Select, { SelectChangeEvent, selectClasses } from '@mui/material/Select';
import { styled } from '@mui/material/styles';
import DevicesRoundedIcon from '@mui/icons-material/DevicesRounded';
import Typography from '@mui/material/Typography';

const Avatar = styled(MuiAvatar)(({ theme }) => ({
  width: 28,
  height: 28,
  backgroundColor: (theme.vars || theme).palette.background.paper,
  color: (theme.vars || theme).palette.text.secondary,
  border: `1px solid ${(theme.vars || theme).palette.divider}`,
}));

const ListItemAvatar = styled(MuiListItemAvatar)({
  minWidth: 0,
  marginRight: 12,
});

interface Profile {
  id: string;
  name: string;
  defaultTimeout: number;
  checkInterval: number;
  consecutiveFailuresLimit: number;
  backgroundRunning: boolean;
}

export default function SelectContent() {
  const [profiles, setProfiles] = React.useState<Profile[]>([]);
  const [activeId, setActiveId] = React.useState('');

  const loadFromStorage = React.useCallback(() => {
    try {
      const stored = localStorage.getItem('uptime_sentry_profiles');
      const active = localStorage.getItem('uptime_sentry_active_id');
      if (stored) {
        const parsed = JSON.parse(stored) as Profile[];
        setProfiles(parsed);
        if (active) {
          setActiveId(active);
        } else if (parsed.length > 0) {
          setActiveId(parsed[0].id);
          localStorage.setItem('uptime_sentry_active_id', parsed[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to load profiles in select dropdown', e);
    }
  }, []);

  React.useEffect(() => {
    loadFromStorage();
    const handler = () => loadFromStorage();
    window.addEventListener('profiles-updated', handler);
    return () => window.removeEventListener('profiles-updated', handler);
  }, [loadFromStorage]);

  const handleChange = (event: SelectChangeEvent) => {
    const newId = event.target.value as string;
    setActiveId(newId);
    localStorage.setItem('uptime_sentry_active_id', newId);
    window.dispatchEvent(new CustomEvent('profile-changed', { detail: newId }));
  };

  return (
    <Select
      labelId="profile-select-label"
      id="profile-select"
      value={activeId}
      onChange={handleChange}
      displayEmpty
      fullWidth
      sx={{
        maxHeight: 56,
        width: '100%',
        [`& .${selectClasses.select}`]: {
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          pl: 1,
        },
      }}
    >
      {profiles.map((p) => (
        <MenuItem key={p.id} value={p.id}>
          <ListItemAvatar>
            <Avatar alt={p.name}>
              <DevicesRoundedIcon sx={{ fontSize: '1rem' }} />
            </Avatar>
          </ListItemAvatar>
          <ListItemText 
            primary={
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {p.name}
              </Typography>
            } 
            secondary={
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {p.checkInterval}s interval
              </Typography>
            }
          />
        </MenuItem>
      ))}
      {profiles.length === 0 && (
        <MenuItem value="">
          <ListItemText primary="No Profiles" />
        </MenuItem>
      )}
    </Select>
  );
}
