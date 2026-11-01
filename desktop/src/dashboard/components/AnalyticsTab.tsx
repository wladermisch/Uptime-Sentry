import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import VolumeUpRoundedIcon from '@mui/icons-material/VolumeUpRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import { fonts, signal } from '../../shared-theme/themePrimitives';
import { CheckResult, Target, deriveRow, formatClock, formatDuration } from '../home/boardModel';
import {
  API, Incident, WindowStats, checksFor, computeIncidents, coverageStart, daysAgo, fetchHistory,
  formatDateTime, formatPct, formatSpan, fromDateInput, startOfDay, toDateInput, windowStats, BACKEND_HISTORY_LIMIT,
} from '../historyStats';

const mono = { fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' } as const;
const NOTES_KEY = 'uptime_sentry_incident_notes';

type Notes = Record<string, { time: string; text: string }[]>;

function loadNotes(): Notes {
  try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '{}') as Notes; } catch { return {}; }
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="overline" sx={{ display: 'block', color: 'text.secondary', lineHeight: 1.6 }}>
      {children}
    </Typography>
  );
}

function Fact({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'down' }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Label>{label}</Label>
      <Box
        sx={(theme) => ({
          ...mono,
          fontSize: 18,
          fontWeight: 600,
          mt: 0.25,
          color: tone === 'down' ? signal.downInk : (theme.vars || theme).palette.text.primary,
          ...theme.applyStyles('dark', { color: tone === 'down' ? signal.downOnDark : (theme.vars || theme).palette.text.primary }),
        })}
      >
        {value}
      </Box>
    </Box>
  );
}

function StatsRow({ label, stats }: { label: React.ReactNode; stats: WindowStats }) {
  const low = stats.availability !== null && stats.availability < 100;
  return (
    <TableRow>
      <TableCell sx={{ fontWeight: 600 }}>{label}</TableCell>
      <TableCell sx={(theme) => ({ ...mono, fontWeight: 700, color: low ? signal.downInk : 'inherit', ...theme.applyStyles('dark', { color: low ? signal.downOnDark : 'inherit' }) })}>
        {formatPct(stats.availability)}
      </TableCell>
      <TableCell sx={mono}>{stats.checks === 0 ? '—' : `${stats.checks - stats.failed} / ${stats.checks}`}</TableCell>
      <TableCell sx={mono}>{formatSpan(stats.downtimeMs)}</TableCell>
      <TableCell sx={mono}>{stats.incidents}</TableCell>
      <TableCell sx={mono}>{formatSpan(stats.longestMs)}</TableCell>
      <TableCell sx={mono}>{formatSpan(stats.averageMs)}</TableCell>
    </TableRow>
  );
}

