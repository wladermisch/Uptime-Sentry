import * as React from 'react';
import { fonts } from '../../shared-theme/themePrimitives';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { FieldGrid, Pass, PassFooter, PassHead, PassSection } from './workspace';
import Stack from '@mui/material/Stack';
import Slider from '@mui/material/Slider';
import VolumeUp from '@mui/icons-material/VolumeUp';
import { API } from '../historyStats';
import { EmailTemplate, normalizeAppEmail } from '../emailAlerts';
import { requestSync } from '../backendSync';
import { RecipientsInput, SmtpDraft, TemplateFields, TestEmailButton } from './EmailAlertFields';
import { LocalOnlyNote, SETTINGS_SAVED } from './AppGate';
import { AddSoundButton, SoundSelect, previewSound, useSoundLibrary } from './SoundPicker';
import WebhooksSection from './WebhooksSection';
import StatusPageSection from './StatusPageSection';
import DiscoverySection from './DiscoverySection';
import { ExportBackupButton, ImportBackupButton } from './BackupControls';

interface Settings {
  startWithWindows: boolean;
  autoCheckUpdates: boolean;
  enableNotifications: boolean;
  playSoundAlert: boolean;
  emailAlertsEnabled: boolean;
  emailRecipients: string[];
  emailTemplate: EmailTemplate;
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
  ...normalizeAppEmail({}),
  logRetentionDays: 30,
  defaultUpSound: 'Up-Default.wav',
  defaultDownSound: 'Down-Default.wav',
  volume: 80,
};

const DEFAULT_SMTP: SmtpDraft = {
  smtpHost: '',
  smtpPort: 587,
  smtpSecurity: 'STARTTLS',
  smtpUsername: '',
  smtpFrom: '',
  smtpFromName: 'Uptime Sentry',
};

