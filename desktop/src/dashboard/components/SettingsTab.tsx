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
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import HelpIcon from '@mui/icons-material/Help';
import SaveIcon from '@mui/icons-material/Save';
import Stack from '@mui/material/Stack';
import Autocomplete from '@mui/material/Autocomplete';
import Slider from '@mui/material/Slider';
import VolumeUp from '@mui/icons-material/VolumeUp';

interface Settings {
  startWithWindows: boolean;
  autoCheckUpdates: boolean;
  enableNotifications: boolean;
  playSoundAlert: boolean;
  emailAlertsEnabled: boolean;
  emailRecipient: string;
  logRetentionDays: number;
  defaultUpSound: string;
  defaultDownSound: string;
  volume: number; // 0 to 100
}

const DEFAULT_SETTINGS: Settings = {
  startWithWindows: false,
  autoCheckUpdates: true,
  enableNotifications: true,
  playSoundAlert: true,
  emailAlertsEnabled: false,
  emailRecipient: '',
  logRetentionDays: 30,
  defaultUpSound: 'Up-Default.wav',
  defaultDownSound: 'Down-Default.wav',
  volume: 80,
};

const FALLBACK_UP = ["Up-Default.wav", "Up2.wav", "Up3.wav", "Notification Modern.wav", "Notification1.wav", "Notification2.wav"];
const FALLBACK_DOWN = ["Down-Default.wav", "Down Modern.wav", "Down-2.wav", "Down3.wav", "Critical-Alert.wav", "Error.wav", "Notification Modern.wav", "Notification Warning.wav", "Notification1.wav", "Notification2.wav"];

