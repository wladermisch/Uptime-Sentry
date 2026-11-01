import * as React from 'react';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import Box from '@mui/material/Box';
import { fonts } from '../../shared-theme/themePrimitives';

interface Profile {
  id: string;
  name: string;
  defaultTimeout: number;
  checkInterval: number;
  consecutiveFailuresLimit: number;
  backgroundRunning: boolean;
}

/** Active profile switcher. Writes the active id and announces `profile-changed`. */
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
    const handler = () => { loadFromStorage(); };
    window.addEventListener('profiles-updated', handler);
    window.addEventListener('profile-changed', handler);
    return () => {
      window.removeEventListener('profiles-updated', handler);
      window.removeEventListener('profile-changed', handler);
    };
  }, [loadFromStorage]);

  const handleChange = (event: SelectChangeEvent) => {
    const newId = event.target.value;
    setActiveId(newId);
    localStorage.setItem('uptime_sentry_active_id', newId);
    window.dispatchEvent(new CustomEvent('profile-changed', { detail: newId }));
  };

  return (
    <Select
      id="profile-select"
      value={profiles.some((p) => p.id === activeId) ? activeId : ''}
      onChange={handleChange}
      displayEmpty
      size="small"
      inputProps={{ 'aria-label': 'Active profile' }}
      renderValue={(value) => {
        const p = profiles.find((x) => x.id === value);
        return (
          <Box component="span" sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Box component="span" sx={{ fontFamily: fonts.mono, fontSize: 11, letterSpacing: '0.1em', color: 'text.secondary' }}>
              PROFILE
            </Box>
            <Box component="span" sx={{ fontWeight: 600 }}>{p ? p.name : 'No profile'}</Box>
          </Box>
        );
      }}
      sx={{ minWidth: 220, height: 36 }}
    >
      {profiles.map((p) => (
        <MenuItem key={p.id} value={p.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
          <span>{p.name}</span>
          <Box component="span" sx={{ fontFamily: fonts.mono, fontSize: 12, color: 'text.secondary' }}>
            every {p.checkInterval} s
          </Box>
        </MenuItem>
      ))}
      {profiles.length === 0 && (
        <MenuItem value="" disabled>
          No profiles yet
        </MenuItem>
      )}
    </Select>
  );
}