type BackendSettings = SmtpDraft & { smtpPasswordSet?: boolean; passwordStore?: string | null; historyRetentionDays?: number };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function SettingsTab() {
  const [settings, setSettings] = React.useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = React.useState(false);
  const [storage, setStorage] = React.useState<{ checks: number; bytes: number; oldest: string | null } | null>(null);
  const [smtp, setSmtp] = React.useState<SmtpDraft>(DEFAULT_SMTP);
  const [passwordSet, setPasswordSet] = React.useState(false);
  // undefined: not known yet; null: no system credential store, kept in memory only.
  const [passwordStore, setPasswordStore] = React.useState<string | null | undefined>(undefined);
  const [passwordDirty, setPasswordDirty] = React.useState(false);
  const [backendError, setBackendError] = React.useState(false);
  const sounds = useSoundLibrary();
  const [load, setLoad] = React.useState<{ targets: number; intervalSeconds: number } | null>(null);

  const previewTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadStorage = React.useCallback(() => {
    fetch(`${API}/api/history/stats`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { checks: number; bytes: number; oldest: string | null }) => { setStorage(d); })
      .catch(() => { setStorage(null); });
  }, []);

  const applyBackend = React.useCallback((d: BackendSettings) => {
    setSmtp({
      smtpHost: d.smtpHost ?? '',
      smtpPort: d.smtpPort || 587,
      smtpSecurity: d.smtpSecurity || 'STARTTLS',
      smtpUsername: d.smtpUsername ?? '',
      smtpFrom: d.smtpFrom ?? '',
      smtpFromName: d.smtpFromName ?? 'Uptime Sentry',
    });
    setPasswordSet(!!d.smtpPasswordSet);
    setPasswordStore(d.passwordStore);
    setPasswordDirty(false);
    const days = d.historyRetentionDays;
    if (days) setSettings((prev) => ({ ...prev, logRetentionDays: days }));
    setBackendError(false);
  }, []);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem('uptime_sentry_settings');
      if (stored) {
        const raw = JSON.parse(stored) as Record<string, unknown>;
        setSettings({ ...DEFAULT_SETTINGS, ...raw, ...normalizeAppEmail(raw) } as Settings);
      }
    } catch (e) {
      console.error('Failed to load settings', e);
    }

    loadStorage();

    // Mail server and retention live in the monitoring service: it sends the emails and prunes history.
    fetch(`${API}/api/settings`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: BackendSettings) => { applyBackend(d); })
      .catch(() => { setBackendError(true); });

    // What is being checked now, for the history size estimate.
    Promise.all([
      fetch(`${API}/api/targets`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API}/api/autocheck/status`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([t, a]: [{ paused?: boolean }[], { intervalSeconds?: number } | null]) => {
        setLoad({ targets: t.filter((x) => !x.paused).length, intervalSeconds: a?.intervalSeconds || 60 });
      })
      .catch(() => { setLoad(null); });
  }, [applyBackend, loadStorage]);

  // Play a preview of the down sound while the volume slider moves, at most twice a second.
  const playPreview = React.useCallback((soundName: string, type: 'up' | 'down', vol: number) => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => { previewSound(soundName, type, vol / 100); }, 500);
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

    try {
      const { smtpPassword, ...server } = smtp;
      const r = await fetch(`${API}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          volume: settings.volume / 100.0,
          playSoundAlert: settings.playSoundAlert,
          desktopNotifications: settings.enableNotifications,
          historyRetentionDays: settings.logRetentionDays,
          ...server,
          ...(passwordDirty ? { smtpPassword: smtpPassword ?? '' } : {}),
        }),
      });
      if (!r.ok) throw new Error(String(r.status));
      applyBackend((await r.json()) as BackendSettings);
      loadStorage();
    } catch (err) {
      console.error('Failed to save settings to backend:', err);
      setBackendError(true);
    }
    // Recipients and messages are resolved per target, so push the targets again.
    requestSync();
    window.dispatchEvent(new CustomEvent(SETTINGS_SAVED));

    setSaved(true);
    setTimeout(() => { setSaved(false); }, 2000);
  };

  // Size once the history is full: checks per day × days × bytes per stored check (measured, else typical).
  const estimate = React.useMemo(() => {
    if (!load || load.targets === 0 || !(settings.logRetentionDays > 0)) return null;
    const perDay = Math.round((86400 / Math.max(1, load.intervalSeconds)) * load.targets);
    const perCheck = storage && storage.checks > 50 ? storage.bytes / storage.checks : 210;
    return { ...load, perDay, bytes: perDay * settings.logRetentionDays * perCheck };
  }, [load, storage, settings.logRetentionDays]);

  return (
    <Pass component="form" onSubmit={(e: React.FormEvent) => { void handleSave(e); }} aria-label="Settings" maxWidth={760}>
      <PassHead title="Settings" meta={<span>Apply to every profile · stored on this computer</span>} />
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
            help="Sends an email when a target goes down, through the mail server below. Profiles and targets can set their own recipients and message."
          />
          <Box sx={{ pt: 1 }}>
            <LocalOnlyNote email={settings.emailAlertsEnabled} />
          </Box>
        </Stack>
      </SettingsSection>

      {settings.emailAlertsEnabled && (
        <>
          <SettingsSection title="Mail server">
            <Stack spacing={2}>
              <FieldGrid columns={3}>
                <TextField
                  label="SMTP server"
                  size="small"
                  placeholder="smtp.example.com"
                  value={smtp.smtpHost}
                  onChange={(e) => { setSmtp({ ...smtp, smtpHost: e.target.value.trim() }); }}
                  sx={{ gridColumn: { sm: 'span 2' } }}
                />
                <TextField
                  label="Port"
                  type="number"
                  size="small"
                  value={smtp.smtpPort}
                  onChange={(e) => { setSmtp({ ...smtp, smtpPort: Number(e.target.value) }); }}
                  slotProps={{ htmlInput: { min: 1, max: 65535 } }}
                />
              </FieldGrid>
              <FieldGrid columns={2}>
                <TextField
                  select
                  label="Encryption"
                  size="small"
                  value={smtp.smtpSecurity}
                  onChange={(e) => {
                    const sec = e.target.value;
                    const port = sec === 'SSL' ? 465 : sec === 'NONE' ? 25 : 587;
                    // Follow the usual port unless someone typed a non-standard one.
                    setSmtp({ ...smtp, smtpSecurity: sec, smtpPort: [25, 465, 587].includes(smtp.smtpPort) ? port : smtp.smtpPort });
                  }}
                >
                  <MenuItem value="STARTTLS">STARTTLS (usually port 587)</MenuItem>
                  <MenuItem value="SSL">SSL/TLS (usually port 465)</MenuItem>
                  <MenuItem value="NONE">None (port 25, unencrypted)</MenuItem>
                </TextField>
                <Box sx={{ display: { xs: 'none', sm: 'block' } }} />
                <TextField
                  label="User name"
                  size="small"
                  autoComplete="off"
                  value={smtp.smtpUsername}
                  onChange={(e) => { setSmtp({ ...smtp, smtpUsername: e.target.value }); }}
                  helperText="Often your full email address."
                />
                <TextField
                  label="Password"
                  type="password"
                  size="small"
                  autoComplete="new-password"
                  value={smtp.smtpPassword ?? ''}
                  placeholder={passwordSet && !passwordDirty ? '•••••••• saved' : ''}
                  onChange={(e) => { setSmtp({ ...smtp, smtpPassword: e.target.value }); setPasswordDirty(true); }}
                  helperText={passwordSet && !passwordDirty ? 'Leave empty to keep the saved password.' : 'Gmail and Outlook need an app password.'}
                  slotProps={{ inputLabel: { shrink: passwordSet || !!smtp.smtpPassword } }}
                />
                <TextField
                  label="Send from address"
                  type="email"
                  size="small"
                  placeholder="alerts@example.com"
                  value={smtp.smtpFrom}
                  onChange={(e) => { setSmtp({ ...smtp, smtpFrom: e.target.value.trim() }); }}
                />
                <TextField
                  label="Sender name"
                  size="small"
                  value={smtp.smtpFromName}
                  onChange={(e) => { setSmtp({ ...smtp, smtpFromName: e.target.value }); }}
                />
              </FieldGrid>
              <Typography variant="caption" color="text.secondary">
                {passwordStore === null
                  ? "This computer has no system credential store, so the password is only kept in memory and must be entered again after a restart. It is never written to a file and only sent to this mail server."
                  : `The password is stored encrypted in ${passwordStore ?? "your system's credential store"}, not in a file, and is only sent to this mail server.`}
              </Typography>
              {backendError && (
                <Typography variant="body2" role="alert">
                  Can&apos;t reach the monitoring service at 127.0.0.1:8765, so mail server settings can&apos;t be loaded or saved.
                </Typography>
              )}
            </Stack>
          </SettingsSection>

          <SettingsSection title="Default outage email">
            <Stack spacing={2.5}>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '72ch' }}>
                Used for every target unless its profile or the target itself sets other recipients or text.
              </Typography>
              <RecipientsInput
                value={settings.emailRecipients}
                onChange={(emailRecipients) => { setSettings({ ...settings, emailRecipients }); }}
              />
              <TemplateFields value={settings.emailTemplate} onChange={(emailTemplate) => { setSettings({ ...settings, emailTemplate }); }} />
              <TestEmailButton
                recipients={settings.emailRecipients}
                template={settings.emailTemplate}
                smtp={passwordDirty ? smtp : { ...smtp, smtpPassword: undefined }}
                disabledReason={!smtp.smtpHost || !smtp.smtpFrom ? 'Enter the SMTP server and send-from address first.' : undefined}
              />
            </Stack>
          </SettingsSection>
        </>
      )}

      <WebhooksSection />

      {settings.playSoundAlert && (
        <PassSection label="Sounds" aside={<AddSoundButton />}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 }}>
            <SoundSelect
              type="up"
              label="When a target recovers"
              value={settings.defaultUpSound}
              onChange={(v) => { setSettings((prev) => ({ ...prev, defaultUpSound: v })); }}
              allowSilent={false}
              library={sounds}
              volume={settings.volume / 100}
            />
            <SoundSelect
              type="down"
              label="When a target goes down"
              value={settings.defaultDownSound}
              onChange={(v) => { setSettings((prev) => ({ ...prev, defaultDownSound: v })); }}
              allowSilent={false}
              library={sounds}
              volume={settings.volume / 100}
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
            Picking a sound plays a preview. Profiles and targets can choose their own.
          </Typography>
        </PassSection>
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
          helperText="Older checks are deleted. Reports can only cover this period."
          slotProps={{ htmlInput: { min: 1, max: 3650 } }}
        />
        {estimate && (
          <Typography variant="body2" sx={{ mt: 2, fontSize: 13.5 }}>
            Expected size: about <strong>{formatBytes(estimate.bytes)}</strong> for {settings.logRetentionDays} {settings.logRetentionDays === 1 ? 'day' : 'days'}
            <Box component="span" sx={{ color: 'text.secondary' }}>
              {' '}({estimate.targets} {estimate.targets === 1 ? 'target' : 'targets'} checked every {estimate.intervalSeconds} s, {estimate.perDay.toLocaleString()} checks a day)
            </Box>
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontFamily: fonts.mono, fontSize: 13 }}>
          {storage
            ? `${storage.checks.toLocaleString()} checks recorded · ${formatBytes(storage.bytes)}${storage.oldest ? ` · oldest ${storage.oldest}` : ''}`
            : 'Check history is unavailable while the monitoring service is unreachable.'}
        </Typography>
      </SettingsSection>

      <StatusPageSection />

      <DiscoverySection />

      <DataSection storage={storage} onCleared={loadStorage} />

      <PassFooter>
        <Button type="submit" variant="contained" size="small" startIcon={saved ? <CheckRoundedIcon /> : undefined}>
          {saved ? 'Saved' : 'Save settings'}
        </Button>
        <Box role="status" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {saved ? 'Settings saved' : ''}
        </Box>
      </PassFooter>
    </Pass>
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

