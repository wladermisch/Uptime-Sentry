import * as React from 'react';
import type {} from '@mui/x-date-pickers/themeAugmentation';
import type {} from '@mui/x-charts/themeAugmentation';
import type {} from '@mui/x-data-grid/themeAugmentation';
import type {} from '@mui/x-tree-view/themeAugmentation';
import { alpha } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';

// Icons
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import BugReportIcon from '@mui/icons-material/BugReport';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AppSettingsAltIcon from '@mui/icons-material/AppSettingsAlt';
import InfoIcon from '@mui/icons-material/Info';

// Views
import AppNavbar from './components/AppNavbar';
import Header from './components/Header';
import MainGrid from './components/MainGrid';
import SideMenu from './components/SideMenu';
import ProfilesTab from './components/ProfilesTab';
import TargetsTab from './components/TargetsTab';
import SettingsTab from './components/SettingsTab';
import AnalyticsTab from './components/AnalyticsTab';
import ReportsTab from './components/ReportsTab';

// ── Interfaces ───────────────────────────────────────────────────────────────

interface Profile {
  id: string;
  name: string;
  defaultTimeout: number;
  checkInterval: number;
  consecutiveFailuresLimit: number;
  backgroundRunning: boolean;
}

interface Target {
  id?: number;
  profileId: string;
  name: string;
  type: string;
  host: string;
  timeout: number;
  recoveryAction: string;
  acceptableStatusCodes: number[];
  consecutiveFailuresLimit: number;
  profileName: string;
}

// ── NotionGate-Style About Page ──────────────────────────────────────────────

