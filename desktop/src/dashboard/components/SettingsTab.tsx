import * as React from 'react';
import { fonts } from '../../shared-theme/themePrimitives';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
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
  const [storage, setStorage] = React.useState<{ checks: number; bytes: number; oldest: string | null } | null>(null);
  const [upSoundsList, setUpSoundsList] = React.useState<string[]>(FALLBACK_UP);
  const [downSoundsList, setDownSoundsList] = React.useState<string[]>(FALLBACK_DOWN);

  const previewTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch sounds list from Javalin API
  React.useEffect(() => {
    // Real history size, read from the monitoring service.
    fetch('http://127.0.0.1:8765/api/history')
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => {
        const list = JSON.parse(text) as { timestamp: string }[];
        const oldest = list.reduce<string | null>((m, c) => (m === null || c.timestamp < m ? c.timestamp : m), null);
        setStorage({ checks: list.length, bytes: new Blob([text]).size, oldest });
      })
      .catch(() => { setStorage(null); });
  }, []);

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
    <Box component="form" onSubmit={handleSave} sx={{ width: '100%', maxWidth: 880 }}>
      <SettingsSection title="General">
        <Stack spacing={1.5}>
          <SettingsOption
            checked={settings.startWithWindows}
            onChange={(v) => { setSettings({ ...settings, startWithWindows: v }); }}
            label="Start Uptime Sentry when Windows starts"
            help="Opens minimized in the system tray after you sign in."
          />
          <SettingsOption
            checked={settings.autoCheckUpdates}
            onChange={(v) => { setSettings({ ...settings, autoCheckUpdates: v }); }}
            label="Check for updates automatically"
            help="Looks for a newer release on GitHub in the background."
          />
        </Stack>
      </SettingsSection>

      <SettingsSection title="Alerts">
        <Stack spacing={1.5}>
          <SettingsOption
            checked={settings.enableNotifications}
            onChange={(v) => { setSettings({ ...settings, enableNotifications: v }); }}
            label="Show desktop notifications"
            help="A system tray notification when a target goes down or recovers."
          />
          <SettingsOption
            checked={settings.playSoundAlert}
            onChange={(v) => { setSettings({ ...settings, playSoundAlert: v }); }}
            label="Play a sound when a target goes down or recovers"
          />
          <SettingsOption
            checked={settings.emailAlertsEnabled}
            onChange={(v) => { setSettings({ ...settings, emailAlertsEnabled: v }); }}
            label="Email outage details"
          />
          {settings.emailAlertsEnabled && (
            <TextField
              label="Send to"
              type="email"
              size="small"
              fullWidth
              required
              placeholder="name@example.com"
              value={settings.emailRecipient}
              onChange={(e) => { setSettings({ ...settings, emailRecipient: e.target.value }); }}
              sx={{ maxWidth: 400, ml: { sm: 4.5 } }}
            />
          )}
        </Stack>
      </SettingsSection>

      {settings.playSoundAlert && (
        <SettingsSection title="Sounds">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5, maxWidth: 640 }}>
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
              renderInput={(params) => <TextField {...params} label="When a target recovers" size="small" />}
            />
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
              renderInput={(params) => <TextField {...params} label="When a target goes down" size="small" />}
            />
          </Box>
          <Typography id="volume-slider-label" sx={{ mt: 2.5, mb: 0.5, fontSize: 12.5, fontWeight: 600, color: 'text.secondary' }}>
            Volume
          </Typography>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', maxWidth: 400 }}>
            <VolumeUp sx={{ color: 'text.secondary' }} />
            <Slider aria-labelledby="volume-slider-label" value={settings.volume} onChange={handleVolumeChange} min={0} max={100} size="small" />
            <Typography sx={{ fontFamily: fonts.mono, fontSize: 13, width: 44, textAlign: 'right' }}>{settings.volume}%</Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Picking a sound plays a preview.
          </Typography>
        </SettingsSection>
      )}

      <SettingsSection title="Check history">
        <TextField
          label="Keep history for (days)"
          type="number"
          size="small"
          required
          value={settings.logRetentionDays}
          onChange={(e) => { setSettings({ ...settings, logRetentionDays: Number(e.target.value) }); }}
          sx={{ maxWidth: 220 }}
          helperText="Saved, but not applied by the monitoring service yet."
          slotProps={{ htmlInput: { min: 1 } }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontFamily: fonts.mono, fontSize: 13 }}>
          {storage
            ? `${storage.checks} checks recorded · ${storage.bytes < 1024 ? `${storage.bytes} B` : `${(storage.bytes / 1024).toFixed(1)} KB`}${storage.oldest ? ` · oldest ${storage.oldest}` : ''}`
            : 'Check history is unavailable while the monitoring service is unreachable.'}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          The monitoring service keeps the latest 200 checks across all targets.
        </Typography>
      </SettingsSection>

      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', pt: 3, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button type="submit" variant="contained" startIcon={<SaveIcon />}>
          Save settings
        </Button>
        <Typography role="status" variant="body2" sx={{ fontWeight: 600 }}>
          {saved ? 'Settings saved' : ''}
        </Typography>
      </Stack>
    </Box>
  );
}

/** A checkbox option with an optional one-line explanation under it. */
function SettingsOption({ checked, onChange, label, help }: { checked: boolean; onChange: (v: boolean) => void; label: string; help?: string }) {
  return (
    <Box>
      <FormControlLabel
        control={<Checkbox checked={checked} onChange={(e) => { onChange(e.target.checked); }} />}
        label={label}
        sx={{ ml: -1, '& .MuiFormControlLabel-label': { fontSize: 14 } }}
      />
      {help && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4.5, mt: -0.75, lineHeight: 1.45 }}>
          {help}
        </Typography>
      )}
    </Box>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box component="section" sx={{ py: 3, borderTop: '1px solid', borderColor: 'divider', '&:first-of-type': { borderTop: 'none', pt: 0 } }}>
      <Typography component="h3" variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}
