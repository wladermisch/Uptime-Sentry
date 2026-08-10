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
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Autocomplete from '@mui/material/Autocomplete';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';

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
  degradedStatusCodes?: number[];
  degradedLatencyThreshold?: number;
  consecutiveFailuresLimit: number;
  profileName: string;
  upSound?: string;
  downSound?: string;
  keyword?: string;
  keywordRule?: string; // MUST_CONTAIN, MUST_NOT_CONTAIN, DISABLED
  paused?: boolean;
}

const FALLBACK_UP = ["default-profile", "no-sound", "Up-Default.wav", "Up2.wav", "Up3.wav", "Notification Modern.wav", "Notification1.wav", "Notification2.wav"];
const FALLBACK_DOWN = ["default-profile", "no-sound", "Down-Default.wav", "Down Modern.wav", "Down-2.wav", "Down3.wav", "Critical-Alert.wav", "Error.wav", "Notification Modern.wav", "Notification Warning.wav", "Notification1.wav", "Notification2.wav"];

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
  const [degradedCodesStr, setDegradedCodesStr] = React.useState('404, 503');
  const [degradedLatency, setDegradedLatency] = React.useState(1500);
  const [upSound, setUpSound] = React.useState('default-profile');
  const [downSound, setDownSound] = React.useState('default-profile');
  const [keyword, setKeyword] = React.useState('');
  const [keywordRule, setKeywordRule] = React.useState('DISABLED');
  const [paused, setPaused] = React.useState(false);

  // Live Dry Check State
  const [checking, setChecking] = React.useState(false);
  const [dryRunResult, setDryRunResult] = React.useState<{
    status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
    responseTime: number;
    message: string;
  } | null>(null);

  const previewTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncTargetsToBackend = async (allTargets: Target[], activeId: string) => {
    let profilesList: Profile[] = [];
    try {
      const stored = localStorage.getItem('uptime_sentry_profiles');
      if (stored) profilesList = JSON.parse(stored);
    } catch {}

    let appSettings = { defaultUpSound: 'Up-Default.wav', defaultDownSound: 'Down-Default.wav' };
    try {
      const storedSet = localStorage.getItem('uptime_sentry_settings');
      if (storedSet) appSettings = { ...appSettings, ...JSON.parse(storedSet) };
    } catch {}

    const activeProfileObj = profilesList.find((p) => p.id === activeId);
    const activeTargets = allTargets.filter((t) => t.profileId === activeId);

    const payload = activeTargets.map((t) => {
      let resolvedUpSound = t.upSound;
      if (!resolvedUpSound || resolvedUpSound === 'default-profile') {
        resolvedUpSound = activeProfileObj?.upSound || 'default-app';
      }
      if (!resolvedUpSound || resolvedUpSound === 'default-app') {
        resolvedUpSound = appSettings.defaultUpSound;
      }

      let resolvedDownSound = t.downSound;
      if (!resolvedDownSound || resolvedDownSound === 'default-profile') {
        resolvedDownSound = activeProfileObj?.downSound || 'default-app';
      }
      if (!resolvedDownSound || resolvedDownSound === 'default-app') {
        resolvedDownSound = appSettings.defaultDownSound;
      }

      return {
        id: t.id,
        name: t.name,
        type: t.type,
        host: t.host,
        timeout: t.timeout,
        recoveryAction: t.recoveryAction,
        acceptableStatusCodes: t.acceptableStatusCodes,
        degradedStatusCodes: t.degradedStatusCodes,
        degradedLatencyThreshold: t.degradedLatencyThreshold,
        consecutiveFailuresLimit: t.consecutiveFailuresLimit,
        profileName: activeProfileObj?.name || 'Default Profile',
        upSound: resolvedUpSound,
        downSound: resolvedDownSound,
        keyword: t.keyword,
        keywordRule: t.keywordRule,
        paused: t.paused,
      };
    });

    try {
      await fetch('http://127.0.0.1:8765/api/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.error('Failed to sync targets to Java backend:', e);
    }
  };

  const playPreview = React.useCallback((soundName: string, soundType: 'up' | 'down') => {
    if (soundName === 'default-profile' || soundName === 'no-sound') return;
    if (previewTimer.current) {
      clearTimeout(previewTimer.current);
    }
    previewTimer.current = setTimeout(() => {
      try {
        const audio = new Audio(`http://127.0.0.1:8765/api/audio/stream?type=${soundType}&file=${encodeURIComponent(soundName)}`);
        audio.volume = 0.8;
        audio.play().catch((err) => { console.error('Audio preview failed:', err); });
      } catch (e) {
        console.error('Audio play error:', e);
      }
    }, 500);
  }, []);

  const runLiveTest = React.useCallback(async (targetHost: string, targetType: string, timeLimit: number, statusCodes: string) => {
    if (!targetHost.trim()) {
      setDryRunResult(null);
      return;
    }
    setChecking(true);
    try {
      const parsedOk = statusCodes.split(',').map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
      const res = await fetch('http://127.0.0.1:8765/api/check/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: targetType,
          host: targetHost,
          timeout: timeLimit,
          acceptableStatusCodes: parsedOk.length > 0 ? parsedOk : [200],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const latency = data.responseTime || 0;
        let status: 'ONLINE' | 'DEGRADED' | 'OFFLINE' = data.online ? 'ONLINE' : 'OFFLINE';
        if (data.online && latency > degradedLatency) {
          status = 'DEGRADED';
        }
        setDryRunResult({
          status,
          responseTime: latency,
          message: data.message || (status === 'ONLINE' ? 'Target responded successfully.' : 'Check failed.'),
        });
      } else {
        setDryRunResult({
          status: 'OFFLINE',
          responseTime: 0,
          message: 'Local verification daemon returned an error code.',
        });
      }
    } catch (e) {
      setDryRunResult({
        status: 'OFFLINE',
        responseTime: 0,
        message: 'Could not connect to local verification daemon.',
      });
    } finally {
      setChecking(false);
    }
  }, [degradedLatency]);

  const fillForm = (t: Target) => {
    setName(t.name);
    setType(t.type);
    setHost(t.host);
    setTimeoutVal(t.timeout);
    setFailuresLimit(t.consecutiveFailuresLimit);
    setRecoveryAction(t.recoveryAction || '');
    setStatusCodesStr(t.acceptableStatusCodes?.join(', ') || '200');
    setDegradedCodesStr(t.degradedStatusCodes?.join(', ') || '404, 503');
    setDegradedLatency(t.degradedLatencyThreshold || 1500);
    setUpSound(t.upSound || 'default-profile');
    setDownSound(t.downSound || 'default-profile');
    setKeyword(t.keyword || '');
    setKeywordRule(t.keywordRule || 'DISABLED');
    setPaused(!!t.paused);

    runLiveTest(t.host, t.type, t.timeout, t.acceptableStatusCodes?.join(', ') || '200');
  };

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

    fetch('http://127.0.0.1:8765/api/audio/list')
      .then((r) => r.json())
      .then((data) => {
        if (data.up) setUpSoundsList(["default-profile", "no-sound", ...data.up]);
        if (data.down) setDownSoundsList(["default-profile", "no-sound", ...data.down]);
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

  // Fast 500ms Debounced Typing Verification
  React.useEffect(() => {
    if (!host.trim()) return;
    const timer = setTimeout(() => {
      runLiveTest(host, type, timeout, statusCodesStr);
    }, 500);
    return () => clearTimeout(timer);
  }, [host, type, timeout, statusCodesStr, runLiveTest]);

  const handleSelectTarget = (t: Target) => {
    setSelectedId(t.id || null);
    fillForm(t);
  };

  const handleNewTargetClick = () => {
    setSelectedId(-1);
    setName('New Target');
    setType('HTTP');
    setHost('https://');
    if (activeProfile) {
      setTimeoutVal(activeProfile.defaultTimeout);
      setFailuresLimit(activeProfile.consecutiveFailuresLimit);
    } else {
      setTimeoutVal(5);
      setFailuresLimit(2);
    }
    setRecoveryAction('');
    setStatusCodesStr('200');
    setDegradedCodesStr('404, 503');
    setDegradedLatency(1500);
    setUpSound('default-profile');
    setDownSound('default-profile');
    setKeyword('');
    setKeywordRule('DISABLED');
    setPaused(false);
    setDryRunResult(null);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile) return;

    const parsedStatusCodes = statusCodesStr
      .split(',')
      .map((s) => parseInt(s.trim()))
      .filter((n) => !isNaN(n));

    const parsedDegradedCodes = degradedCodesStr
      .split(',')
      .map((s) => parseInt(s.trim()))
      .filter((n) => !isNaN(n));

    let updatedTargets: Target[];

    if (selectedId && selectedId !== -1) {
      // Update mode
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
              degradedStatusCodes: parsedDegradedCodes,
              degradedLatencyThreshold: Number(degradedLatency),
              upSound,
              downSound,
              keyword,
              keywordRule,
              paused,
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
        degradedStatusCodes: parsedDegradedCodes,
        degradedLatencyThreshold: Number(degradedLatency),
        profileName: activeProfile.name,
        upSound,
        downSound,
        keyword,
        keywordRule,
        paused,
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
        consecutiveFailuresLimit: failuresLimit,
        recoveryAction,
        acceptableStatusCodes: [200],
        profileName: activeProfile.name,
        upSound,
        downSound,
        keyword,
        keywordRule,
        paused,
      });
    }
    return list;
  }, [targets, selectedId, activeProfile, name, type, host, timeout, failuresLimit, recoveryAction, upSound, downSound, keyword, keywordRule, paused]);

  const filteredTargets = displayTargets.filter(
    (t) =>
      t.profileId === activeProfile?.id &&
      (t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.host.toLowerCase().includes(searchQuery.toLowerCase()))
  );

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
        {/* Left Side: Sub-sidebar Frameless Compact List */}
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

            {/* List Wrapper to prevent item expansion */}
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', flexGrow: 1, overflowY: 'auto' }}>
              <List dense sx={{ p: 0, width: '100%' }}>
                {filteredTargets.map((t) => (
                  <ListItemButton
                    key={t.id}
                    selected={selectedId === t.id}
                    onClick={() => handleSelectTarget(t)}
                    sx={{
                      width: '100%',
                      flexGrow: 0,
                      flexShrink: 0,
                      alignSelf: 'flex-start',
                      borderRadius: 1,
                      mb: 0.5,
                      py: 0.4,
                      px: 1.5,
                      minHeight: 36,
                      '&.Mui-selected': {
                        bgcolor: 'action.selected',
                        fontWeight: 'bold',
                      }
                    }}
                  >
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <Typography variant="body2" sx={{ fontWeight: selectedId === t.id ? 'bold' : 'medium', fontSize: '0.84rem', lineHeight: 1.2 }}>
                            {t.name}
                          </Typography>
                          {t.paused && <Chip label="PAUSED" size="small" color="default" sx={{ height: 16, fontSize: '0.65rem' }} />}
                        </Stack>
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
                  <Box sx={{ p: 2, textAlign: 'center', width: '100%' }}>
                    <Typography variant="caption" color="text.secondary">
                      No targets found
                    </Typography>
                  </Box>
                )}
              </List>
            </Box>
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
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={paused}
                        onChange={(e) => setPaused(e.target.checked)}
                        color="warning"
                        size="small"
                      />
                    }
                    label={paused ? 'Paused' : 'Active'}
                  />
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
                </Stack>
              </Box>

              <Box component="form" onSubmit={handleSave} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                <TextField
                  label="Target Name"
                  size="small"
                  fullWidth
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />

                <TextField
                  select
                  label="Target Type"
                  size="small"
                  fullWidth
                  required
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  <MenuItem value="HTTP">HTTP(S) Web Service</MenuItem>
                  <MenuItem value="PING">PING (ICMP Protocol)</MenuItem>
                </TextField>

                <TextField
                  label={type === 'HTTP' ? 'URL (e.g., https://example.com)' : 'IP Address or Hostname (e.g., 8.8.8.8)'}
                  size="small"
                  fullWidth
                  required
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                />

                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      label="Check Connection Timeout (seconds)"
                      type="number"
                      size="small"
                      fullWidth
                      required
                      value={timeout}
                      onChange={(e) => setTimeoutVal(Number(e.target.value))}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      label="Consecutive Failures Alert Threshold"
                      type="number"
                      size="small"
                      fullWidth
                      required
                      value={failuresLimit}
                      onChange={(e) => setFailuresLimit(Number(e.target.value))}
                    />
                  </Grid>
                </Grid>

                {type === 'HTTP' && (
                  <>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <TextField
                          label="Acceptable Status Codes (ONLINE / UP)"
                          size="small"
                          fullWidth
                          required
                          value={statusCodesStr}
                          onChange={(e) => setStatusCodesStr(e.target.value)}
                          helperText="Comma separated values (e.g. 200, 201, 204)"
                        />
                      </Grid>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <TextField
                          label="Degraded Response Status Codes"
                          size="small"
                          fullWidth
                          value={degradedCodesStr}
                          onChange={(e) => setDegradedCodesStr(e.target.value)}
                          helperText="StatusCodes marked DEGRADED instead of DOWN (e.g. 404, 503)"
                        />
                      </Grid>
                    </Grid>

                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <TextField
                          select
                          label="Keyword Verification Rule"
                          size="small"
                          fullWidth
                          value={keywordRule}
                          onChange={(e) => setKeywordRule(e.target.value)}
                        >
                          <MenuItem value="DISABLED">Disabled (Status Code Only)</MenuItem>
                          <MenuItem value="MUST_CONTAIN">Must Contain Keyword (Online if present)</MenuItem>
                          <MenuItem value="MUST_NOT_CONTAIN">Must NOT Contain Keyword (Online if missing)</MenuItem>
                        </TextField>
                      </Grid>
                      <Grid size={{ xs: 12, md: 6 }}>
                        <TextField
                          label="Keyword / Search Text"
                          size="small"
                          fullWidth
                          disabled={keywordRule === 'DISABLED'}
                          value={keyword}
                          onChange={(e) => setKeyword(e.target.value)}
                          placeholder='e.g. "status":"operational"'
                        />
                      </Grid>
                    </Grid>
                  </>
                )}

                <TextField
                  label="Degraded Latency Threshold (ms)"
                  type="number"
                  size="small"
                  fullWidth
                  value={degradedLatency}
                  onChange={(e) => setDegradedLatency(Number(e.target.value))}
                  helperText="Response times higher than this threshold mark target status as DEGRADED"
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
                      sx={{ userSelect: 'none' }}
                      renderInput={(params) => (
                        <TextField {...params} label="Custom Up Sound (Optional)" size="small" />
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
                      sx={{ userSelect: 'none' }}
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
                />

                {/* Status Box */}
                <Box
                  sx={{
                    p: 2,
                    borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: dryRunResult
                      ? dryRunResult.status === 'ONLINE'
                        ? 'success.main'
                        : dryRunResult.status === 'DEGRADED'
                        ? 'warning.main'
                        : 'error.main'
                      : 'divider',
                    bgcolor: dryRunResult
                      ? dryRunResult.status === 'ONLINE'
                        ? 'rgba(76, 175, 80, 0.12)'
                        : dryRunResult.status === 'DEGRADED'
                        ? 'rgba(255, 152, 0, 0.12)'
                        : 'rgba(244, 67, 54, 0.12)'
                      : 'action.hover',
                    transition: 'all 0.3s ease',
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                    Current Status:
                  </Typography>
                  {checking ? (
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <CircularProgress size={16} />
                      <Typography variant="body2" color="text.secondary">
                        Checking target response...
                      </Typography>
                    </Stack>
                  ) : dryRunResult ? (
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 'bold',
                        color:
                          dryRunResult.status === 'ONLINE'
                            ? 'success.main'
                            : dryRunResult.status === 'DEGRADED'
                            ? 'warning.main'
                            : 'error.main',
                      }}
                    >
                      {dryRunResult.status === 'ONLINE'
                        ? `Online, ${dryRunResult.responseTime}ms Response time.`
                        : dryRunResult.status === 'DEGRADED'
                        ? `Degraded (${dryRunResult.responseTime}ms Response time). ${dryRunResult.message}`
                        : `Offline. ${dryRunResult.message}`}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Checking status...
                    </Typography>
                  )}
                </Box>

                <Box sx={{ mt: 1 }}>
                  <Button type="submit" variant="contained" startIcon={<SaveIcon />}>
                    Save Target
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
