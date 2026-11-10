import * as React from 'react';
import { nextTargetId } from '../targetIds';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import MenuItem from '@mui/material/MenuItem';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import TrackChangesRoundedIcon from '@mui/icons-material/TrackChangesRounded';
import AnalyticsRoundedIcon from '@mui/icons-material/AnalyticsRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import EngineeringRoundedIcon from '@mui/icons-material/EngineeringRounded';
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded';
import PublicRoundedIcon from '@mui/icons-material/PublicRounded';
import BrandMark from './BrandMark';
import { ImportBackupButton } from './BackupControls';
import { fonts, ink, paper } from '../../shared-theme/themePrimitives';

const STEPS = ['Welcome', 'Tour', 'Preferences', 'First target'];

const TOUR = [
  { icon: <HomeRoundedIcon />, title: 'Home', text: 'Everything you monitor on one board, ranked so whatever is down comes first, with when it went down and why. The bell lists what changed until you acknowledge it.' },
  { icon: <TrackChangesRoundedIcon />, title: 'Targets & Profiles', text: 'Check websites (HTTP, with optional page text), devices (ping), TCP ports, DNS names and SSL certificate expiry, or find them on your network (off until you turn it on). Group them into profiles with their own sounds and recovery scripts.' },
  { icon: <NotificationsActiveRoundedIcon />, title: 'Alerts', text: 'Sounds and desktop notifications, plus optional emails and webhooks for Slack, Teams, Discord or your phone (ntfy), when a target goes down, recovers or gets slow.' },
  { icon: <EngineeringRoundedIcon />, title: 'Maintenance', text: 'Plan windows for updates and restarts: checks keep running, alerts pause, and the time is left out of availability.' },
  { icon: <AnalyticsRoundedIcon />, title: 'Analytics', text: 'Availability and every recorded outage per target, with notes on what caused it and what fixed it.' },
  { icon: <AssignmentRoundedIcon />, title: 'Reports', text: 'Availability reports as PDF, Markdown or text, or emailed every day, week or month.' },
  { icon: <PublicRoundedIcon />, title: 'Status page', text: 'An optional read-only page with the current state and 30 days of history, for this computer or your local network.' },
];

const CHECK_TYPES: Record<string, { label: string; host: string; placeholder: string }> = {
  PING: { label: 'Ping (device)', host: 'IP address or host name', placeholder: '192.168.1.20' },
  HTTP: { label: 'HTTP (website)', host: 'URL', placeholder: 'https://example.com' },
  TCP: { label: 'TCP port', host: 'IP address or host name', placeholder: 'nas.local' },
  DNS: { label: 'DNS name', host: 'Domain name', placeholder: 'example.com' },
  SSL: { label: 'SSL certificate', host: 'Domain name', placeholder: 'example.com' },
};

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
}

