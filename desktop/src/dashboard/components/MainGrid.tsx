import * as React from 'react';
import Grid from '@mui/material/Grid';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import { LineChart } from '@mui/x-charts/LineChart';

import CustomizedDataGrid from './CustomizedDataGrid';
import LatestIncident from './LatestIncident';
import UptimeDots from './UptimeDots';

interface Profile {
  id: string;
  name: string;
  defaultTimeout: number;
  checkInterval: number;
  consecutiveFailuresLimit: number;
  backgroundRunning: boolean;
}

interface Target {
  id: number;
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

interface CheckResult {
  targetId: number;
  targetName: string;
  timestamp: string;
  success: boolean;
  durationMillis: number;
  message: string;
}

export default function MainGrid() {
  const [activeProfile, setActiveProfile] = React.useState<Profile | null>(null);
  const [profileTargets, setProfileTargets] = React.useState<Target[]>([]);
  const [history, setHistory] = React.useState<CheckResult[]>([]);
  const [selectedTargetId, setSelectedTargetId] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  const loadData = React.useCallback(async () => {
    try {
      const activeId = localStorage.getItem('uptime_sentry_active_id');
      const storedProfiles = localStorage.getItem('uptime_sentry_profiles');
      const storedTargets = localStorage.getItem('uptime_sentry_targets');

      if (storedProfiles && activeId) {
        const list = JSON.parse(storedProfiles) as Profile[];
        const found = list.find((p) => p.id === activeId) || null;
        setActiveProfile(found);
      }

      if (storedTargets && activeId) {
        const list = JSON.parse(storedTargets) as Target[];
        setProfileTargets(list.filter((t) => t.profileId === activeId));
      }

      // Fetch history
      const r = await fetch('http://127.0.0.1:8765/api/history');
      if (r.ok) {
        setHistory(await r.json());
      }
    } catch (e) {
      console.error('Failed to load dashboard statistics:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    
    const handleProfile = () => loadData();
    const handleSearch = (e: Event) => {
      setSearchQuery((e as CustomEvent).detail || '');
    };

    window.addEventListener('profile-changed', handleProfile);
    window.addEventListener('profiles-updated', handleProfile);
    window.addEventListener('search-query', handleSearch);

    return () => {
      clearInterval(interval);
      window.removeEventListener('profile-changed', handleProfile);
      window.removeEventListener('profiles-updated', handleProfile);
      window.removeEventListener('search-query', handleSearch);
    };
  }, [loadData]);

  // Compute profile status (UP, DEGRADED, DOWN)
  const getProfileStatus = () => {
    if (profileTargets.length === 0) return { label: 'NO TARGETS', color: 'default' as const };
    
    let onlineCount = 0;
    let offlineCount = 0;

    profileTargets.forEach((t) => {
      const targetChecks = history.filter((h) => h.targetId === t.id);
      if (targetChecks.length > 0) {
        const latest = targetChecks.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
        if (latest.success) {
          onlineCount++;
        } else {
          offlineCount++;
        }
      } else {
        onlineCount++;
      }
    });

    if (offlineCount === 0) {
      return { label: 'UP (HEALTHY)', color: 'success' as const };
    } else if (onlineCount === 0) {
      return { label: 'DOWN (CRITICAL)', color: 'error' as const };
    } else {
      return { label: 'DEGRADED', color: 'warning' as const };
    }
  };

  // Filter history based on active profile, selected target, and search query
  const getFilteredHistory = () => {
    let result = history;

    // Filter by target selection
    if (selectedTargetId !== 'all') {
      result = result.filter((h) => h.targetId === Number(selectedTargetId));
    } else {
      const targetIds = profileTargets.map((t) => t.id);
      result = result.filter((h) => targetIds.includes(h.targetId));
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (h) =>
          h.targetName.toLowerCase().includes(q) ||
          h.message.toLowerCase().includes(q) ||
          h.timestamp.toLowerCase().includes(q)
      );
    }

    return result;
  };

  const filteredHistory = getFilteredHistory();
  const profileStatus = getProfileStatus();

  const prepareChartData = () => {
    if (!history || history.length === 0) {
      return {
        chartXAxis: ['00:00:00', '00:00:01', '00:00:02', '00:00:03', '00:00:04'],
        latencyData: [0, 0, 0, 0, 0],
      };
    }

    if (selectedTargetId !== 'all') {
      const latestChecks = filteredHistory
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        .slice(-12);
      return {
        chartXAxis: latestChecks.map((c) => c.timestamp.split(' ')[1] || c.timestamp),
        latencyData: latestChecks.map((c) => Math.max(0, c.durationMillis)),
      };
    } else {
      // Calculate true mathematical average latency across all targets per check cycle
      const groups: Record<string, number[]> = {};
      filteredHistory.forEach((c) => {
        const timeKey = c.timestamp.split(' ')[1] || c.timestamp;
        if (!groups[timeKey]) groups[timeKey] = [];
        groups[timeKey].push(Math.max(0, c.durationMillis));
      });

      const sortedTimes = Object.keys(groups).sort().slice(-12);
      const averages = sortedTimes.map((timeKey) => {
        const vals = groups[timeKey];
        const sum = vals.reduce((a, b) => a + b, 0);
        return Math.round(sum / (vals.length || 1));
      });

      return {
        chartXAxis: sortedTimes.length > 0 ? sortedTimes : ['00:00:00'],
        latencyData: averages.length > 0 ? averages : [0],
      };
    }
  };

  const { chartXAxis, latencyData } = prepareChartData();
  const hasData = filteredHistory.length > 0;
  const lastCheck = filteredHistory.length > 0 ? filteredHistory[filteredHistory.length - 1] : null;
  const lastUpdatedTime = lastCheck ? (lastCheck.timestamp.split(' ')[1] || lastCheck.timestamp) : new Date().toLocaleTimeString();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px', width: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', maxWidth: { sm: '100%', md: '1700px' } }}>
      {/* Overview */}
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
        <Typography component="h2" variant="h6">
          Overview: {activeProfile?.name || 'No Profile'}
        </Typography>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Filter:
          </Typography>
          <TextField
            select
            size="small"
            value={selectedTargetId}
            onChange={(e) => setSelectedTargetId(e.target.value)}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="all">Average (All Targets)</MenuItem>
            {profileTargets.map((t) => (
              <MenuItem key={t.id} value={t.id.toString()}>
                {t.name}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Stack>

      <Grid container spacing={2} columns={12} sx={{ mb: 2 }}>
        {/* Status Card */}
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card
            variant="outlined"
            sx={{
              height: '100%',
              bgcolor: () => {
                const colorVal = profileStatus.color;
                if (colorVal === 'success') return 'rgba(76, 175, 80, 0.12)';
                if (colorVal === 'warning') return 'rgba(255, 152, 0, 0.12)';
                if (colorVal === 'error') return 'rgba(244, 67, 54, 0.12)';
                return 'background.paper';
              },
              borderColor: () => {
                const colorVal = profileStatus.color;
                if (colorVal === 'success') return 'success.light';
                if (colorVal === 'warning') return 'warning.light';
                if (colorVal === 'error') return 'error.light';
                return 'divider';
              },
              transition: 'background-color 0.3s ease, border-color 0.3s ease'
            }}
          >
            <CardContent sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', gap: 1.5 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 'bold' }}>
                Current Status
              </Typography>
              <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justify: 'center',
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    bgcolor: profileStatus.color === 'success' ? '#4caf50' : profileStatus.color === 'warning' ? '#ff9800' : '#f44336',
                    color: '#fff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  }}
                >
                  {profileStatus.color === 'success' ? (
                    <span style={{ fontSize: 28, fontWeight: 'bold' }}>✓</span>
                  ) : profileStatus.color === 'warning' ? (
                    <span style={{ fontSize: 28, fontWeight: 'bold' }}>!</span>
                  ) : (
                    <span style={{ fontSize: 28, fontWeight: 'bold' }}>✕</span>
                  )}
                </Box>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 'bold', lineHeight: 1.1 }}>
                    {profileStatus.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Last updated at {lastUpdatedTime}
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Latency Graph */}
        <Grid size={{ xs: 12, sm: 8 }}>
          <Card variant="outlined" sx={{ opacity: hasData ? 1 : 0.4 }}>
            <CardContent sx={{ pb: '12px !important' }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Response Latency (ms) {!hasData && '(Empty Grid State)'}
              </Typography>
              <LineChart
                colors={['#29b6f6']}
                xAxis={[{
                  scaleType: 'point',
                  data: chartXAxis,
                  disableLine: true,
                  disableTicks: true,
                }]}
                yAxis={[{
                  min: 0,
                  disableLine: true,
                  disableTicks: false,
                }]}
                series={[{
                  data: latencyData,
                  area: true,
                  curve: 'natural',
                }]}
                height={220}
                margin={{ top: 10, right: 15, left: 40, bottom: 25 }}
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Availability History Dots Grid */}
        <Grid size={{ xs: 12 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
                Availability History (Last 80 check cycles)
              </Typography>
              <UptimeDots history={filteredHistory} limit={80} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Details Grid */}
      <Typography component="h2" variant="h6" sx={{ mb: 2, mt: 3 }}>
        Check Log Details
      </Typography>
      <Grid container spacing={2} columns={12}>
        <Grid size={{ xs: 12, lg: 9 }}>
          <CustomizedDataGrid />
        </Grid>
        <Grid size={{ xs: 12, lg: 3 }}>
          <LatestIncident />
        </Grid>
      </Grid>
    </Box>
  );
}