function AboutPlaceholder() {
  const [schedulerRunning, setSchedulerRunning] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [checking, setChecking] = React.useState(false);
  const [updateStatus, setUpdateStatus] = React.useState<string | null>(null);
  const [showUpdateButton, setShowUpdateButton] = React.useState(false);
  const [latestReleaseUrl, setLatestReleaseUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch('http://127.0.0.1:8765/api/autocheck/status')
      .then(r => r.json())
      .then(data => {
        setSchedulerRunning(data.running);
        setLoading(false);
      })
      .catch(() => { setLoading(false); });
  }, []);

  const parseVersion = (v: string): number[] => {
    return v.replace(/^v/i, '').split('.').map(Number);
  };

  const isNewerVersion = (latest: string, current: string): boolean => {
    const l = parseVersion(latest);
    const c = parseVersion(current);
    for (let i = 0; i < Math.max(l.length, c.length); i++) {
      const lNum = i < l.length ? l[i] : 0;
      const cNum = i < c.length ? c[i] : 0;
      if (lNum > cNum) return true;
      if (lNum < cNum) return false;
    }
    return false;
  };

  const handleCheckUpdates = async () => {
    setChecking(true);
    setUpdateStatus(null);
    setShowUpdateButton(false);
    setLatestReleaseUrl(null);
    try {
      const res = await fetch('https://api.github.com/repos/wladermisch/Uptime-Sentry/releases/latest');
      if (res.ok) {
        const data = await res.json();
        const latestTag = data.tag_name;
        
        if (isNewerVersion(latestTag, 'v0.3.1')) {
          setUpdateStatus(`A new version (${latestTag}) is available!`);
          setShowUpdateButton(true);
          const exeAsset = data.assets?.find((asset: { name: string; browser_download_url: string }) => asset.name.endsWith('.exe'));
          if (exeAsset) {
            setLatestReleaseUrl(exeAsset.browser_download_url);
          } else {
            setLatestReleaseUrl(data.html_url);
          }
        } else {
          setUpdateStatus('You are running the latest version (v0.3.1).');
        }
      } else {
        setUpdateStatus('No release tags found. Checked: https://github.com/wladermisch/Uptime-Sentry/releases');
      }
    } catch {
      setUpdateStatus('GitHub API call failed. Look up: https://github.com/wladermisch/Uptime-Sentry/releases');
    } finally {
      setChecking(false);
    }
  };

  const handleUpdateApp = () => {
    if (latestReleaseUrl) {
      window.open(latestReleaseUrl, '_blank');
    } else {
      window.open('https://github.com/wladermisch/Uptime-Sentry/releases', '_blank');
    }
  };

  return (
    <Box sx={{ width: '100%', maxWidth: { sm: '100%', md: '1700px' }, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Brand Header */}
      <Card variant="outlined" sx={{ bgcolor: 'background.paper' }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 3, px: 3 }}>
          <Stack direction="row" spacing={3} sx={{ alignItems: 'center' }}>
            <Box sx={{ display: 'flex', height: 64, width: 64, alignItems: 'center', justifyContent: 'center', borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'action.hover' }}>
              <InfoIcon sx={{ fontSize: 36, color: 'primary.main' }} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 'bold' }}>Uptime Sentry</Typography>
              <Typography variant="body2" color="text.secondary">
                Desktop control center for target checks, notification relays, and local recovery hooks.
              </Typography>
            </Box>
          </Stack>
          {showUpdateButton && (
            <Button
              variant="contained"
              color="primary"
              onClick={handleUpdateApp}
              sx={{ fontWeight: 'bold' }}
            >
              Update
            </Button>
          )}
        </CardContent>
      </Card>

      {/* About Grid */}
      <Grid container spacing={2} columns={12}>
        {/* System info */}
        <Grid size={{ xs: 12, sm: 6 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 'bold' }}>
                <AppSettingsAltIcon fontSize="small" /> System Info
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Typography variant="body2">OS: Windows Desktop</Typography>
              <Typography variant="body2" color="text.secondary">Running mode: Local Process Managed</Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Version info */}
        <Grid size={{ xs: 12, sm: 6 }}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 'bold' }}>
                <InfoIcon fontSize="small" /> Version Info
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Typography variant="body2">Desktop App: v0.3.1</Typography>
              <Typography variant="body2">Java Backend: v0.3.1 (Javalin Server)</Typography>
              <Box sx={{ mt: 1.5 }}>
                <Button size="small" variant="outlined" onClick={handleCheckUpdates} disabled={checking}>
                  {checking ? 'Checking...' : 'Check for Updates'}
                </Button>
              </Box>
              {updateStatus && (
                <Typography variant="caption" sx={{ mt: 1, display: 'block', color: 'text.secondary' }}>
                  {updateStatus}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Services Status */}
        <Grid size={{ xs: 12 }}>
          <Card variant="outlined">
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 'bold' }}>
                Service Status Check
              </Typography>
              <Divider />
              <Stack spacing={1}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">REST API Server:</Typography>
                  <Chip label="ONLINE" color="success" size="small" variant="outlined" />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">Check Scheduler Service:</Typography>
                  {loading ? (
                    <CircularProgress size={16} />
                  ) : (
                    <Chip 
                      label={schedulerRunning ? 'ACTIVE' : 'INACTIVE'} 
                      color={schedulerRunning ? 'success' : 'warning'} 
                      size="small" 
                      variant="outlined" 
                    />
                  )}
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Developer & Credits */}
        <Grid size={{ xs: 12 }}>
          <Card variant="outlined">
            <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 'bold' }}>
                Developer & Open-Source Credits
              </Typography>
              <Divider />
              <Typography variant="body1">
                Made with ❤️ by <strong>Wlad Ermisch</strong>
              </Typography>
              <Stack direction="row" spacing={2} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<OpenInNewIcon />}
                  onClick={() => window.open('https://github.com/wladermisch', '_blank')}
                >
                  GitHub (@wladermisch)
                </Button>
                <Button
                  variant="contained"
                  color="secondary"
                  size="small"
                  startIcon={<OpenInNewIcon />}
                  onClick={() => window.open('https://ko-fi.com/wladermisch', '_blank')}
                >
                  Support on Ko-fi
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

// ── NotionGate-Style Feedback & Live Log Reader ─────────────────────────────

