import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import HelpIcon from '@mui/icons-material/Help';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import Autocomplete from '@mui/material/Autocomplete';

interface Profile {
  id: string;
  name: string;
  defaultTimeout: number; // in seconds
  checkInterval: number; // in seconds
  consecutiveFailuresLimit: number;
  backgroundRunning: boolean;
  upSound?: string;
  downSound?: string;
}

const FALLBACK_UP = ["default-app", "no-sound", "Up-Default.wav", "Up2.wav", "Up3.wav", "Notification Modern.wav", "Notification1.wav", "Notification2.wav"];
const FALLBACK_DOWN = ["default-app", "no-sound", "Down-Default.wav", "Down Modern.wav", "Down-2.wav", "Down3.wav", "Critical-Alert.wav", "Error.wav", "Notification Modern.wav", "Notification Warning.wav", "Notification1.wav", "Notification2.wav"];

export default function ProfilesTab() {
  const [profiles, setProfiles] = React.useState<Profile[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [upSoundsList, setUpSoundsList] = React.useState<string[]>(FALLBACK_UP);
  const [downSoundsList, setDownSoundsList] = React.useState<string[]>(FALLBACK_DOWN);

  // Form State
  const [name, setName] = React.useState('');
  const [interval, setIntervalVal] = React.useState(60);
  const [timeout, setTimeoutVal] = React.useState(5);
  const [failuresLimit, setFailuresLimit] = React.useState(2);
  const [bgRunning, setBgRunning] = React.useState(false);
  const [upSound, setUpSound] = React.useState('default-app');
  const [downSound, setDownSound] = React.useState('default-app');

  const previewTimer = React.useRef<any>(null);

  const loadProfiles = React.useCallback(() => {
    const stored = localStorage.getItem('uptime_sentry_profiles');
    if (stored) {
      const list = JSON.parse(stored) as Profile[];
      setProfiles(list);
      
      const active = localStorage.getItem('uptime_sentry_active_id');
      if (active && list.some(p => p.id === active)) {
        setSelectedId(active);
        const activeProfile = list.find(p => p.id === active)!;
        fillForm(activeProfile);
      } else if (list.length > 0) {
        setSelectedId(list[0].id);
        fillForm(list[0]);
      }
    }
  }, []);

  React.useEffect(() => {
    loadProfiles();
    
    // Fetch sound options
    fetch('http://127.0.0.1:8765/api/audio/list')
      .then((r) => r.json())
      .then((data) => {
        if (data.up) setUpSoundsList(["default-app", ...data.up]);
        if (data.down) setDownSoundsList(["default-app", ...data.down]);
      })
      .catch((e) => console.warn('Could not load sound files list from API:', e));

    const handleSearch = (e: Event) => {
      setSearchQuery((e as CustomEvent).detail || '');
    };
    window.addEventListener('search-query', handleSearch);
    return () => {
      window.removeEventListener('search-query', handleSearch);
    };
  }, [loadProfiles]);

  const fillForm = (p: Profile) => {
    setName(p.name);
    setIntervalVal(p.checkInterval);
    setTimeoutVal(p.defaultTimeout);
    setFailuresLimit(p.consecutiveFailuresLimit);
    setBgRunning(p.backgroundRunning);
    setUpSound(p.upSound || 'default-app');
    setDownSound(p.downSound || 'default-app');
  };

  const saveProfilesToStorage = (updated: Profile[]) => {
    localStorage.setItem('uptime_sentry_profiles', JSON.stringify(updated));
    setProfiles(updated);
    window.dispatchEvent(new CustomEvent('profiles-updated'));
  };

  const playPreview = React.useCallback((soundName: string, type: 'up' | 'down') => {
    if (soundName === 'default-app') return;
    if (previewTimer.current) {
      clearTimeout(previewTimer.current);
    }
    previewTimer.current = setTimeout(() => {
      try {
        const audio = new Audio(`http://127.0.0.1:8765/api/audio/stream?type=${type}&file=${encodeURIComponent(soundName)}`);
        audio.volume = 0.8;
        audio.play().catch((err) => console.error('Audio preview failed:', err));
      } catch (e) {
        console.error('Audio play error:', e);
      }
    }, 500);
  }, []);

  const handleSelectProfile = (p: Profile) => {
    setSelectedId(p.id);
    fillForm(p);
  };

  const handleNewProfileClick = () => {
    setSelectedId('temp-new-profile');
    setName('');
    setIntervalVal(60);
    setTimeoutVal(5);
    setFailuresLimit(2);
    setBgRunning(false);
    setUpSound('default-app');
    setDownSound('default-app');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (selectedId && selectedId !== 'temp-new-profile') {
      // Edit mode
      const updated = profiles.map((p) =>
        p.id === selectedId
          ? {
              ...p,
              name,
              checkInterval: Number(interval),
              defaultTimeout: Number(timeout),
              consecutiveFailuresLimit: Number(failuresLimit),
              backgroundRunning: bgRunning,
              upSound,
              downSound,
            }
          : p
      );
      saveProfilesToStorage(updated);
    } else {
      // Create mode
      const newId = Date.now().toString();
      const newProfile: Profile = {
        id: newId,
        name,
        checkInterval: Number(interval),
        defaultTimeout: Number(timeout),
        consecutiveFailuresLimit: Number(failuresLimit),
        backgroundRunning: bgRunning,
        upSound,
        downSound,
      };
      const updated = [...profiles, newProfile];
      saveProfilesToStorage(updated);
      setSelectedId(newId);
    }
  };

  const handleDelete = (id: string) => {
    if (id === 'temp-new-profile') {
      if (profiles.length > 0) {
        setSelectedId(profiles[0].id);
        fillForm(profiles[0]);
      } else {
        handleNewProfileClick();
      }
      return;
    }

    const updated = profiles.filter((p) => p.id !== id);
    saveProfilesToStorage(updated);

    // Update active profile switcher fallback
    const activeId = localStorage.getItem('uptime_sentry_active_id');
    if (activeId === id) {
      const nextActive = updated[0]?.id || '';
      localStorage.setItem('uptime_sentry_active_id', nextActive);
      window.dispatchEvent(new CustomEvent('profile-changed', { detail: nextActive }));
    }

    if (updated.length > 0) {
      setSelectedId(updated[0].id);
      fillForm(updated[0]);
    } else {
      handleNewProfileClick();
    }
  };

  // Compute reactive display list including temp profile if active
  const displayProfiles = React.useMemo(() => {
    const list = [...profiles];
    if (selectedId === 'temp-new-profile') {
      list.push({
        id: 'temp-new-profile',
        name: name || 'New Profile',
        checkInterval: interval,
        defaultTimeout: timeout,
        consecutiveFailuresLimit: failuresLimit,
        backgroundRunning: bgRunning,
        upSound,
        downSound,
      });
    }
    return list;
  }, [profiles, selectedId, name, interval, timeout, failuresLimit, bgRunning, upSound, downSound]);

  // Filter profiles list based on search
  const filteredProfiles = displayProfiles.filter(
    (p) => p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Box sx={{ width: '100%', maxWidth: { sm: '100%', md: '1700px' }, userSelect: 'none' }}>
      <Grid container spacing={3}>
        {/* Left Side: Sub-sidebar Frameless List */}
        <Grid size={{ xs: 12, md: 3.2 }}>
          <Box sx={{ borderRight: '1px solid', borderColor: 'divider', height: '100%', pr: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                Profiles
              </Typography>
              <Button size="small" variant="text" startIcon={<AddIcon />} onClick={handleNewProfileClick} sx={{ minWidth: 'auto', py: 0.2 }}>
                New
              </Button>
            </Box>
            <List dense sx={{ p: 0, overflow: 'auto', flexGrow: 1 }}>
              {filteredProfiles.map((p) => (
                <ListItemButton
                  key={p.id}
                  selected={selectedId === p.id}
                  onClick={() => handleSelectProfile(p)}
                  sx={{
                    borderRadius: 1,
                    mb: 0.2,
                    py: 0.3,
                    minHeight: 36,
                    '&.Mui-selected': {
                      bgcolor: 'action.selected',
                      fontWeight: 'bold',
                    }
                  }}
                >
                  <ListItemText
                    primary={
                      <Typography variant="body2" sx={{ fontWeight: selectedId === p.id ? 'bold' : 'medium', fontSize: '0.82rem', lineHeight: 1.2 }}>
                        {p.name}
                      </Typography>
                    }
                    secondary={
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem', lineHeight: 1.1 }}>
                        {p.checkInterval}s interval
                      </Typography>
                    }
                  />
                </ListItemButton>
              ))}
              {filteredProfiles.length === 0 && (
                <Box sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="caption" color="text.secondary">
                    No profiles found
                  </Typography>
                </Box>
              )}
            </List>
          </Box>
        </Grid>

        {/* Right Side: Detail Pane */}
        <Grid size={{ xs: 12, md: 8.8 }}>
          <Card variant="outlined">
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                  {selectedId === 'temp-new-profile' ? 'Create New Profile' : `Profile Settings: ${name}`}
                </Typography>
                {selectedId && selectedId !== 'temp-new-profile' && (
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    startIcon={<DeleteIcon />}
                    onClick={() => handleDelete(selectedId)}
                  >
                    Delete Profile
                  </Button>
                )}
              </Box>

              <Box component="form" onSubmit={handleSave} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <TextField
                  label="Profile Name"
                  size="small"
                  fullWidth
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <Tooltip title="Give the profile a name representing its target services. e.g. Streaming Services, Home Dev.">
                            <HelpIcon sx={{ fontSize: '1.2rem', color: 'text.secondary', cursor: 'help' }} />
                          </Tooltip>
                        </InputAdornment>
                      ),
                    }
                  }}
                />

                <TextField
                  label="Check Interval (seconds)"
                  type="number"
                  size="small"
                  fullWidth
                  required
                  value={interval}
                  onChange={(e) => setIntervalVal(Number(e.target.value))}
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <Tooltip title="The time interval between sequential background availability checks.">
                            <HelpIcon sx={{ fontSize: '1.2rem', color: 'text.secondary', cursor: 'help' }} />
                          </Tooltip>
                        </InputAdornment>
                      ),
                    }
                  }}
                />

                <TextField
                  label="Connection Timeout (seconds)"
                  type="number"
                  size="small"
                  fullWidth
                  required
                  value={timeout}
                  onChange={(e) => setTimeoutVal(Number(e.target.value))}
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <Tooltip title="How long Uptime Sentry will wait for a response before declaring a target offline.">
                            <HelpIcon sx={{ fontSize: '1.2rem', color: 'text.secondary', cursor: 'help' }} />
                          </Tooltip>
                        </InputAdornment>
                      ),
                    }
                  }}
                />

                <TextField
                  label="Consecutive Failure Alert Threshold"
                  type="number"
                  size="small"
                  fullWidth
                  required
                  value={failuresLimit}
                  onChange={(e) => setFailuresLimit(Number(e.target.value))}
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <Tooltip title="Number of consecutive failed check checks before triggering a system alert.">
                            <HelpIcon sx={{ fontSize: '1.2rem', color: 'text.secondary', cursor: 'help' }} />
                          </Tooltip>
                        </InputAdornment>
                      ),
                    }
                  }}
                />

                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Autocomplete
                      disableClearable
                      options={upSoundsList}
                      value={upSound}
                      onChange={(_e, val) => {
                        if (val) {
                          setUpSound(val);
                          playPreview(val, 'up');
                        }
                      }}
                      sx={{
                        userSelect: 'none',
                        '& .MuiAutocomplete-endAdornment': { top: 'calc(50% - 14px)' },
                        '& .MuiIconButton-root': { width: 28, height: 28, padding: 0.5 }
                      }}
                      renderInput={(params) => (
                        <TextField {...params} label="Default Up Sound (Recovery)" size="small" />
                      )}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Autocomplete
                      disableClearable
                      options={downSoundsList}
                      value={downSound}
                      onChange={(_e, val) => {
                        if (val) {
                          setDownSound(val);
                          playPreview(val, 'down');
                        }
                      }}
                      sx={{
                        userSelect: 'none',
                        '& .MuiAutocomplete-endAdornment': { top: 'calc(50% - 14px)' },
                        '& .MuiIconButton-root': { width: 28, height: 28, padding: 0.5 }
                      }}
                      renderInput={(params) => (
                        <TextField {...params} label="Default Down Sound (Outage)" size="small" />
                      )}
                    />
                  </Grid>
                </Grid>

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={bgRunning}
                      onChange={(e) => setBgRunning(e.target.checked)}
                      color="primary"
                    />
                  }
                  label={
                    <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                      <span>Continue running checks in background when inactive</span>
                      <Tooltip title="If checked, Uptime Sentry continues checking this profile's targets in the background even if you switch to a different active profile.">
                        <HelpIcon sx={{ fontSize: '1.1rem', color: 'text.secondary', cursor: 'help' }} />
                      </Tooltip>
                    </Stack>
                  }
                />

                <Box sx={{ mt: 1 }}>
                  <Button type="submit" variant="contained" startIcon={<SaveIcon />}>
                    {selectedId === 'temp-new-profile' ? 'Create Profile' : 'Save Profile'}
                  </Button>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