type Danger = 'history' | 'reset';

const DANGER_TEXT: Record<Danger, { title: string; body: string[]; confirm: string }> = {
  history: {
    title: 'Clear check history?',
    body: [
      'Deletes every recorded check on this computer. Analytics, reports and the uptime figures on Home start from zero.',
      'Targets, profiles and settings stay as they are. This can’t be undone.',
    ],
    confirm: 'Clear history',
  },
  reset: {
    title: 'Reset Uptime Sentry?',
    body: [
      'Returns the app to a fresh install. This deletes all profiles and targets, the check history, all settings including the mail server and its saved password, maintenance windows, webhooks, scheduled reports, outage notes and the sounds you added.',
      'The app restarts with the setup assistant. This can’t be undone.',
    ],
    confirm: 'Reset everything',
  },
};

/** Clear history and full reset, each behind a confirmation. */
function DataSection({ storage, onCleared }: { storage: { checks: number } | null; onCleared: () => void }) {
  const [confirm, setConfirm] = React.useState<Danger | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  const run = async (what: Danger) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API}${what === 'history' ? '/api/history' : '/api/reset'}`, { method: what === 'history' ? 'DELETE' : 'POST' });
      if (!r.ok) throw new Error(String(r.status));
      if (what === 'reset') {
        // Everything the window keeps: profiles, targets, settings, acknowledgements, report options.
        try {
          Object.keys(localStorage).filter((k) => k.startsWith('uptime_sentry')).forEach((k) => { localStorage.removeItem(k); });
        } catch {
          // Storage unavailable: nothing to remove.
        }
        window.location.reload();
        return;
      }
      try { localStorage.removeItem('uptime_sentry_board_ack'); } catch { /* storage unavailable */ }
      window.dispatchEvent(new CustomEvent('history-cleared'));
      onCleared();
      setDone('History cleared.');
      setConfirm(null);
    } catch {
      setError('Can’t reach the monitoring service at 127.0.0.1:8765, so nothing was deleted.');
    } finally {
      setBusy(false);
    }
  };

  const text = confirm ? DANGER_TEXT[confirm] : null;
  return (
    <PassSection label="Data">
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
          <Box>
            <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Backup</Typography>
            <Typography variant="caption" color="text.secondary">
              Save everything to one file, or restore from one: for a new computer, or before trying something out.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
            <ExportBackupButton />
            <ImportBackupButton />
          </Stack>
        </Stack>
        <DangerRow
          title="Clear check history"
          help={storage ? `Deletes the ${storage.checks.toLocaleString()} recorded checks. Targets and settings stay.` : 'Deletes all recorded checks. Targets and settings stay.'}
          action="Clear history"
          disabled={storage?.checks === 0}
          onClick={() => { setDone(null); setError(null); setConfirm('history'); }}
        />
        <DangerRow
          title="Reset application"
          help="Deletes all profiles, targets, history, settings, maintenance, webhooks, scheduled reports, notes and added sounds, as if freshly installed."
          action="Reset…"
          onClick={() => { setDone(null); setError(null); setConfirm('reset'); }}
        />
        {done && <Typography variant="body2" role="status">{done}</Typography>}
      </Stack>
      <Dialog open={!!confirm} onClose={() => { if (!busy) setConfirm(null); }} maxWidth="xs" fullWidth>
        {text && (
          <>
            <DialogTitle sx={{ fontSize: 18, fontWeight: 700 }}>{text.title}</DialogTitle>
            <DialogContent>
              {text.body.map((p) => <DialogContentText key={p} sx={{ mb: 1.5, fontSize: 14 }}>{p}</DialogContentText>)}
              {error && <Typography variant="body2" role="alert" sx={{ color: 'error.main' }}>{error}</Typography>}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
              <Button size="small" onClick={() => { setConfirm(null); }} disabled={busy} autoFocus>Cancel</Button>
              <Button size="small" variant="contained" color="error" onClick={() => { if (confirm) void run(confirm); }} disabled={busy}>
                {busy ? 'Working…' : text.confirm}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </PassSection>
  );
}

function DangerRow({ title, help, action, onClick, disabled }: { title: string; help: string; action: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
      <Box>
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{title}</Typography>
        <Typography variant="caption" color="text.secondary">{help}</Typography>
      </Box>
      <Button size="small" variant="outlined" color="error" onClick={onClick} disabled={disabled} sx={{ flexShrink: 0, alignSelf: { xs: 'flex-start', sm: 'center' } }}>
        {action}
      </Button>
    </Stack>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <PassSection label={title}>{children}</PassSection>;
}
