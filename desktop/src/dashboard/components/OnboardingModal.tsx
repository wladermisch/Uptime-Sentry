import * as React from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SpeedIcon from '@mui/icons-material/Speed';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

const STEPS = ['Welcome', 'Feature Tour', 'Initial Settings', 'First Target Setup'];

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
}

export default function OnboardingModal({ open, onClose }: OnboardingModalProps) {
  const [activeStep, setActiveStep] = React.useState(0);

  // Settings State
  const [startWithWindows, setStartWithWindows] = React.useState(true);
  const [defaultUpSound, setDefaultUpSound] = React.useState('Up-Default.wav');
  const [defaultDownSound, setDefaultDownSound] = React.useState('Down-Default.wav');
  const [checkInterval, setCheckInterval] = React.useState(60);
  const [logRetentionDays, setLogRetentionDays] = React.useState(90);

  // First Target State
  const [targetName, setTargetName] = React.useState('Google DNS');
  const [targetType, setTargetType] = React.useState('PING');
  const [targetHost, setTargetHost] = React.useState('8.8.8.8');
  const [targetTimeout] = React.useState(5);

  const handleFinish = React.useCallback(() => {
    // Save settings
    const settings = {
      startWithWindows,
      defaultUpSound,
      defaultDownSound,
      logRetentionDays,
      defaultCheckInterval: checkInterval,
    };
    localStorage.setItem('uptime_sentry_settings', JSON.stringify(settings));

    // Save initial target if host is provided
    if (targetHost.trim()) {
      try {
        const activeId = localStorage.getItem('uptime_sentry_active_id') || 'p_default';
        const initialTarget = {
          id: Date.now(),
          profileId: activeId,
          name: targetName || 'First Target',
          type: targetType,
          host: targetHost,
          timeout: targetTimeout,
          recoveryAction: '',
          acceptableStatusCodes: [200, 201],
          consecutiveFailuresLimit: 2,
          profileName: 'Default Profile',
          upSound: 'default-profile',
          downSound: 'default-profile',
        };
        const existing = JSON.parse(localStorage.getItem('uptime_sentry_targets') || '[]');
        localStorage.setItem('uptime_sentry_targets', JSON.stringify([...existing, initialTarget]));
      } catch (e) {
        console.error('Failed to create initial target', e);
      }
    }

    localStorage.setItem('uptime_sentry_onboarded', 'true');
    onClose();
  }, [startWithWindows, defaultUpSound, defaultDownSound, logRetentionDays, checkInterval, targetHost, targetName, targetType, targetTimeout, onClose]);

  const handleNext = () => {
    if (activeStep === STEPS.length - 1) {
      handleFinish();
    } else {
      setActiveStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setActiveStep((prev) => Math.max(0, prev - 1));
  };

  return (
    <Dialog
      open={open}
      fullScreen
      slotProps={{
        paper: {
          sx: {
            bgcolor: '#0a0d14',
            color: '#fff',
          }
        }
      }}
    >
      <DialogContent sx={{ p: { xs: 3, md: 6 }, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '100vh' }}>
        {/* Top Header */}
        <Box sx={{ maxWidth: 900, mx: 'auto', width: '100%', mb: 4 }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'primary.main', letterSpacing: 0.5 }}>
              UPTIME SENTRY
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'medium' }}>
              STEP {activeStep + 1} OF {STEPS.length}
            </Typography>
          </Stack>

          <Stepper activeStep={activeStep} alternativeLabel>
            {STEPS.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        {/* Step Content Card */}
        <Box sx={{ maxWidth: 900, mx: 'auto', width: '100%', flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {activeStep === 0 && (
            <Card variant="outlined" sx={{ bgcolor: 'background.paper', p: { xs: 2, md: 4 } }}>
              <CardContent sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <Box sx={{ p: 2, bgcolor: 'rgba(41, 182, 246, 0.1)', borderRadius: '50%', color: 'primary.main' }}>
                  <SpeedIcon sx={{ fontSize: 56 }} />
                </Box>
                <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                  Welcome to UptimeSentry
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 650, lineHeight: 1.6 }}>
                  High-performance, open-source desktop monitoring control center. Track endpoint availability, response latency, and run automatic recovery commands with zero cloud server dependencies.
                </Typography>

                <Divider sx={{ width: '100%', my: 2 }} />

                <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2, width: '100%', maxWidth: 550 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                    Open Source & Developer Credits
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Created & Developed by <strong>Wlad Ermisch</strong>
                  </Typography>
                  <Stack direction="row" spacing={2} sx={{ justifyContent: 'center', flexWrap: 'wrap', gap: 1 }}>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<OpenInNewIcon />}
                      onClick={() => { window.open('https://github.com/wladermisch', '_blank'); }}
                    >
                      GitHub (@wladermisch)
                    </Button>
                    <Button
                      variant="contained"
                      color="secondary"
                      size="small"
                      startIcon={<OpenInNewIcon />}
                      onClick={() => { window.open('https://ko-fi.com/wladermisch', '_blank'); }}
                    >
                      Support on Ko-fi
                    </Button>
                  </Stack>
                </Box>
              </CardContent>
            </Card>
          )}

          {activeStep === 1 && (
            <Card variant="outlined" sx={{ bgcolor: 'background.paper', p: { xs: 2, md: 4 } }}>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Typography variant="h5" sx={{ fontWeight: 'bold', textAlign: 'center' }}>
                  Feature Walkthrough & Navigation Guide
                </Typography>

                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, height: '100%' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: 'primary.main', mb: 0.5 }}>
                        📊 Home Dashboard
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Live real-time latency graphs, active target statuses, availability dots, and recent incident logs.
                      </Typography>
                    </Box>
                  </Grid>

                  <Grid size={{ xs: 12, md: 6 }}>
                    <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, height: '100%' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: 'primary.main', mb: 0.5 }}>
                        🎯 Targets & Profiles
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Configure HTTP URLs & PING targets, setup keyword matching rules, sound alerts, and recovery scripts.
                      </Typography>
                    </Box>
                  </Grid>

                  <Grid size={{ xs: 12, md: 6 }}>
                    <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, height: '100%' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: 'primary.main', mb: 0.5 }}>
                        📈 Analytics SLA Suite
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Deep incident post-mortems, response breakdown, SLA tier metrics, and lifecycle audit timelines.
                      </Typography>
                    </Box>
                  </Grid>

                  <Grid size={{ xs: 12, md: 6 }}>
                    <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, height: '100%' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: 'primary.main', mb: 0.5 }}>
                        📄 SLA Reports Generator
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Export formatted Markdown (.md), Plain Text (.txt), and PDF reports directly to your computer.
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          )}

          {activeStep === 2 && (
            <Card variant="outlined" sx={{ bgcolor: 'background.paper', p: { xs: 2, md: 4 } }}>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                  Initial Application Preferences
                </Typography>

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={startWithWindows}
                      onChange={(e) => { setStartWithWindows(e.target.checked); }}
                      color="primary"
                    />
                  }
                  label="Start UptimeSentry automatically when Windows starts"
                />

                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      label="Default Check Interval (seconds)"
                      type="number"
                      size="small"
                      fullWidth
                      value={checkInterval}
                      onChange={(e) => { setCheckInterval(Number(e.target.value)); }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      label="Log Retention Limits (days)"
                      type="number"
                      size="small"
                      fullWidth
                      value={logRetentionDays}
                      onChange={(e) => { setLogRetentionDays(Number(e.target.value)); }}
                    />
                  </Grid>
                </Grid>

                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      select
                      label="Default Up Sound (Recovery)"
                      size="small"
                      fullWidth
                      value={defaultUpSound}
                      onChange={(e) => { setDefaultUpSound(e.target.value); }}
                    >
                      <MenuItem value="Up-Default.wav">Up-Default.wav</MenuItem>
                      <MenuItem value="Up2.wav">Up2.wav</MenuItem>
                      <MenuItem value="no-sound">No Sound (Muted)</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      select
                      label="Default Down Sound (Outage)"
                      size="small"
                      fullWidth
                      value={defaultDownSound}
                      onChange={(e) => { setDefaultDownSound(e.target.value); }}
                    >
                      <MenuItem value="Down-Default.wav">Down-Default.wav</MenuItem>
                      <MenuItem value="Critical-Alert.wav">Critical-Alert.wav</MenuItem>
                      <MenuItem value="no-sound">No Sound (Muted)</MenuItem>
                    </TextField>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          )}

          {activeStep === 3 && (
            <Card variant="outlined" sx={{ bgcolor: 'background.paper', p: { xs: 2, md: 4 } }}>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                  Create Your First Monitored Target
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Add an endpoint or IP address to begin immediate background monitoring.
                </Typography>

                <TextField
                  label="Target Name"
                  size="small"
                  fullWidth
                  value={targetName}
                  onChange={(e) => { setTargetName(e.target.value); }}
                />

                <TextField
                  select
                  label="Target Type"
                  size="small"
                  fullWidth
                  value={targetType}
                  onChange={(e) => { setTargetType(e.target.value); }}
                >
                  <MenuItem value="PING">PING (ICMP Protocol)</MenuItem>
                  <MenuItem value="HTTP">HTTP(S) Web Service</MenuItem>
                </TextField>

                <TextField
                  label={targetType === 'HTTP' ? 'URL (e.g. https://google.com)' : 'IP Address or Host (e.g. 8.8.8.8)'}
                  size="small"
                  fullWidth
                  value={targetHost}
                  onChange={(e) => { setTargetHost(e.target.value); }}
                />
              </CardContent>
            </Card>
          )}
        </Box>

        {/* Bottom Actions Footer */}
        <Box sx={{ maxWidth: 900, mx: 'auto', width: '100%', mt: 4 }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Button
              disabled={activeStep === 0}
              onClick={handleBack}
              startIcon={<ArrowBackIcon />}
              sx={{ color: 'text.secondary' }}
            >
              Back
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={handleNext}
              endIcon={activeStep === STEPS.length - 1 ? <CheckCircleIcon /> : <ArrowForwardIcon />}
              sx={{ px: 4, py: 1, fontWeight: 'bold' }}
            >
              {activeStep === STEPS.length - 1 ? 'Finish & Launch UptimeSentry' : 'Continue'}
            </Button>
          </Stack>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