export default function OnboardingModal({ open, onClose }: OnboardingModalProps) {
  const [activeStep, setActiveStep] = React.useState(0);

  // Preferences
  const [startWithWindows, setStartWithWindows] = React.useState(true);
  const [defaultUpSound, setDefaultUpSound] = React.useState('Up-Default.wav');
  const [defaultDownSound, setDefaultDownSound] = React.useState('Down-Default.wav');
  const [checkInterval, setCheckInterval] = React.useState(60);

  // First target (optional)
  const [targetName, setTargetName] = React.useState('');
  const [targetType, setTargetType] = React.useState('PING');
  const [targetHost, setTargetHost] = React.useState('');
  const [targetPort, setTargetPort] = React.useState<number | ''>('');
  const targetTimeout = 5;

  const handleFinish = React.useCallback(() => {
    // Keep anything already set (e.g. after a reset), and add the choices made here.
    let current: Record<string, unknown> = {};
    try { current = JSON.parse(localStorage.getItem('uptime_sentry_settings') || '{}') as Record<string, unknown>; } catch { current = {}; }
    const settings = { ...current, startWithWindows, defaultUpSound, defaultDownSound, defaultCheckInterval: checkInterval };
    localStorage.setItem('uptime_sentry_settings', JSON.stringify(settings));

    const activeId = localStorage.getItem('uptime_sentry_active_id') || 'p_default';
    let profileName = 'Standard Profile';
    try {
      // The interval asked for here is the active profile's.
      const profiles = JSON.parse(localStorage.getItem('uptime_sentry_profiles') || '[]') as { id: string; name: string; checkInterval?: number }[];
      profileName = profiles.find((p) => p.id === activeId)?.name ?? profileName;
      localStorage.setItem('uptime_sentry_profiles', JSON.stringify(profiles.map((p) => (p.id === activeId ? { ...p, checkInterval } : p))));
    } catch (e) {
      console.error('Failed to apply the check interval', e);
    }

    if (targetHost.trim()) {
      try {
        const existing = JSON.parse(localStorage.getItem('uptime_sentry_targets') || '[]') as { id?: number; profileId?: string; host?: string; type?: string }[];
        const initialTarget = {
          id: nextTargetId(existing),
          profileId: activeId,
          name: targetName.trim() || targetHost.trim(),
          type: targetType,
          host: targetHost.trim(),
          timeout: targetTimeout,
          recoveryAction: '',
          acceptableStatusCodes: [200, 201],
          consecutiveFailuresLimit: 2,
          profileName,
          upSound: 'default-profile',
          downSound: 'default-profile',
          ...(targetType === 'TCP' || targetType === 'SSL' ? { port: targetPort === '' ? undefined : Number(targetPort) } : {}),
        };
        // Don't add a second copy of a target the profile already has (e.g. the default Google DNS).
        const duplicate = existing.some(
          (t) => t.profileId === activeId && t.type === targetType && t.host?.trim().toLowerCase() === targetHost.trim().toLowerCase(),
        );
        if (!duplicate) {
          localStorage.setItem('uptime_sentry_targets', JSON.stringify([...existing, initialTarget]));
          window.dispatchEvent(new CustomEvent('profiles-updated'));
        }
      } catch (e) {
        console.error('Failed to create initial target', e);
      }
    }

    localStorage.setItem('uptime_sentry_onboarded', 'true');
    window.dispatchEvent(new CustomEvent('profiles-updated'));
    onClose();
  }, [startWithWindows, defaultUpSound, defaultDownSound, checkInterval, targetHost, targetName, targetType, targetPort, onClose]);

  const last = activeStep === STEPS.length - 1;
  const handleNext = React.useCallback(() => {
    if (last) handleFinish();
    else setActiveStep((step) => step + 1);
  }, [last, handleFinish]);
  const handleBack = React.useCallback(() => {
    setActiveStep((step) => Math.max(0, step - 1));
  }, []);

  return (
    <Dialog
      open={open}
      fullScreen
      aria-labelledby="onboarding-title"
      slotProps={{ paper: { sx: { backgroundColor: 'background.default', backgroundImage: 'none' } } }}
    >
      <Box sx={{ minHeight: '100%', display: 'flex', flexDirection: 'column', px: { xs: 3, md: 6 }, py: { xs: 3, md: 5 } }}>
        {/* Brand and progress */}
        <Box sx={{ width: '100%', maxWidth: 760, mx: 'auto' }}>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5 }}>
            <Box sx={(theme) => ({ color: ink, '--brandmark-ink': paper, display: 'flex', ...theme.applyStyles('dark', { color: paper, '--brandmark-ink': ink }) })}>
              <BrandMark size={32} />
            </Box>
            <Typography sx={{ fontWeight: 800, fontSize: 18, mr: 'auto' }}>Uptime Sentry</Typography>
            <Typography sx={{ fontFamily: fonts.mono, fontSize: 12, color: 'text.secondary' }}>
              Step {activeStep + 1} of {STEPS.length}
            </Typography>
          </Stack>
          <Box component="ol" aria-label="Setup steps" sx={{ listStyle: 'none', p: 0, m: 0, mt: 3, display: 'grid', gridTemplateColumns: `repeat(${STEPS.length}, 1fr)`, gap: 1 }}>
            {STEPS.map((label, i) => (
              <Box component="li" key={label} aria-current={i === activeStep ? 'step' : undefined}>
                <Box sx={{ height: 4, borderRadius: 2, backgroundColor: i <= activeStep ? 'text.primary' : 'divider', transition: 'background-color 200ms ease-out' }} />
                <Typography sx={{ mt: 1, fontSize: 12.5, fontWeight: i === activeStep ? 700 : 500, color: i <= activeStep ? 'text.primary' : 'text.secondary' }}>
                  {label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Step content */}
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', py: 4 }}>
          <Box
            sx={{
              width: '100%',
              maxWidth: 760,
              mx: 'auto',
              backgroundColor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2.5,
              p: { xs: 3, md: 5 },
            }}
          >
            {activeStep === 0 && (
              <Stack spacing={2.5}>
                <Typography id="onboarding-title" component="h1" sx={{ fontSize: 40, fontWeight: 800, fontStretch: '72%', lineHeight: 1.05 }}>
                  Welcome to Uptime Sentry
                </Typography>
                <Typography sx={{ fontSize: 16, lineHeight: 1.6, color: 'text.secondary', maxWidth: '60ch' }}>
                  Uptime Sentry watches your websites, servers and network devices from this computer, with no account and no cloud.
                  It tells you the moment something goes down or comes back, and can run a script to fix it.
                </Typography>
                <Box sx={{ pt: 2.5, mt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' }, mb: 2.5 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                      Moving from another computer, or starting over? Restore a backup made in Settings and skip the setup.
                    </Typography>
                    <ImportBackupButton label="Restore a backup…" />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    Free and open source, made by <strong>Wlad Ermisch</strong>.
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
                    <Button variant="outlined" size="small" startIcon={<OpenInNewIcon />} onClick={() => { window.open('https://github.com/wladermisch/Uptime-Sentry', '_blank'); }}>
                      Source on GitHub
                    </Button>
                    <Button variant="outlined" size="small" startIcon={<OpenInNewIcon />} onClick={() => { window.open('https://ko-fi.com/wladermisch', '_blank'); }}>
                      Support on Ko-fi
                    </Button>
                  </Stack>
                </Box>
              </Stack>
            )}

            {activeStep === 1 && (
              <Stack spacing={3}>
                <Typography id="onboarding-title" component="h1" sx={{ fontSize: 30, fontWeight: 800, fontStretch: '72%', lineHeight: 1.1 }}>
                  Where things are
                </Typography>
                <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, columnGap: 3, rowGap: 2.5 }}>
                  {TOUR.map((item) => (
                    <Box component="li" key={item.title} sx={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: 2, alignItems: 'start' }}>
                      <Box sx={{ width: 40, height: 40, borderRadius: 1.5, display: 'grid', placeItems: 'center', backgroundColor: 'text.primary', color: 'background.paper', '& svg': { fontSize: 22 } }}>
                        {item.icon}
                      </Box>
                      <Box>
                        <Typography sx={{ fontWeight: 700 }}>{item.title}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>{item.text}</Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Stack>
            )}

            {activeStep === 2 && (
              <Stack spacing={3}>
                <Typography id="onboarding-title" component="h1" sx={{ fontSize: 30, fontWeight: 800, fontStretch: '72%', lineHeight: 1.1 }}>
                  Preferences
                </Typography>
                <FormControlLabel
                  control={<Checkbox checked={startWithWindows} onChange={(e) => { setStartWithWindows(e.target.checked); }} />}
                  label="Start Uptime Sentry when Windows starts"
                  sx={{ ml: -1 }}
                />
                <TextField
                  label="Check every (seconds)"
                  type="number"
                  size="small"
                  value={checkInterval}
                  onChange={(e) => { setCheckInterval(Math.max(5, Number(e.target.value) || 60)); }}
                  helperText="How often each target is checked. You can change it per profile later."
                  sx={{ maxWidth: 280 }}
                  slotProps={{ htmlInput: { min: 5 } }}
                />
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                  <TextField select label="Sound when a target recovers" size="small" fullWidth value={defaultUpSound} onChange={(e) => { setDefaultUpSound(e.target.value); }}>
                    <MenuItem value="Up-Default.wav">Up-Default.wav</MenuItem>
                    <MenuItem value="Up2.wav">Up2.wav</MenuItem>
                    <MenuItem value="no-sound">No sound</MenuItem>
                  </TextField>
                  <TextField select label="Sound when a target goes down" size="small" fullWidth value={defaultDownSound} onChange={(e) => { setDefaultDownSound(e.target.value); }}>
                    <MenuItem value="Down-Default.wav">Down-Default.wav</MenuItem>
                    <MenuItem value="Critical-Alert.wav">Critical-Alert.wav</MenuItem>
                    <MenuItem value="no-sound">No sound</MenuItem>
                  </TextField>
                </Box>
              </Stack>
            )}

            {activeStep === 3 && (
              <Stack spacing={2.5}>
                <Typography id="onboarding-title" component="h1" sx={{ fontSize: 30, fontWeight: 800, fontStretch: '72%', lineHeight: 1.1 }}>
                  Add your first target
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Optional. Leave the host empty to skip; you can add targets any time on the Targets screen.
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 200px' }, gap: 2 }}>
                  <TextField label="Name" size="small" fullWidth placeholder="e.g. Home NAS" value={targetName} onChange={(e) => { setTargetName(e.target.value); }} />
                  <TextField select label="Check type" size="small" fullWidth value={targetType} onChange={(e) => { setTargetType(e.target.value); }}>
                    {Object.entries(CHECK_TYPES).map(([v, t]) => <MenuItem key={v} value={v}>{t.label}</MenuItem>)}
                  </TextField>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: targetType === 'TCP' || targetType === 'SSL' ? { xs: '1fr', sm: '1fr 140px' } : '1fr', gap: 2 }}>
                  <TextField
                    label={CHECK_TYPES[targetType].host}
                    size="small"
                    fullWidth
                    placeholder={CHECK_TYPES[targetType].placeholder}
                    value={targetHost}
                    onChange={(e) => { setTargetHost(e.target.value); }}
                  />
                  {(targetType === 'TCP' || targetType === 'SSL') && (
                    <TextField
                      label="Port"
                      type="number"
                      size="small"
                      placeholder={targetType === 'SSL' ? '443' : 'e.g. 22'}
                      value={targetPort}
                      onChange={(e) => { setTargetPort(e.target.value === '' ? '' : Number(e.target.value)); }}
                    />
                  )}
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Alerts by email or webhook, maintenance windows and the status page are set up later in Settings and on the Maintenance screen.
                </Typography>
              </Stack>
            )}
          </Box>
        </Box>

        {/* Navigation */}
        <Stack direction="row" sx={{ width: '100%', maxWidth: 760, mx: 'auto', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button variant="text" onClick={handleBack} startIcon={<ArrowBackIcon />} sx={{ visibility: activeStep === 0 ? 'hidden' : 'visible' }}>
            Back
          </Button>
          <Button variant="contained" onClick={handleNext} endIcon={last ? undefined : <ArrowForwardIcon />} sx={{ px: 3 }}>
            {last ? (targetHost.trim() ? 'Add target and start' : 'Start monitoring') : 'Continue'}
          </Button>
        </Stack>
      </Box>
    </Dialog>
  );
}