export default function SettingsTab() {
  const [settings, setSettings] = React.useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = React.useState(false);
  const [upSoundsList, setUpSoundsList] = React.useState<string[]>(FALLBACK_UP);
  const [downSoundsList, setDownSoundsList] = React.useState<string[]>(FALLBACK_DOWN);

  const previewTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch sounds list from Javalin API
  React.useEffect(() => {
    fetch('http://127.0.0.1:8765/api/audio/list')
      .then((r) => r.json())
      .then((data) => {
        if (data.up) setUpSoundsList(data.up);
        if (data.down) setDownSoundsList(data.down);
      })
      .catch((e) => { console.warn('Could not load sound files list from API, using fallback:', e); });

    try {
      const stored = localStorage.getItem('uptime_sentry_settings');
      if (stored) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      }
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  }, []);

  // Play preview sound with a 500ms debounce delay
  const playPreview = React.useCallback((soundName: string, type: 'up' | 'down', vol: number) => {
    if (previewTimer.current) {
      clearTimeout(previewTimer.current);
    }
    previewTimer.current = setTimeout(() => {
      try {
        const audio = new Audio(`http://127.0.0.1:8765/api/audio/stream?type=${type}&file=${encodeURIComponent(soundName)}`);
        audio.volume = vol / 100;
        audio.play().catch((err) => { console.error('Audio playback blocked or failed:', err); });
      } catch (e) {
        console.error('Audio play error:', e);
      }
    }, 500);
  }, []);

  const handleVolumeChange = (_event: Event, newValue: number | number[]) => {
    const vol = newValue as number;
    setSettings((prev) => {
      const updated = { ...prev, volume: vol };
      // Play a preview of the down sound to let user hear the volume level
      playPreview(updated.defaultDownSound, 'down', vol);
      return updated;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('uptime_sentry_settings', JSON.stringify(settings));

    // Save settings to Java backend
    try {
      await fetch('http://127.0.0.1:8765/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          volume: settings.volume / 100.0,
          playSoundAlert: settings.playSoundAlert,
        }),
      });
    } catch (err) {
      console.error('Failed to save settings to backend:', err);
    }

    setSaved(true);
    setTimeout(() => { setSaved(false); }, 2000);
  };

  return (
    <Box sx={{ width: '100%', maxWidth: { sm: '100%', md: '1700px' }, userSelect: 'none' }}>
      <Typography component="h2" variant="h6" sx={{ mb: 2 }}>
        Application Settings
      </Typography>
      <Card variant="outlined" component="form" onSubmit={handleSave}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* General Section */}
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
              General Options
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Stack spacing={1}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={settings.startWithWindows}
                    onChange={(e) => { setSettings({ ...settings, startWithWindows: e.target.checked }); }}
                    color="primary"
                  />
                }
                label={
                  <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                    <span>Start Uptime Sentry with Windows booting</span>
                    <Tooltip title="If checked, Uptime Sentry will automatically launch in the system tray when Windows boots.">
                      <HelpIcon sx={{ fontSize: '1.1rem', color: 'text.secondary', cursor: 'help' }} />
                    </Tooltip>
                  </Stack>
                }
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={settings.autoCheckUpdates}
                    onChange={(e) => { setSettings({ ...settings, autoCheckUpdates: e.target.checked }); }}
                    color="primary"
                  />
                }
                label={
                  <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                    <span>Auto check for new updates</span>
                    <Tooltip title="Allows Uptime Sentry to automatically verify releases in the background.">
                      <HelpIcon sx={{ fontSize: '1.1rem', color: 'text.secondary', cursor: 'help' }} />
                    </Tooltip>
                  </Stack>
                }
              />
            </Stack>
          </Box>

          {/* Notifications Section */}
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
              Alert & Notification Options
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Stack spacing={2}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={settings.enableNotifications}
                    onChange={(e) => { setSettings({ ...settings, enableNotifications: e.target.checked }); }}
                    color="primary"
                  />
                }
                label="Enable Desktop Notification Popups (System Tray)"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={settings.playSoundAlert}
                    onChange={(e) => { setSettings({ ...settings, playSoundAlert: e.target.checked }); }}
                    color="primary"
                  />
                }
                label="Play audio sound alert on target downtime"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={settings.emailAlertsEnabled}
                    onChange={(e) => { setSettings({ ...settings, emailAlertsEnabled: e.target.checked }); }}
                    color="primary"
                  />
                }
                label="Forward outage details via email"
              />
              {settings.emailAlertsEnabled && (
                <TextField
                  label="Recipient Email Address"
                  type="email"
                  size="small"
                  fullWidth
                  required
                  value={settings.emailRecipient}
                  onChange={(e) => { setSettings({ ...settings, emailRecipient: e.target.value }); }}
                  sx={{ maxWidth: '400px', mt: 1 }}
                />
              )}
            </Stack>
          </Box>

          {/* Audio Sounds Config */}
          {settings.playSoundAlert && (
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
                Global Default Audio Sounds
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Autocomplete
                    disableClearable
                    options={upSoundsList}
                    value={settings.defaultUpSound}
                    onChange={(_e, val) => {
                      if (val) {
                        setSettings((prev) => ({ ...prev, defaultUpSound: val }));
                        playPreview(val, 'up', settings.volume);
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
                    value={settings.defaultDownSound}
                    onChange={(_e, val) => {
                      if (val) {
                        setSettings((prev) => ({ ...prev, defaultDownSound: val }));
                        playPreview(val, 'down', settings.volume);
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
                <Grid size={12}>
                  <Typography id="volume-slider-label" variant="body2" color="text.secondary" gutterBottom>
                    Playback Volume ({settings.volume}%)
                  </Typography>
                  <Stack direction="row" spacing={2} sx={{ alignItems: 'center', maxWidth: 400 }}>
                    <VolumeUp sx={{ color: 'text.secondary' }} />
                    <Slider
                      aria-labelledby="volume-slider-label"
                      value={settings.volume}
                      onChange={handleVolumeChange}
                      min={0}
                      max={100}
                      size="small"
                    />
                  </Stack>
                </Grid>
              </Grid>
            </Box>
          )}

          {/* Logs Retention */}
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
              Log Retention Limits & Disk Usage
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Stack direction="column" spacing={2}>
              <TextField
                label="Keep history check logs for (days)"
                type="number"
                size="small"
                fullWidth
                required
                value={settings.logRetentionDays}
                onChange={(e) => { setSettings({ ...settings, logRetentionDays: Number(e.target.value) }); }}
                sx={{ maxWidth: '280px' }}
                slotProps={{
                  input: {
                    endAdornment: (
                      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption" color="text.secondary">days</Typography>
                        <Tooltip title="Purges old check logs from history database to optimize storage.">
                          <HelpIcon sx={{ fontSize: '1.2rem', color: 'text.secondary', cursor: 'help' }} />
                        </Tooltip>
                      </Stack>
                    ),
                  }
                }}
              />

              <Box sx={{ p: 2, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                  Disk Storage Usage Estimator
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ userSelect: 'text' }}>
                  Current Log Database Size: <strong>~142 KB</strong> • Estimated for {settings.logRetentionDays} Days Retention: <strong>~{(settings.logRetentionDays * 0.085).toFixed(1)} MB</strong>
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  UptimeSentry uses highly optimized plain-text JSON history records. Even keeping 365 days of continuous checks for multiple targets consumes less than 32 MB of disk space.
                </Typography>
              </Box>
            </Stack>
          </Box>

          <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button type="submit" variant="contained" startIcon={<SaveIcon />}>
              Save Settings
            </Button>
            {saved && (
              <Typography variant="caption" color="success.main" sx={{ fontWeight: 'medium' }}>
                Settings saved successfully!
              </Typography>
            )}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