function FeedbackPlaceholder() {
  const [logLines, setLogLines] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchLogs = React.useCallback(async () => {
    try {
      const r = await fetch('http://127.0.0.1:8765/api/logs');
      if (r.ok) {
        setLogLines(await r.json());
      }
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const handleCopy = () => {
    const text = logLines.join('\n');
    void navigator.clipboard.writeText(text);
  };

  return (
    <Box sx={{ width: '100%', maxWidth: { sm: '100%', md: '1700px' }, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Header Info */}
      <Card variant="outlined">
        <CardContent>
          <Typography variant="overline" color="text.secondary">Bug Report</Typography>
          <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 1 }}>Report Bug & Feedback</Typography>
          <Typography variant="body2" color="text.secondary">
            Recent backend execution logs and runtime warnings are shown below. You can quickly copy the logs and open our GitHub issues page to file a bug report.
          </Typography>
        </CardContent>
      </Card>

      {/* Terminal logs card */}
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>Error & Event Logs</Typography>
            <Stack direction="row" spacing={1.5}>
              <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={fetchLogs}>
                Refresh
              </Button>
              <Button size="small" variant="outlined" startIcon={<ContentCopyIcon />} onClick={handleCopy} disabled={logLines.length === 0}>
                Copy logs
              </Button>
              <Button 
                size="small" 
                variant="contained" 
                startIcon={<BugReportIcon />} 
                href="https://github.com/wlxd/UptimeSentry/issues"
                target="_blank"
                rel="noreferrer"
              >
                Open GitHub Issues
              </Button>
            </Stack>
          </Stack>

          {/* Code box */}
          <Box sx={{ bgcolor: 'black', borderRadius: 1.5, p: 2, maxHeight: 400, overflow: 'auto', border: '1px solid', borderColor: 'divider' }}>
            {loading ? (
              <Typography variant="caption" sx={{ color: 'grey.500', fontFamily: 'monospace' }}>Loading log lines...</Typography>
            ) : logLines.length > 0 ? (
              logLines.map((line, idx) => (
                <Box key={idx} sx={{ display: 'grid', gridTemplateColumns: '3rem 1fr', gap: 2, borderBottom: '1px solid rgba(255,255,255,0.05)', py: 0.5 }}>
                  <Typography variant="caption" sx={{ color: 'grey.700', textAlign: 'right', fontFamily: 'monospace', userSelect: 'none' }}>
                    {String(idx + 1).padStart(3, '0')}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'grey.300', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {line}
                  </Typography>
                </Box>
              ))
            ) : (
              <Typography variant="caption" sx={{ color: 'grey.500', fontFamily: 'monospace' }}>No execution log entries recorded yet.</Typography>
            )}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

// ── Dashboard Component ───────────────────────────────────────────────────────

import OnboardingModal from './components/OnboardingModal';

export default function Dashboard(props: { disableCustomTheme?: boolean }) {
  const [activeTab, setActiveTab] = React.useState('home');
  const [showOnboarding, setShowOnboarding] = React.useState(false);

  React.useEffect(() => {
    const onboarded = localStorage.getItem('uptime_sentry_onboarded');
    if (!onboarded) {
      setShowOnboarding(true);
    }
  }, []);

  const seedDefaults = React.useCallback(() => {
    // 1. Seed Profiles if empty
    if (!localStorage.getItem('uptime_sentry_profiles')) {
      const defaultProfiles: Profile[] = [
        { id: '1', name: 'Standard Profile', defaultTimeout: 5, checkInterval: 60, consecutiveFailuresLimit: 2, backgroundRunning: false },
        { id: '2', name: 'Dev Profile', defaultTimeout: 3, checkInterval: 30, consecutiveFailuresLimit: 1, backgroundRunning: false }
      ];
      localStorage.setItem('uptime_sentry_profiles', JSON.stringify(defaultProfiles));
      localStorage.setItem('uptime_sentry_active_id', '1');
    }

    // 2. Seed Targets if empty
    if (!localStorage.getItem('uptime_sentry_targets')) {
      const defaultTargets: Target[] = [
        { id: 1, profileId: '1', name: 'Google DNS', type: 'PING', host: '8.8.8.8', timeout: 5, recoveryAction: '', acceptableStatusCodes: [], consecutiveFailuresLimit: 2, profileName: 'Standard Profile' },
        { id: 2, profileId: '1', name: 'GitHub Portal', type: 'HTTP', host: 'https://github.com', timeout: 5, recoveryAction: '', acceptableStatusCodes: [200], consecutiveFailuresLimit: 2, profileName: 'Standard Profile' },
        { id: 3, profileId: '2', name: 'Local API Service', type: 'HTTP', host: 'http://localhost:8765/api/targets', timeout: 3, recoveryAction: '', acceptableStatusCodes: [200], consecutiveFailuresLimit: 1, profileName: 'Dev Profile' }
      ];
      localStorage.setItem('uptime_sentry_targets', JSON.stringify(defaultTargets));
    }
  }, []);

  const syncTargetsToBackend = React.useCallback(async (allTargets: Target[], allProfiles: Profile[], activeId: string) => {
    const activeTargets = allTargets.filter(
      (t) => t.profileId === activeId || allProfiles.find((p) => p.id === t.profileId)?.backgroundRunning
    );

    try {
      await fetch('http://127.0.0.1:8765/api/targets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          activeTargets.map((t, idx) => ({
            id: t.id || idx + 1,
            name: t.name,
            type: t.type,
            host: t.host,
            timeout: t.timeout,
            recoveryAction: t.recoveryAction,
            acceptableStatusCodes: t.acceptableStatusCodes,
            consecutiveFailuresLimit: t.consecutiveFailuresLimit,
            profileName: t.profileName
          }))
        ),
      });
    } catch (e) {
      console.error('Failed to sync targets to Java backend:', e);
    }
  }, []);

  const triggerSync = React.useCallback(() => {
    const storedProfiles = localStorage.getItem('uptime_sentry_profiles');
    const storedTargets = localStorage.getItem('uptime_sentry_targets');
    const activeId = localStorage.getItem('uptime_sentry_active_id');
    if (storedProfiles && storedTargets && activeId) {
      void syncTargetsToBackend(JSON.parse(storedTargets), JSON.parse(storedProfiles), activeId);
    }
  }, [syncTargetsToBackend]);

  React.useEffect(() => {
    seedDefaults();
    triggerSync();

    const handleTab = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) setActiveTab(detail);
    };

    const handleProfile = () => {
      triggerSync();
    };

    window.addEventListener('nav-tab', handleTab);
    window.addEventListener('profile-changed', handleProfile);
    window.addEventListener('profiles-updated', handleProfile);
    return () => {
      window.removeEventListener('nav-tab', handleTab);
      window.removeEventListener('profile-changed', handleProfile);
      window.removeEventListener('profiles-updated', handleProfile);
    };
  }, [seedDefaults, triggerSync]);

  const renderContent = () => {
    switch (activeTab) {
      case 'profiles':  return <ProfilesTab />;
      case 'targets':   return <TargetsTab />;
      case 'analytics': return <AnalyticsTab />;
      case 'reports':   return <ReportsTab />;
      case 'settings':  return <SettingsTab />;
      case 'about':     return <AboutPlaceholder />;
      case 'feedback':  return <FeedbackPlaceholder />;
      case 'home':
      default:          return <MainGrid />;
    }
  };

  return (
    <>
      <CssBaseline enableColorScheme />
      <Box sx={{ display: 'flex' }}>
        <SideMenu />
        <AppNavbar />
        {/* Main content */}
        <Box
          component="main"
          sx={(theme) => ({
            flexGrow: 1,
            backgroundColor: theme.vars
              ? `rgba(${theme.vars.palette.background.defaultChannel} / 1)`
              : alpha(theme.palette.background.default, 1),
            overflow: 'auto',
          })}
        >
          <Stack
            spacing={2}
            sx={{
              alignItems: 'center',
              mx: 3,
              pb: 5,
              mt: { xs: 8, md: 0 },
            }}
          >
            <Header />
            {renderContent()}
          </Stack>
        </Box>
      </Box>
      <OnboardingModal open={showOnboarding} onClose={() => { setShowOnboarding(false); }} />
    </>
  );
}
