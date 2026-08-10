import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SendIcon from '@mui/icons-material/Send';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SettingsIcon from '@mui/icons-material/Settings';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TimelineIcon from '@mui/icons-material/Timeline';
import CommentIcon from '@mui/icons-material/Comment';

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

interface Incident {
  id: string;
  targetId: number;
  targetName: string;
  status: 'Resolved' | 'Active';
  startedAt: string;
  resolvedAt: string;
  duration: string;
  cause: string;
  responseCode: number;
  requestDuration: string;
  checkedUrl: string;
  keywordRequired?: string;
  aiPostMortem: string;
  resolvedIps: string[];
  timeline: { time: string; text: string; location?: string }[];
  comments: { author: string; time: string; text: string }[];
}

export default function AnalyticsTab() {
  const [targets, setTargets] = React.useState<Target[]>([]);
  const [selectedTarget, setSelectedTarget] = React.useState<Target | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isPaused, setIsPaused] = React.useState(false);
  const [testAlertSent, setTestAlertSent] = React.useState(false);

  // Filter Date Range
  const [fromDate, setFromDate] = React.useState('2026-07-27');
  const [toDate, setToDate] = React.useState('2026-08-10');

  // Selected Incident Dialog State
  const [selectedIncident, setSelectedIncident] = React.useState<Incident | null>(null);
  const [commentInput, setCommentInput] = React.useState('');
  const [incidentsList, setIncidentsList] = React.useState<Incident[]>([]);

  // Load Targets & Initial Data
  const loadData = React.useCallback(() => {
    try {
      const stored = localStorage.getItem('uptime_sentry_targets');
      if (stored) {
        const list = JSON.parse(stored) as Target[];
        setTargets(list);

        const activeId = localStorage.getItem('uptime_sentry_active_id');
        const currentProfileTargets = list.filter((t) => t.profileId === activeId);

        if (currentProfileTargets.length > 0 && !selectedTarget) {
          setSelectedTarget(currentProfileTargets[0]);
        } else if (list.length > 0 && !selectedTarget) {
          setSelectedTarget(list[0]);
        }
      }
    } catch (e) {
      console.error('Failed to load targets for analytics:', e);
    }
  }, [selectedTarget]);

  React.useEffect(() => {
    loadData();

    const handleSelectIncident = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.targetId) {
        const foundTarget = targets.find((t) => t.id === detail.targetId);
        if (foundTarget) {
          setSelectedTarget(foundTarget);
        }
      }
    };

    window.addEventListener('select-analytics-incident', handleSelectIncident);
    return () => window.removeEventListener('select-analytics-incident', handleSelectIncident);
  }, [loadData, targets]);

  // Generate Incidents for selected target
  React.useEffect(() => {
    if (!selectedTarget) return;

    const mockIncidents: Incident[] = [
      {
        id: `inc-${selectedTarget.id}-1`,
        targetId: selectedTarget.id,
        targetName: selectedTarget.name,
        status: 'Resolved',
        startedAt: 'Aug 5, 2026 at 10:03am CEST',
        resolvedAt: 'Aug 5, 2026 at 10:45am CEST',
        duration: '42 minutes',
        cause: selectedTarget.type === 'HTTP' ? 'Keyword not found (looked for "Pages","status":"operational")' : 'ICMP Echo Timeout',
        responseCode: 200,
        requestDuration: '0.3428s',
        checkedUrl: selectedTarget.type === 'HTTP' ? selectedTarget.host : `PING ${selectedTarget.host}`,
        keywordRequired: '"Pages","status":"operational"',
        aiPostMortem: `The monitor flagged ${selectedTarget.name} as down because the expected keyword ("Pages","status":"operational") was not found in the response, even though the endpoint returned HTTP 200. Checks from multiple regions saw the keyword-missing error. The monitor later recovered in all regions and the incident was resolved automatically after a short wait.`,
        resolvedIps: ['18.67.110.39', '13.35.107.71', '52.222.136.125'],
        timeline: [
          { time: 'Aug 5 at 10:48am CEST', text: 'Incident resolved automatically.' },
          { time: 'Aug 5 at 10:45am CEST', text: 'Waiting for 3 minutes before auto-resolving the incident, and postponing all escalations.' },
          { time: 'Aug 5 at 10:45am CEST', text: 'Monitor recovered.', location: 'Australia' },
          { time: 'Aug 5 at 10:45am CEST', text: 'Monitor recovered.', location: 'Europe' },
          { time: 'Aug 5 at 10:45am CEST', text: 'Monitor recovered.', location: 'North America' },
          { time: 'Aug 5 at 10:04am CEST', text: 'Notifying the entire team.' },
          { time: 'Aug 5 at 10:04am CEST', text: 'Incident started.' },
          { time: 'Aug 5 at 10:03am CEST', text: `Received keyword not found error at ${selectedTarget.host} from 162.55.165.86`, location: 'Europe' },
          { time: 'Aug 5 at 10:03am CEST', text: `Received keyword not found error at ${selectedTarget.host} from 5.161.118.194`, location: 'North America' },
          { time: 'Aug 5 at 10:03am CEST', text: `Received keyword not found error at ${selectedTarget.host} from 194.195.248.157`, location: 'Australia' },
        ],
        comments: [
          { author: 'Wlad Ermisch', time: 'Aug 5 at 11:15am CEST', text: 'Verified endpoint response structure. Upstream API deploy temporarily altered JSON keys.' }
        ]
      },
      {
        id: `inc-${selectedTarget.id}-2`,
        targetId: selectedTarget.id,
        targetName: selectedTarget.name,
        status: 'Resolved',
        startedAt: 'Jul 30, 2026 at 02:14pm CEST',
        resolvedAt: 'Jul 30, 2026 at 03:22pm CEST',
        duration: '1 hour and 8 minutes',
        cause: 'HTTP 500 Server Error',
        responseCode: 500,
        requestDuration: '5.001s',
        checkedUrl: selectedTarget.host,
        aiPostMortem: `Target ${selectedTarget.name} returned HTTP 500 Internal Server Error due to high server CPU utilization during automated database backup. Auto-recovery script restarted Apache service.`,
        resolvedIps: ['104.21.55.12'],
        timeline: [
          { time: 'Jul 30 at 03:22pm CEST', text: 'Incident resolved.' },
          { time: 'Jul 30 at 02:16pm CEST', text: 'Executed recovery command: restart-service.bat' },
          { time: 'Jul 30 at 02:14pm CEST', text: 'HTTP 500 Internal Server Error detected.' }
        ],
        comments: []
      }
    ];

    setIncidentsList(mockIncidents);
  }, [selectedTarget]);

  const handleSendTestAlert = () => {
    setTestAlertSent(true);
    try {
      const audio = new Audio('http://127.0.0.1:8765/api/audio/stream?type=down&file=Down-Default.wav');
      audio.volume = 0.8;
      audio.play().catch(() => {});
    } catch {}
    setTimeout(() => setTestAlertSent(false), 3000);
  };

  const handleNavigateToConfigure = () => {
    if (!selectedTarget) return;
    window.dispatchEvent(new CustomEvent('nav-tab', { detail: 'targets' }));
  };

  const handleAddComment = () => {
    if (!commentInput.trim() || !selectedIncident) return;
    const newComment = {
      author: 'User',
      time: 'Just now',
      text: commentInput.trim(),
    };
    setSelectedIncident({
      ...selectedIncident,
      comments: [...selectedIncident.comments, newComment],
    });
    setCommentInput('');
  };

  const filteredTargets = targets.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.host.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Box sx={{ width: '100%', maxWidth: { sm: '100%', md: '1700px' }, userSelect: 'none' }}>
      <Grid container spacing={3}>
        {/* Left Side: Subsidebar Target Switcher */}
        <Grid size={{ xs: 12, md: 3.2 }}>
          <Box sx={{ borderRight: '1px solid', borderColor: 'divider', height: '100%', pr: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: 'text.secondary', mb: 1 }}>
                Analytics Monitors
              </Typography>
              <TextField
                placeholder="Search target..."
                size="small"
                fullWidth
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </Box>
            <List dense sx={{ p: 0, overflow: 'auto', flexGrow: 1 }}>
              {filteredTargets.map((t) => (
                <ListItemButton
                  key={t.id}
                  selected={selectedTarget?.id === t.id}
                  onClick={() => setSelectedTarget(t)}
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
                      <Typography variant="body2" sx={{ fontWeight: selectedTarget?.id === t.id ? 'bold' : 'medium', fontSize: '0.82rem', lineHeight: 1.2 }}>
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
            </List>
          </Box>
        </Grid>

        {/* Right Side: Analytics & Incident Panel */}
        <Grid size={{ xs: 12, md: 8.8 }}>
          {selectedTarget ? (
            <Stack spacing={3}>
              {/* Target Header Card */}
              <Card variant="outlined">
                <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                    <Box>
                      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 0.5 }}>
                        <Typography variant="h5" sx={{ fontWeight: 'bold', userSelect: 'text' }}>
                          {selectedTarget.name}
                        </Typography>
                        <Chip
                          label={isPaused ? 'PAUSED' : 'UP'}
                          color={isPaused ? 'warning' : 'success'}
                          size="small"
                          sx={{ fontWeight: 'bold' }}
                        />
                        <Typography variant="caption" color="text.secondary">
                          • Checked every 3 minutes
                        </Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ userSelect: 'text', fontFamily: 'monospace' }}>
                        {selectedTarget.host}
                      </Typography>
                    </Box>

                    {/* Quick Action Buttons */}
                    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<SendIcon />}
                        onClick={handleSendTestAlert}
                      >
                        {testAlertSent ? 'Alert Sent!' : 'Send test alert'}
                      </Button>
                      <Button
                        size="small"
                        variant={isPaused ? 'contained' : 'outlined'}
                        color={isPaused ? 'success' : 'warning'}
                        startIcon={isPaused ? <PlayArrowIcon /> : <PauseIcon />}
                        onClick={() => setIsPaused(!isPaused)}
                      >
                        {isPaused ? 'Resume' : 'Pause'}
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<SettingsIcon />}
                        onClick={handleNavigateToConfigure}
                      >
                        Configure
                      </Button>
                    </Stack>
                  </Stack>

                  <Divider />

                  {/* Summary Metric Cards */}
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          Currently up for
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                          5 days 11 hours 14 mins
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          Last checked at
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                          2 minutes ago
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          Total Incidents Recorded
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'error.main' }}>
                          {incidentsList.length + 11}
                        </Typography>
                      </Box>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              {/* Time Period Breakdown Table */}
              <Card variant="outlined">
                <CardContent>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                      Historical Response & Availability Breakdown
                    </Typography>
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                      <TextField
                        type="date"
                        label="From"
                        size="small"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                      <TextField
                        type="date"
                        label="To"
                        size="small"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                      <Button variant="contained" size="small">
                        Calculate
                      </Button>
                    </Stack>
                  </Stack>

                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead sx={{ bgcolor: 'action.hover' }}>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 'bold' }}>Time Period</TableCell>
                          <TableCell sx={{ fontWeight: 'bold' }}>Availability</TableCell>
                          <TableCell sx={{ fontWeight: 'bold' }}>Downtime</TableCell>
                          <TableCell sx={{ fontWeight: 'bold' }}>Incidents</TableCell>
                          <TableCell sx={{ fontWeight: 'bold' }}>Longest Incident</TableCell>
                          <TableCell sx={{ fontWeight: 'bold' }}>Avg. Incident</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 'medium' }}>Today</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', color: 'success.main' }}>100.0000%</TableCell>
                          <TableCell>none</TableCell>
                          <TableCell>0</TableCell>
                          <TableCell>none</TableCell>
                          <TableCell>none</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 'medium' }}>Last 7 days</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', color: 'success.main' }}>99.5773%</TableCell>
                          <TableCell>42 minutes</TableCell>
                          <TableCell>1</TableCell>
                          <TableCell>42 minutes</TableCell>
                          <TableCell>42 minutes</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 'medium' }}>Last 30 days</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', color: 'success.main' }}>99.6851%</TableCell>
                          <TableCell>2 hours and 15 minutes</TableCell>
                          <TableCell>3</TableCell>
                          <TableCell>1 hour and 8 minutes</TableCell>
                          <TableCell>45 minutes</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 'medium' }}>Last 365 days</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', color: 'warning.main' }}>97.1724%</TableCell>
                          <TableCell>1 week and 3 days</TableCell>
                          <TableCell>13</TableCell>
                          <TableCell>1 week and 1 day</TableCell>
                          <TableCell>19 hours and 2 minutes</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 'medium' }}>All time (Last 106 days)</TableCell>
                          <TableCell sx={{ fontWeight: 'bold', color: 'warning.main' }}>90.1829%</TableCell>
                          <TableCell>1 week and 3 days</TableCell>
                          <TableCell>13</TableCell>
                          <TableCell>1 week and 1 day</TableCell>
                          <TableCell>19 hours and 2 minutes</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>

              {/* Clickable Incidents List */}
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 2 }}>
                    Downtime Incidents Archive (Click to inspect post-mortem)
                  </Typography>
                  <List dense sx={{ p: 0 }}>
                    {incidentsList.map((inc) => (
                      <ListItemButton
                        key={inc.id}
                        onClick={() => setSelectedIncident(inc)}
                        sx={{
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 1,
                          mb: 1,
                          p: 1.5,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          '&:hover': { bgcolor: 'action.hover' }
                        }}
                      >
                        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                          <CheckCircleIcon color="success" />
                          <Box>
                            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                              <Typography variant="body2" sx={{ fontWeight: 'bold', userSelect: 'text' }}>
                                {inc.status} • {inc.startedAt}
                              </Typography>
                              <Chip label={inc.duration} size="small" variant="outlined" />
                            </Stack>
                            <Typography variant="caption" color="text.secondary" sx={{ userSelect: 'text', display: 'block', mt: 0.5 }}>
                              Cause: {inc.cause}
                            </Typography>
                          </Box>
                        </Stack>
                        <Typography variant="caption" color="primary.main" sx={{ fontWeight: 'bold' }}>
                          View Details & AI Analysis →
                        </Typography>
                      </ListItemButton>
                    ))}
                  </List>
                </CardContent>
              </Card>
            </Stack>
          ) : (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">Select a target from the list to view detailed analytics.</Typography>
            </Box>
          )}
        </Grid>
      </Grid>

      {/* Deep Incident Information Dialog */}
      {selectedIncident && (
        <Dialog
          open={Boolean(selectedIncident)}
          onClose={() => setSelectedIncident(null)}
          maxWidth="md"
          fullWidth
          slotProps={{ paper: { sx: { borderRadius: 2 } } }}
        >
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
            <Box>
              <Typography variant="overline" color="text.secondary">Incident Detail View</Typography>
              <Typography variant="h6" sx={{ fontWeight: 'bold', userSelect: 'text' }}>
                {selectedIncident.targetName} — {selectedIncident.status} ({selectedIncident.startedAt})
              </Typography>
            </Box>
            <Chip label="Auto-resolved" color="success" size="small" />
          </DialogTitle>
          <Divider />
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
            {/* Cause Box */}
            <Box sx={{ p: 2, bgcolor: 'rgba(244, 67, 54, 0.08)', border: '1px solid', borderColor: 'error.light', borderRadius: 1 }}>
              <Typography variant="caption" color="error.dark" sx={{ fontWeight: 'bold', display: 'block', mb: 0.5 }}>
                ROOT CAUSE
              </Typography>
              <Typography variant="body2" sx={{ userSelect: 'text', fontWeight: 'medium', fontFamily: 'monospace' }}>
                {selectedIncident.cause}
              </Typography>
            </Box>

            {/* AI Post-Mortem Card */}
            <Card variant="outlined" sx={{ bgcolor: 'action.hover' }}>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: 'primary.main' }}>
                  <AutoAwesomeIcon fontSize="small" />
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                    AI Post-Mortem Analysis
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ userSelect: 'text', lineHeight: 1.6 }}>
                  {selectedIncident.aiPostMortem}
                </Typography>
              </CardContent>
            </Card>

            {/* Checked Endpoint */}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold', display: 'block', mb: 0.5 }}>
                CHECKED URL
              </Typography>
              <Box sx={{ p: 1.5, bgcolor: 'black', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" sx={{ color: 'grey.300', fontFamily: 'monospace', userSelect: 'text' }}>
                  GET {selectedIncident.checkedUrl}
                </Typography>
              </Box>
            </Box>

            {/* Technical Metadata Accordion */}
            <Accordion variant="outlined">
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                  Technical Request & Response Metadata
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2} sx={{ userSelect: 'text' }}>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Response Code:</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{selectedIncident.responseCode}</Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Request Duration:</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 'medium' }}>{selectedIncident.requestDuration}</Typography>
                  </Grid>
                  <Grid size={12}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Resolved IP Addresses:</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {selectedIncident.resolvedIps.join(', ')}
                    </Typography>
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>

            {/* Incident Audit Log Timeline Stream */}
            <Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
                <TimelineIcon fontSize="small" color="action" />
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                  Incident Lifecycle Audit Timeline
                </Typography>
              </Stack>
              <Stack spacing={1} sx={{ pl: 1, borderLeft: '2px solid', borderColor: 'primary.main' }}>
                {selectedIncident.timeline.map((item, idx) => (
                  <Box key={idx} sx={{ pl: 1.5, py: 0.5, userSelect: 'text' }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                        {item.time}
                      </Typography>
                      {item.location && <Chip label={item.location} size="small" variant="outlined" />}
                    </Stack>
                    <Typography variant="body2" color="text.primary">
                      {item.text}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>

            {/* Post-Mortem Comments Section */}
            <Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
                <CommentIcon fontSize="small" color="action" />
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                  User Investigation Notes
                </Typography>
              </Stack>
              <Stack spacing={1.5} sx={{ mb: 2 }}>
                {selectedIncident.comments.map((c, idx) => (
                  <Box key={idx} sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1, userSelect: 'text' }}>
                    <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" sx={{ fontWeight: 'bold' }}>{c.author}</Typography>
                      <Typography variant="caption" color="text.secondary">{c.time}</Typography>
                    </Stack>
                    <Typography variant="body2">{c.text}</Typography>
                  </Box>
                ))}
              </Stack>
              <Stack direction="row" spacing={1}>
                <TextField
                  placeholder="Add investigation note..."
                  size="small"
                  fullWidth
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                />
                <Button variant="contained" size="small" onClick={handleAddComment}>
                  Post
                </Button>
              </Stack>
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button variant="outlined" onClick={() => setSelectedIncident(null)}>
              Close
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}
