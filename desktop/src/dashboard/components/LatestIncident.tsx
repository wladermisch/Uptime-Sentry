import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import ErrorIcon from '@mui/icons-material/Error';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

interface CheckResult {
  targetId: number;
  targetName: string;
  timestamp: string;
  success: boolean;
  durationMillis: number;
  message: string;
}

interface Target {
  id: number;
  name: string;
  type: string;
  host: string;
  timeout: number;
  recoveryAction: string;
  acceptableStatusCodes: number[];
}

export default function LatestIncident() {
  const [latestIncident, setLatestIncident] = React.useState<CheckResult | null>(null);
  const [targetInfo, setTargetInfo] = React.useState<Target | null>(null);
  const [loading, setLoading] = React.useState(true);

  const fetchLatestIncident = React.useCallback(async () => {
    try {
      const r = await fetch('http://127.0.0.1:8765/api/history');
      if (r.ok) {
        const historyList = (await r.json()) as CheckResult[];
        const sortedHistory = [...historyList].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        const incident = sortedHistory.find((h) => !h.success) || null;
        setLatestIncident(incident);

        if (incident) {
          const storedTargets = localStorage.getItem('uptime_sentry_targets');
          if (storedTargets) {
            const targetsList = JSON.parse(storedTargets) as Target[];
            const matched = targetsList.find((t) => t.id === incident.targetId || t.name === incident.targetName) || null;
            setTargetInfo(matched);
          }
        }
      }
    } catch (e) {
      console.error('Failed to load incident info:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchLatestIncident();
    const interval = setInterval(() => {
      void fetchLatestIncident();
    }, 5000);
    return () => {
      clearInterval(interval);
    };
  }, [fetchLatestIncident]);

  if (loading) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">Loading incident logs...</Typography>
      </Box>
    );
  }

  const expectedResponse = targetInfo
    ? (targetInfo.acceptableStatusCodes && targetInfo.acceptableStatusCodes.length > 0 ? targetInfo.acceptableStatusCodes.join(', ') : '200')
    : '200 OK';

  if (!latestIncident) {
    return (
      <Card variant="outlined" sx={{ bgcolor: 'rgba(76, 175, 80, 0.08)', borderColor: 'success.light' }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 3, gap: 1 }}>
          <CheckCircleIcon color="success" sx={{ fontSize: 40 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: 'success.main' }}>
            All Systems Operational
          </Typography>
          <Typography variant="caption" color="text.secondary" align="center">
            No recent service outages or downtime checks recorded.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const expectedCodes = targetInfo && targetInfo.type === 'HTTP'
    ? (targetInfo.acceptableStatusCodes && targetInfo.acceptableStatusCodes.length > 0 ? targetInfo.acceptableStatusCodes.join(', ') : '200')
    : 'Reachable';

  const recoveryText = targetInfo && targetInfo.recoveryAction
    ? `Executed: "${targetInfo.recoveryAction}"`
    : 'None configured';

  return (
    <Card variant="outlined" sx={{ bgcolor: 'rgba(244, 67, 54, 0.08)', borderColor: 'error.light' }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
          <ErrorIcon color="error" />
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: 'error.main' }}>
            Latest Outage Incident
          </Typography>
        </Stack>
        <Divider />
        <Stack spacing={1}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Target:</Typography>
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{latestIncident.targetName}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Timestamp:</Typography>
            <Typography variant="body2">{latestIncident.timestamp}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Expected Response:</Typography>
            <Typography variant="body2">{targetInfo?.type === 'HTTP' ? `HTTP Status [${expectedCodes}]` : 'Ping Response'}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Actual Response:</Typography>
            <Typography variant="body2" color="error.main" sx={{ fontWeight: 'bold' }}>{latestIncident.message}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Latency / Timeout:</Typography>
            <Typography variant="body2">
              {latestIncident.durationMillis === -1 || latestIncident.durationMillis === 0 ? 'Timeout' : `${latestIncident.durationMillis}ms`} ({targetInfo ? `${targetInfo.timeout}s timeout limit` : 'default timeout'})
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Recovery Trigger:</Typography>
            <Typography variant="body2" sx={{ fontStyle: targetInfo?.recoveryAction ? 'normal' : 'italic' }}>{recoveryText}</Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