export default function AnalyticsTab() {
  const [targets, setTargets] = React.useState<Target[]>([]);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [history, setHistory] = React.useState<CheckResult[]>([]);
  const [historyError, setHistoryError] = React.useState(false);
  const [autoCheck, setAutoCheck] = React.useState<{ running: boolean; intervalSeconds: number } | null>(null);
  const [now, setNow] = React.useState(() => new Date());
  const [fromDate, setFromDate] = React.useState(() => toDateInput(daysAgo(new Date(), 7)));
  const [toDate, setToDate] = React.useState(() => toDateInput(new Date()));
  const [openIncident, setOpenIncident] = React.useState<Incident | null>(null);
  const [notes, setNotes] = React.useState<Notes>(loadNotes);
  const [noteInput, setNoteInput] = React.useState('');
  const [alertPlayed, setAlertPlayed] = React.useState(false);
  const targetsRef = React.useRef<Target[]>([]);

  const loadTargets = React.useCallback(() => {
    try {
      const list = JSON.parse(localStorage.getItem('uptime_sentry_targets') || '[]') as Target[];
      const activeId = localStorage.getItem('uptime_sentry_active_id');
      setTargets(list);
      targetsRef.current = list;
      setSelectedId((cur) => {
        if (cur !== null && list.some((t) => t.id === cur)) return cur;
        return (list.find((t) => t.profileId === activeId) ?? list[0])?.id ?? null;
      });
    } catch (e) {
      console.error('Failed to load targets for analytics:', e);
    }
  }, []);

  const loadHistory = React.useCallback(async () => {
    try {
      const [h, a] = await Promise.all([fetchHistory(), fetch(`${API}/api/autocheck/status`).then((r) => (r.ok ? r.json() : null))]);
      setHistory(h);
      setAutoCheck(a as { running: boolean; intervalSeconds: number } | null);
      setHistoryError(false);
    } catch {
      setHistoryError(true);
    }
    setNow(new Date());
  }, []);

  React.useEffect(() => {
    loadTargets();
    void loadHistory();
    const poll = setInterval(() => { void loadHistory(); }, 10000);
    const onSelect = (e: Event) => {
      const id = (e as CustomEvent<{ targetId?: number }>).detail?.targetId;
      if (id !== undefined && targetsRef.current.some((t) => t.id === id)) setSelectedId(id);
    };
    const onProfiles = () => { loadTargets(); };
    window.addEventListener('select-analytics-incident', onSelect);
    window.addEventListener('profiles-updated', onProfiles);
    window.addEventListener('profile-changed', onProfiles);
    return () => {
      clearInterval(poll);
      window.removeEventListener('select-analytics-incident', onSelect);
      window.removeEventListener('profiles-updated', onProfiles);
      window.removeEventListener('profile-changed', onProfiles);
    };
  }, [loadTargets, loadHistory]);

  const selected = targets.find((t) => t.id === selectedId) ?? null;
  const checks = React.useMemo(() => (selected ? checksFor(history, selected.id) : []), [history, selected]);
  const incidents = React.useMemo(() => computeIncidents(checks, now), [checks, now]);
  const row = selected ? deriveRow(selected, history, {}) : null;
  const coverage = coverageStart(checks);

  const rangeFrom = fromDateInput(fromDate, 'start');
  const rangeTo = fromDateInput(toDate, 'end');
  const windows: { label: React.ReactNode; stats: WindowStats }[] = [
    { label: 'Today', stats: windowStats(checks, incidents, startOfDay(now), now, now) },
    { label: 'Last 7 days', stats: windowStats(checks, incidents, daysAgo(now, 7), now, now) },
    { label: 'Last 30 days', stats: windowStats(checks, incidents, daysAgo(now, 30), now, now) },
  ];
  if (rangeFrom && rangeTo && rangeFrom <= rangeTo) {
    windows.push({ label: `${fromDate} – ${toDate}`, stats: windowStats(checks, incidents, rangeFrom, rangeTo, now) });
  }

  const filteredTargets = targets.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.host.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const playAlertSound = () => {
    try {
      const audio = new Audio(`${API}/api/audio/stream?type=down&file=Down-Default.wav`);
      audio.volume = 0.8;
      void audio.play().then(() => { setAlertPlayed(true); setTimeout(() => { setAlertPlayed(false); }, 2500); });
    } catch {
      // Audio unavailable: nothing to confirm.
    }
  };

  const addNote = () => {
    if (!openIncident || !noteInput.trim()) return;
    const next: Notes = {
      ...notes,
      [openIncident.id]: [...(notes[openIncident.id] ?? []), { time: new Date().toISOString(), text: noteInput.trim() }],
    };
    setNotes(next);
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
    setNoteInput('');
  };

  const stateLabel = !row || row.state === 'pending' ? 'No checks yet' : row.state === 'down' ? 'Down' : 'Up';

  return (
    <Box sx={{ width: '100%', maxWidth: { sm: '100%', md: '1700px' } }}>
      <Grid container spacing={3}>
        {/* Target list */}
        <Grid size={{ xs: 12, md: 3.2 }}>
          <Box sx={{ borderRight: { md: '1px solid' }, borderColor: { md: 'divider' }, height: '100%', pr: { md: 2 }, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <TextField
              placeholder="Search targets"
              size="small"
              fullWidth
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); }}
              slotProps={{ htmlInput: { 'aria-label': 'Search targets' } }}
            />
            <List dense sx={{ p: 0 }}>
              {filteredTargets.map((t) => {
                const r = deriveRow(t, history, {});
                return (
                  <ListItemButton
                    key={t.id}
                    selected={selectedId === t.id}
                    onClick={() => { setSelectedId(t.id); }}
                    sx={{ borderRadius: 1, mb: 0.5, py: 0.5, px: 1.5, gap: 1.25 }}
                  >
                    <Box
                      aria-hidden="true"
                      sx={{
                        width: 8, height: 8, borderRadius: '2px', flexShrink: 0,
                        backgroundColor: r.state === 'down' ? signal.down : r.state === 'up' ? 'text.primary' : 'divider',
                      }}
                    />
                    <ListItemText
                      primary={t.name}
                      secondary={`${t.type} · ${t.host}`}
                      slotProps={{
                        primary: { sx: { fontWeight: selectedId === t.id ? 700 : 500, fontSize: 14 } },
                        secondary: { sx: { ...mono, fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                      }}
                    />
                  </ListItemButton>
                );
              })}
              {filteredTargets.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, py: 1 }}>
                  {targets.length === 0 ? 'No targets yet.' : 'No target matches your search.'}
                </Typography>
              )}
            </List>
          </Box>
        </Grid>

        {/* Selected target */}
        <Grid size={{ xs: 12, md: 8.8 }}>
          {!selected ? (
            <Box sx={{ p: 4 }}>
              <Typography color="text.secondary">Select a target to see its availability and outages.</Typography>
            </Box>
          ) : (
            <Stack spacing={3}>
              {historyError && (
                <Box role="alert" sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, fontSize: 14 }}>
                  Can't reach the monitoring service at 127.0.0.1:8765. Figures below may be out of date.
                </Box>
              )}

              {/* Header */}
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
                <Box sx={{ mr: 'auto', minWidth: 0 }}>
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                    <Typography component="h2" sx={{ fontSize: 28, fontWeight: 800, fontStretch: '72%', lineHeight: 1.1 }}>
                      {selected.name}
                    </Typography>
                    <Box
                      component="span"
                      sx={{
                        ...mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', px: 1, lineHeight: '22px', borderRadius: '3px',
                        backgroundColor: row?.state === 'down' ? signal.down : 'transparent',
                        color: row?.state === 'down' ? '#FFFFFF' : 'text.secondary',
                        border: row?.state === 'down' ? 'none' : '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      {stateLabel.toUpperCase()}
                    </Box>
                  </Stack>
                  <Typography sx={{ ...mono, fontSize: 13, color: 'text.secondary', mt: 0.5, overflowWrap: 'anywhere' }}>
                    {selected.type} · {selected.host}
                    {autoCheck ? ` · ${autoCheck.running ? `auto-check every ${autoCheck.intervalSeconds} s` : 'auto-check paused'}` : ''}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button size="small" variant="outlined" startIcon={<VolumeUpRoundedIcon />} onClick={playAlertSound}>
                    {alertPlayed ? 'Played' : 'Test alert sound'}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<SettingsRoundedIcon />}
                    onClick={() => { window.dispatchEvent(new CustomEvent('nav-tab', { detail: 'targets' })); }}
                  >
                    Configure
                  </Button>
                </Stack>
              </Box>

              {/* Facts */}
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 2, py: 2, borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider' }}>
                <Fact
                  label={row?.state === 'down' ? 'Down for' : 'Up for'}
                  tone={row?.state === 'down' ? 'down' : undefined}
                  value={row?.since ? formatDuration(row.since, now) : '—'}
                />
                <Fact label="Last checked" value={row?.lastChecked ? formatClock(row.lastChecked) : '—'} />
                <Fact label="Outages recorded" value={incidents.length} />
              </Box>

              {/* Availability */}
              <Box>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-end', mb: 1.5, flexWrap: 'wrap', gap: 2 }}>
                  <Typography component="h3" sx={{ fontSize: 16, fontWeight: 700 }}>Availability</Typography>
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                    <TextField type="date" label="From" size="small" value={fromDate} onChange={(e) => { setFromDate(e.target.value); }} slotProps={{ inputLabel: { shrink: true } }} />
                    <TextField type="date" label="To" size="small" value={toDate} onChange={(e) => { setToDate(e.target.value); }} slotProps={{ inputLabel: { shrink: true } }} />
                  </Stack>
                </Stack>
                <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {['Period', 'Availability', 'Checks OK', 'Downtime', 'Outages', 'Longest', 'Average'].map((h) => (
                          <TableCell key={h}><Typography variant="overline" color="text.secondary">{h}</Typography></TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {windows.map((w, i) => <StatsRow key={i} label={w.label} stats={w.stats} />)}
                    </TableBody>
                  </Table>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  {coverage
                    ? `Based on ${checks.length} recorded checks since ${formatDateTime(coverage)}. Periods before that show no data. The monitoring service keeps the latest ${BACKEND_HISTORY_LIMIT} checks across all targets.`
                    : 'No checks recorded for this target yet.'}
                </Typography>
              </Box>

              {/* Outages */}
              <Box>
                <Typography component="h3" sx={{ fontSize: 16, fontWeight: 700, mb: 1.5 }}>Outages</Typography>
                {incidents.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No outages in the recorded checks{coverage ? ` (since ${formatDateTime(coverage)})` : ''}.
                  </Typography>
                ) : (
                  <List dense sx={{ p: 0, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                    {incidents.map((inc, i) => (
                      <ListItemButton
                        key={inc.id}
                        onClick={() => { setOpenIncident(inc); setNoteInput(''); }}
                        divider={i < incidents.length - 1}
                        sx={{ py: 1.25, px: 2, gap: 2 }}
                      >
                        <Box
                          sx={{
                            ...mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', px: 0.75, lineHeight: '20px', borderRadius: '3px', flexShrink: 0,
                            backgroundColor: inc.end ? 'transparent' : signal.down,
                            color: inc.end ? 'text.secondary' : '#FFFFFF',
                            border: inc.end ? '1px solid' : 'none',
                            borderColor: 'divider',
                          }}
                        >
                          {inc.end ? 'RESOLVED' : 'ONGOING'}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ ...mono, fontSize: 13, fontWeight: 600 }}>
                            {formatDateTime(inc.start)} · {formatSpan(inc.durationMs)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {inc.failedChecks[inc.failedChecks.length - 1].message || 'Check failed'} · {inc.failedChecks.length} failed {inc.failedChecks.length === 1 ? 'check' : 'checks'}
                            {notes[inc.id]?.length ? ` · ${notes[inc.id].length} ${notes[inc.id].length === 1 ? 'note' : 'notes'}` : ''}
                          </Typography>
                        </Box>
                        <ChevronRightRoundedIcon sx={{ color: 'text.secondary' }} />
                      </ListItemButton>
                    ))}
                  </List>
                )}
              </Box>
            </Stack>
          )}
        </Grid>
      </Grid>

      {/* Outage detail */}
      {openIncident && selected && (
        <Dialog open onClose={() => { setOpenIncident(null); }} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ pb: 1 }}>
            <Typography component="span" sx={{ display: 'block', fontSize: 20, fontWeight: 800 }}>
              {selected.name} outage
            </Typography>
            <Typography component="span" sx={{ ...mono, display: 'block', fontSize: 13, color: 'text.secondary' }}>
              {formatDateTime(openIncident.start)} → {openIncident.end ? formatDateTime(openIncident.end) : 'ongoing'} · {formatSpan(openIncident.durationMs)}
            </Typography>
          </DialogTitle>
          <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Box>
              <Label>Checked</Label>
              <Typography sx={{ ...mono, fontSize: 13, overflowWrap: 'anywhere' }}>{selected.type} {selected.host}</Typography>
            </Box>
            <Box>
              <Label>On failure</Label>
              <Typography sx={{ ...mono, fontSize: 13, overflowWrap: 'anywhere', color: selected.recoveryAction ? 'text.primary' : 'text.secondary' }}>
                {selected.recoveryAction || 'No recovery action configured'}
              </Typography>
            </Box>
            <Box>
              <Label>Check log</Label>
              <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {[...openIncident.failedChecks, ...(openIncident.recovery ? [openIncident.recovery] : [])].map((c) => (
                  <Box component="li" key={c.timestamp} sx={{ display: 'grid', gridTemplateColumns: '84px 64px 1fr', gap: 1.5, ...mono, fontSize: 13 }}>
                    <span>{formatClock(c.timestamp)}</span>
                    <Box component="span" sx={(theme) => ({ fontWeight: 700, color: c.success ? 'inherit' : signal.downInk, ...theme.applyStyles('dark', { color: c.success ? 'inherit' : signal.downOnDark }) })}>
                      {c.success ? 'UP' : 'DOWN'}
                    </Box>
                    <Box component="span" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
                      {c.success ? `${c.durationMillis} ms · ${c.message}` : c.message || 'Check failed'}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
            <Box>
              <Label>Notes</Label>
              {(notes[openIncident.id] ?? []).map((n) => (
                <Box key={n.time} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography sx={{ ...mono, fontSize: 12, color: 'text.secondary' }}>{formatDateTime(new Date(n.time))}</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{n.text}</Typography>
                </Box>
              ))}
              <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'flex-start' }}>
                <TextField
                  placeholder="What caused it, what fixed it…"
                  size="small"
                  fullWidth
                  multiline
                  minRows={2}
                  value={noteInput}
                  onChange={(e) => { setNoteInput(e.target.value); }}
                  slotProps={{ htmlInput: { 'aria-label': 'Add a note to this outage' } }}
                />
                <Button variant="contained" size="small" onClick={addNote} disabled={!noteInput.trim()}>
                  Save note
                </Button>
              </Stack>
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button variant="outlined" onClick={() => { setOpenIncident(null); }}>Close</Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}
