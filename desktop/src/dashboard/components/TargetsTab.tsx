import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
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
import CircularProgress from '@mui/material/CircularProgress';
import Autocomplete from '@mui/material/Autocomplete';

interface Profile {
  id: string;
  name: string;
  defaultTimeout: number;
  checkInterval: number;
  consecutiveFailuresLimit: number;
  backgroundRunning: boolean;
  upSound?: string;
  downSound?: string;
}

interface Target {
  id?: number;
  profileId: string;
  name: string;
  type: string; // HTTP or PING
  host: string;
  timeout: number;
  recoveryAction: string;
  acceptableStatusCodes: number[];
  consecutiveFailuresLimit: number;
  profileName: string;
  upSound?: string;
  downSound?: string;
}

const FALLBACK_UP = ["default-profile", "Up-Default.wav", "Up2.wav", "Up3.wav", "Notification Modern.wav", "Notification1.wav", "Notification2.wav"];
const FALLBACK_DOWN = ["default-profile", "Down-Default.wav", "Down Modern.wav", "Down-2.wav", "Down3.wav", "Critical-Alert.wav", "Error.wav", "Notification Modern.wav", "Notification Warning.wav", "Notification1.wav", "Notification2.wav"];

export default function TargetsTab() {
  const [activeProfile, setActiveProfile] = React.useState<Profile | null>(null);
  const [targets, setTargets] = React.useState<Target[]>([]);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [upSoundsList, setUpSoundsList] = React.useState<string[]>(FALLBACK_UP);
  const [downSoundsList, setDownSoundsList] = React.useState<string[]>(FALLBACK_DOWN);

  // Form State
  const [name, setName] = React.useState('');
  const [type, setType] = React.useState('HTTP');
  const [host, setHost] = React.useState('');
  const [timeout, setTimeoutVal] = React.useState(5);
  const [failuresLimit, setFailuresLimit] = React.useState(2);
  const [recoveryAction, setRecoveryAction] = React.useState('');
  const [statusCodesStr, setStatusCodesStr] = React.useState('200');
  const [upSound, setUpSound] = React.useState('default-profile');
  const [downSound, setDownSound] = React.useState('default-profile');

  // Live Dry Check State
  const [checking, setChecking] = React.useState(false);
  const [dryRunResult, setDryRunResult] = React.useState<{
    online: boolean;
    responseTime: number;
    message: string;
  } | null>(null);
  const [suggestedCode, setSuggestedCode] = React.useState<number | null>(null);

  const previewTimer = React.useRef<any>(null);

  const syncTargetsToBackend = async (allTargets: Target[], activeId: string) => {
    let profilesList: Profile[] = [];
    try {
      const stored = localStorage.getItem('uptime_sentry_profiles');
      if (stored) profilesList = JSON.parse(stored);
    } catch {}

    let appSettings = { defaultUpSound: 'Up-Default.wav', defaultDownSound: 'Down-Default.wav' };
    try {
      const storedSettings = localStorage.getItem('uptime_sentry_settings');
      if (storedSettings) appSettings = JSON.parse(storedSettings);
    } catch {}

    const activeTargets = allTargets.filter(
      (t) => t.profileId === activeId || profilesList.find((p) => p.id === t.profileId)?.backgroundRunning
    );

    // Resolve sound settings hierarchy before sending to backend
    const resolvedTargetsPayload = activeTargets.map((t, idx) => {
      const p = profilesList.find((prof) => prof.id === t.profileId);
      
      let up = t.upSound;
      if (!up || up === 'default-profile') {
        up = p?.upSound || appSettings.defaultUpSound || 'Up-Default.wav';
      }
      if (up === 'default-app') {
        up = appSettings.defaultUpSound || 'Up-Default.wav';
      }

      let down = t.downSound;
      if (!down || down === 'default-profile') {
        down = p?.downSound || appSettings.defaultDownSound || 'Down-Default.wav';
      }
      if (down === 'default-app') {
        down = appSettings.defaultDownSound || 'Down-Default.wav';
      }

      return {
        id: t.id || idx + 1,
        name: t.name,
        type: t.type,
        host: t.host,
        timeout: t.timeout,
        recoveryAction: t.recoveryAction,
        acceptableStatusCodes: t.acceptableStatusCodes,
        consecutiveFailuresLimit: t.consecutiveFailuresLimit,
        profileName: t.profileName,
        upSound: up,
        downSound: down
      };
    });

    try {
      await fetch('http://127.0.0.1:8765/api/targets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resolvedTargetsPayload),
      });
    } catch (e) {
      console.error('Failed to sync targets to Java backend:', e);
    }
  };

  const playPreview = React.useCallback((soundName: string, type: 'up' | 'down') => {
    if (soundName === 'default-profile') return;
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

  const loadActiveProfileAndTargets = React.useCallback(() => {
    try {
      const storedProfiles = localStorage.getItem('uptime_sentry_profiles');
      const activeId = localStorage.getItem('uptime_sentry_active_id');
      const storedTargets = localStorage.getItem('uptime_sentry_targets');

      if (storedProfiles && activeId) {
        const profilesList = JSON.parse(storedProfiles) as Profile[];
        const found = profilesList.find((p) => p.id === activeId) || null;
        setActiveProfile(found);

        if (found && !selectedId) {
          setTimeoutVal(found.defaultTimeout);
          setFailuresLimit(found.consecutiveFailuresLimit);
        }
      }

      if (storedTargets) {
        const list = JSON.parse(storedTargets) as Target[];
        setTargets(list);

        const currentProfileTargets = list.filter((t) => t.profileId === activeId);
        if (currentProfileTargets.length > 0 && selectedId === null) {
          setSelectedId(currentProfileTargets[0].id || null);
          fillForm(currentProfileTargets[0]);
        }
      }
    } catch (e) {
      console.error('Failed to load profile targets', e);
    }
  }, [selectedId]);

  React.useEffect(() => {
    loadActiveProfileAndTargets();

    // Fetch sound options
    fetch('http://127.0.0.1:8765/api/audio/list')
      .then((r) => r.json())
      .then((data) => {
        if (data.up) setUpSoundsList(["default-profile", ...data.up]);
        if (data.down) setDownSoundsList(["default-profile", ...data.down]);
      })
      .catch((e) => console.warn('Could not load sound files list from API:', e));

    const handleProfile = () => loadActiveProfileAndTargets();
    const handleSearch = (e: Event) => {
      setSearchQuery((e as CustomEvent).detail || '');
    };

    window.addEventListener('profile-changed', handleProfile);
    window.addEventListener('profiles-updated', handleProfile);
    window.addEventListener('search-query', handleSearch);

    return () => {
      window.removeEventListener('profile-changed', handleProfile);
      window.removeEventListener('profiles-updated', handleProfile);
      window.removeEventListener('search-query', handleSearch);
    };
  }, [loadActiveProfileAndTargets]);

  const fillForm = (t: Target) => {
    setName(t.name);
    setType(t.type);
    setHost(t.host);
    setTimeoutVal(t.timeout);
    setFailuresLimit(t.consecutiveFailuresLimit);
    setRecoveryAction(t.recoveryAction || '');
    setStatusCodesStr(t.acceptableStatusCodes?.join(', ') || '200');
    setUpSound(t.upSound || 'default-profile');
    setDownSound(t.downSound || 'default-profile');
    setDryRunResult(null);
    setSuggestedCode(null);
  };

  // Debounced Live Checking
  React.useEffect(() => {
    if (!host.trim() || !host.startsWith('http') && type === 'HTTP') {
      setDryRunResult(null);
      setSuggestedCode(null);
      return;
    }

    const timer = setTimeout(async () => {
      setChecking(true);
      setDryRunResult(null);
      setSuggestedCode(null);

      try {
        const payload = {
          type,
          host,
          timeout: Number(timeout),
          acceptableStatusCodes: statusCodesStr.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n))
        };

        const res = await fetch('http://127.0.0.1:8765/api/targets/check-dryrun', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const result = await res.json();
          setDryRunResult(result);

          if (!result.online && type === 'HTTP' && result.statusCode) {
            setSuggestedCode(result.statusCode);
          }
        }
      } catch (err) {
        console.error('Dry check failed:', err);
      } finally {
        setChecking(false);
      }
    }, 2000); // 2 seconds debounce

    return () => clearTimeout(timer);
  }, [host, type, timeout, failuresLimit, recoveryAction, statusCodesStr, activeProfile]);

  const handleSelectTarget = (t: Target) => {
    setSelectedId(t.id || null);
    fillForm(t);
  };

  const handleNewTargetClick = () => {
    setSelectedId(-1);
    setName('');
    setHost('');
    setRecoveryAction('');
    setStatusCodesStr('200');
    setUpSound('default-profile');
    setDownSound('default-profile');
    setDryRunResult(null);
    setSuggestedCode(null);
    if (activeProfile) {
      setTimeoutVal(activeProfile.defaultTimeout);
      setFailuresLimit(activeProfile.consecutiveFailuresLimit);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile || !name.trim() || !host.trim()) return;

    const parsedStatusCodes = statusCodesStr
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map(Number)
      .filter((n) => !isNaN(n));

    let updatedTargets: Target[] = [];

    if (selectedId !== null && selectedId !== -1) {
      // Edit mode
      updatedTargets = targets.map((t) =>
        t.id === selectedId
          ? {
              ...t,
              name,
              type,
              host,
              timeout: Number(timeout),
              consecutiveFailuresLimit: Number(failuresLimit),
              recoveryAction,
              acceptableStatusCodes: parsedStatusCodes,
              upSound,
              downSound,
            }
          : t
      );
    } else {
      // Add mode
      const newTarget: Target = {
        id: Date.now(),
        profileId: activeProfile.id,
        name,
        type,
        host,
        timeout: Number(timeout),
        consecutiveFailuresLimit: Number(failuresLimit),
        recoveryAction,
        acceptableStatusCodes: parsedStatusCodes,
        profileName: activeProfile.name,
        upSound,
        downSound,
      };
      updatedTargets = [...targets, newTarget];
      setSelectedId(newTarget.id!);
    }

    localStorage.setItem('uptime_sentry_targets', JSON.stringify(updatedTargets));
    setTargets(updatedTargets);

    // Sync to backend
    syncTargetsToBackend(updatedTargets, activeProfile.id);
  };

  const handleDelete = (id: number) => {
    if (!activeProfile) return;
    if (id === -1) {
      const currentProfileTargets = targets.filter((t) => t.profileId === activeProfile.id);
      if (currentProfileTargets.length > 0) {
        setSelectedId(currentProfileTargets[0].id || null);
        fillForm(currentProfileTargets[0]);
      } else {
        handleNewTargetClick();
      }
      return;
    }

    const updated = targets.filter((t) => t.id !== id);
    localStorage.setItem('uptime_sentry_targets', JSON.stringify(updated));
    setTargets(updated);

    // Sync to backend
    syncTargetsToBackend(updated, activeProfile.id);

    const currentProfileTargets = updated.filter((t) => t.profileId === activeProfile.id);
    if (currentProfileTargets.length > 0) {
      setSelectedId(currentProfileTargets[0].id || null);
      fillForm(currentProfileTargets[0]);
    } else {
      handleNewTargetClick();
    }
  };

  const handleApplySuggestedCode = () => {
    if (suggestedCode !== null) {
      setStatusCodesStr(String(suggestedCode));
    }
  };

  // Compute reactive display list including temp target if active
  const displayTargets = React.useMemo(() => {
    const list = [...targets];
    if (selectedId === -1 && activeProfile) {
      list.push({
        id: -1,
        profileId: activeProfile.id,
        name: name || 'New Target',
        type,
        host,
        timeout,
        recoveryAction,
        acceptableStatusCodes: statusCodesStr.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n)),
        consecutiveFailuresLimit: failuresLimit,
        profileName: activeProfile.name,
        upSound,
        downSound,
      });
    }
    return list;
  }, [targets, selectedId, activeProfile, name, type, host, timeout, recoveryAction, statusCodesStr, failuresLimit, upSound, downSound]);

  const filteredTargets = displayTargets
    .filter((t) => t.profileId === activeProfile?.id)
    .filter((t) => t.name.toLowerCase().includes(searchQuery.toLowerCase()));

  if (!activeProfile) {
    return (
      <Box sx={{ width: '100%', p: 3, textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary">
          No active profile selected. Please select or create a profile in the Profiles tab first.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', maxWidth: { sm: '100%', md: '1700px' }, userSelect: 'none' }}>
      <Grid container spacing={3}>
        {/* Left Side: Sub-sidebar Frameless List */}
        <Grid size={{ xs: 12, md: 3.2 }}>
          <Box sx={{ borderRight: '1px solid', borderColor: 'divider', height: '100%', pr: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                Targets
              </Typography>
              <Button size="small" variant="text" startIcon={<AddIcon />} onClick={handleNewTargetClick} sx={{ minWidth: 'auto', py: 0.2 }}>
                Add
              </Button>
            </Box>
            <List dense sx={{ p: 0, overflow: 'auto', flexGrow: 1 }}>
              {filteredTargets.map((t) => (
                <ListItemButton
                  key={t.id}
                  selected={selectedId === t.id}
                  onClick={() => handleSelectTarget(t)}
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
                      <Typography variant="body2" sx={{ fontWeight: selectedId === t.id ? 'bold' : 'medium', fontSize: '0.82rem', lineHeight: 1.2 }}>
                        {t.name}
                      </Typography>
                    }
                    secondary={
                      <Typography variant="caption" sx={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', display: 'block', fontSize: '0.72rem', lineHeight: 1.1 }}>
                        {t.type} • {t.host}
                      </Typography>
                    }
                  />
                </ListItemButton>
              ))}
              {filteredTargets.length === 0 && (
                <Box sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="caption" color="text.secondary">
                    No targets found
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
                  {selectedId === -1 ? 'Add New Target' : `Target Settings: ${name}`}
                </Typography>
                {selectedId !== null && selectedId !== -1 && (
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    startIcon={<DeleteIcon />}
                    onClick={() => handleDelete(selectedId)}
                  >
                    Remove Target
                  </Button>
                )}
              </Box>

              <Box component="form" onSubmit={handleSave} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <TextField
                  label="Target Name"
                  size="small"
                  fullWidth
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <Tooltip title="Name of this service/check target (e.g. My Website, API Service).">
                            <HelpIcon sx={{ fontSize: '1.2rem', color: 'text.secondary', cursor: 'help' }} />
                          </Tooltip>
                        </InputAdornment>
                      ),
                    }
                  }}
                />

                <TextField
                  select
                  label="Target Type"
                  size="small"
                  fullWidth
                  required
                  value={type}
                  onChange={(e) => {
                    const t = e.target.value;
                    setType(t);
                    setDryRunResult(null);
                    setSuggestedCode(null);
                  }}
                >
                  <MenuItem value="HTTP">HTTP (Web Application)</MenuItem>
                  <MenuItem value="PING">PING (ICMP Protocol)</MenuItem>
                </TextField>

                <TextField
                  label={type === 'HTTP' ? 'URL (e.g., https://myapi.com)' : 'IP Address or Hostname (e.g., 8.8.8.8)'}
                  size="small"
                  fullWidth
                  required
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <Tooltip title={type === 'HTTP' ? 'URL to test. Must start with http:// or https://' : 'IP address or domain hostname to ping.'}>
                            <HelpIcon sx={{ fontSize: '1.2rem', color: 'text.secondary', cursor: 'help' }} />
                          </Tooltip>
                        </InputAdornment>
                      ),
                    }
                  }}
                />

                <TextField
                  label="Check Connection Timeout (seconds)"
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
                          <Tooltip title="Maximum time Uptime Sentry waits for a response before checking target state as offline.">
                            <HelpIcon sx={{ fontSize: '1.2rem', color: 'text.secondary', cursor: 'help' }} />
                          </Tooltip>
                        </InputAdornment>
                      ),
                    }
                  }}
                />

                <TextField
                  label="Consecutive Failures Alert Threshold"
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
                          <Tooltip title="Number of sequential checks that must fail before trigger notification alerts.">
                            <HelpIcon sx={{ fontSize: '1.2rem', color: 'text.secondary', cursor: 'help' }} />
                          </Tooltip>
                        </InputAdornment>
                      ),
                    }
                  }}
                />

                {type === 'HTTP' && (
                  <TextField
                    label="Acceptable HTTP Response Status Codes"
                    size="small"
                    fullWidth
                    required
                    value={statusCodesStr}
                    onChange={(e) => setStatusCodesStr(e.target.value)}
                    helperText="Comma separated values (e.g. 200, 201, 204)"
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <Tooltip title="Response status codes that are considered success (UP) state.">
                              <HelpIcon sx={{ fontSize: '1.2rem', color: 'text.secondary', cursor: 'help' }} />
                            </Tooltip>
                          </InputAdornment>
                        ),
                      }
                    }}
                  />
                )}

                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Autocomplete
                      options={upSoundsList}
                      value={upSound}
                      onChange={(_e, val) => {
                        if (val) {
                          setUpSound(val);
                          playPreview(val, 'up');
                        }
                      }}
                      renderInput={(params) => (
                        <TextField {...params} label="Custom Up Sound (Optional)" size="small" />
                      )}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Autocomplete
                      options={downSoundsList}
                      value={downSound}
                      onChange={(_e, val) => {
                        if (val) {
                          setDownSound(val);
                          playPreview(val, 'down');
                        }
                      }}
                      renderInput={(params) => (
                        <TextField {...params} label="Custom Down Sound (Optional)" size="small" />
                      )}
                    />
                  </Grid>
                </Grid>

                <TextField
                  label="Recovery Action Shell Script Command"
                  size="small"
                  fullWidth
                  value={recoveryAction}
                  onChange={(e) => setRecoveryAction(e.target.value)}
                  placeholder="e.g. C:\scripts\restart_apache.bat"
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <Tooltip title="A local cmd shell script command to auto-execute when this target goes offline.">
                            <HelpIcon sx={{ fontSize: '1.2rem', color: 'text.secondary', cursor: 'help' }} />
                          </Tooltip>
                        </InputAdornment>
                      ),
                    }
                  }}
                />

                {/* Debounced Live check view */}
                <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                    Current Status:
                  </Typography>
                  {checking ? (
                    <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5 }}>
                      <CircularProgress size={16} />
                      <Typography variant="body2" color="text.secondary">Checking...</Typography>
                    </Stack>
                  ) : dryRunResult ? (
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 'medium', color: dryRunResult.online ? 'success.main' : 'error.main' }}>
                        {dryRunResult.online ? `Online, ${dryRunResult.responseTime}ms Response time.` : 'Offline, 0ms Response time.'}
                      </Typography>
                      {dryRunResult.message && !dryRunResult.online && (
                        <Typography variant="caption" color="error.main" sx={{ display: 'block', mt: 0.5 }}>
                          Error: {dryRunResult.message}
                        </Typography>
                      )}
                      {suggestedCode !== null && (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={handleApplySuggestedCode}
                          sx={{ mt: 1, textTransform: 'none' }}
                        >
                          Use received status code ({suggestedCode})
                        </Button>
                      )}
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Offline, 0ms Response time.
                    </Typography>
                  )}
                </Box>

                <Box sx={{ mt: 1 }}>
                  <Button type="submit" variant="contained" startIcon={<SaveIcon />}>
                    {selectedId !== null && selectedId !== -1 ? 'Save Target' : 'Create Target'}
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
