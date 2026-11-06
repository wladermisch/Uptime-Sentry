import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ButtonBase from '@mui/material/ButtonBase';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import VolumeUpRoundedIcon from '@mui/icons-material/VolumeUpRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import IconButton from '@mui/material/IconButton';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { NotesMap, loadNotes, putNotes } from '../serverData';
import { signal } from '../../shared-theme/themePrimitives';
import { navigate } from '../nav';
import { Label, IndexEmpty, IndexFilter, IndexHeader, IndexList, IndexRow, Pass, PassHead, PassSection, Tag, Workspace, mono } from './workspace';
import { CheckResult, Target, deriveRow, formatClock, formatDuration } from '../home/boardModel';
import {
  API, Incident, WindowStats, checksFor, computeIncidents, coverageStart, daysAgo, fetchHistory,
  formatDateTime, formatPct, formatSpan, fromDateInput, startOfDay, toDateInput, windowStats,
} from '../historyStats';

const SHOW_REMOVED_KEY = 'uptime_sentry_analytics_show_removed';

/** Targets that were deleted but still have recorded checks, newest name first. */
function removedFromHistory(history: CheckResult[], currentIds: Set<number>): Target[] {
  const seen = new Map<number, Target>();
  for (const c of history) {
    if (currentIds.has(c.targetId) || seen.has(c.targetId)) continue;
    seen.set(c.targetId, {
      id: c.targetId, profileId: '', name: c.targetName, type: c.targetType ?? '', host: c.host ?? '',
      timeout: 0, recoveryAction: '', acceptableStatusCodes: [], consecutiveFailuresLimit: 1, profileName: c.profileName ?? '',
    });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
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

/** The board's ink header band, reused for the availability table. */
const headCell = {
  ...mono,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--board-head-muted)',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  height: 34,
  px: 1.5,
  backgroundColor: 'var(--board-head-bg)',
  borderBottom: '1px solid var(--board-head-rule)',
} as const;

function StatsRow({ label, stats }: { label: React.ReactNode; stats: WindowStats }) {
  const low = stats.availability !== null && stats.availability < 100;
  const cell = { ...mono, fontSize: 13, px: 1.5, height: 44, borderBottom: '1px solid', borderColor: 'divider', whiteSpace: 'nowrap' } as const;
  return (
    <tr>
      <Box component="th" scope="row" sx={{ ...cell, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, textAlign: 'left', pl: 3 }}>{label}</Box>
      <Box component="td" sx={(theme) => ({ ...cell, fontWeight: 700, color: low ? signal.downInk : 'inherit', ...theme.applyStyles('dark', { color: low ? signal.downOnDark : 'inherit' }) })}>
        {formatPct(stats.availability)}
      </Box>
      <Box component="td" sx={cell}>{stats.checks === 0 ? '—' : `${stats.checks - stats.failed} / ${stats.checks}`}</Box>
      <Box component="td" sx={cell}>{formatSpan(stats.downtimeMs)}</Box>
      <Box component="td" sx={cell}>{stats.incidents}</Box>
      <Box component="td" sx={cell}>{formatSpan(stats.longestMs)}</Box>
      <Box component="td" sx={{ ...cell, pr: 3 }}>{formatSpan(stats.averageMs)}</Box>
    </tr>
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
  const [notes, setNotes] = React.useState<NotesMap>({});
  const [noteError, setNoteError] = React.useState<string | null>(null);
  const [noteInput, setNoteInput] = React.useState('');
  const [alertPlayed, setAlertPlayed] = React.useState(false);
  const [showRemoved, setShowRemoved] = React.useState(() => {
    try { return localStorage.getItem(SHOW_REMOVED_KEY) === '1'; } catch { return false; }
  });
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
      const [h, a] = await Promise.all([fetchHistory({ since: daysAgo(new Date(), 400) }), fetch(`${API}/api/autocheck/status`).then((r) => (r.ok ? r.json() : null))]);
      setHistory(h);
      setAutoCheck(a as { running: boolean; intervalSeconds: number } | null);
      setHistoryError(false);
    } catch {
      setHistoryError(true);
    }
    setNow(new Date());
  }, []);

  React.useEffect(() => {
    // Notes live in the monitoring service, so reports and scheduled emails can include them.
    loadNotes().then(setNotes).catch(() => { /* offline: shown when saving */ });
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

  const removed = React.useMemo(() => removedFromHistory(history, new Set(targets.map((t) => t.id))), [history, targets]);
  const removedIds = React.useMemo(() => new Set(removed.map((t) => t.id)), [removed]);
  const listed = React.useMemo(() => (showRemoved ? [...targets, ...removed] : targets), [showRemoved, targets, removed]);
  const toggleRemoved = (on: boolean) => {
    setShowRemoved(on);
    try { localStorage.setItem(SHOW_REMOVED_KEY, on ? '1' : '0'); } catch { /* storage unavailable */ }
    // Hiding removed targets while one is open: go back to a current one.
    if (!on && selectedId !== null && removedIds.has(selectedId)) setSelectedId(targets[0]?.id ?? null);
  };
  const selected = listed.find((t) => t.id === selectedId) ?? null;
  const selectedRemoved = selected ? removedIds.has(selected.id) : false;
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

  const filteredTargets = listed.filter((t) =>
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

  const saveNotes = async (id: string, list: { time: string; text: string }[]) => {
    try {
      setNotes(await putNotes(id, list));
      setNoteError(null);
      return true;
    } catch {
      setNoteError("Can't reach the monitoring service, so the note wasn't saved.");
      return false;
    }
  };

  const addNote = async () => {
    if (!openIncident || !noteInput.trim()) return;
    const ok = await saveNotes(openIncident.id, [...(notes[openIncident.id] ?? []), { time: new Date().toISOString(), text: noteInput.trim() }]);
    if (ok) setNoteInput('');
  };

  const removeNote = (time: string) => {
    if (!openIncident) return;
    void saveNotes(openIncident.id, (notes[openIncident.id] ?? []).filter((n) => n.time !== time));
  };

  const maintenanceChecks = selected ? history.filter((h) => h.targetId === selected.id && h.maintenance).length : 0;

  const stateLabel = !row || row.state === 'pending' ? 'No checks yet' : row.state === 'down' ? 'Down' : 'Up';

  return (
    <Workspace
      index={
        <>
          <IndexHeader
            title="Targets"
            count={listed.length}
            extra={removed.length > 0 ? (
              <FormControlLabel
                label={`Removed (${removed.length})`}
                control={(
                  <Checkbox
                    size="small"
                    checked={showRemoved}
                    onChange={(e) => { toggleRemoved(e.target.checked); }}
                    sx={{ p: 0.5, color: 'var(--board-head-faint)', '&.Mui-checked': { color: 'var(--board-head-ink)' }, '& svg': { fontSize: 16 } }}
                  />
                )}
                sx={{ mr: 0.5, ml: 0, gap: 0.25, '& .MuiFormControlLabel-label': { font: 'inherit', letterSpacing: 'inherit', color: 'var(--board-head-muted)' } }}
              />
            ) : undefined}
          />
          <IndexFilter value={searchQuery} onChange={setSearchQuery} placeholder="Filter by name or host" />
          <IndexList label="Targets">
            {filteredTargets.map((t, i) => {
              const r = deriveRow(t, history, {});
              return (
                <IndexRow
                  key={t.id}
                  n={i + 1}
                  selected={selectedId === t.id}
                  onSelect={() => { setSelectedId(t.id); }}
                  title={t.name}
                  badge={removedIds.has(t.id) ? <Tag>REMOVED</Tag> : undefined}
                  meta={[t.type, t.host].filter(Boolean).join(' · ') || 'details not recorded'}
                  marker={r.state === 'down' ? { bg: signal.down, fg: '#FFFFFF' } : undefined}
                />
              );
            })}
            {filteredTargets.length === 0 && (
              <IndexEmpty>{targets.length === 0 ? 'No targets yet.' : `No target matches “${searchQuery}”.`}</IndexEmpty>
            )}
          </IndexList>
        </>
      }
    >
      {!selected ? (
        <Pass maxWidth={560}>
          <PassHead title="No target selected" description="Pick a target on the left to see its availability and outages." />
        </Pass>
      ) : (
        <Pass maxWidth={1040} aria-label={`${selected.name} analytics`}>
          {historyError && (
            <Box role="alert" sx={{ px: 3, py: 1.25, fontSize: 13, backgroundColor: 'action.selected', borderRadius: '10px 10px 0 0' }}>
              <strong>Can't reach the monitoring service</strong> at 127.0.0.1:8765. Figures below may be out of date.
            </Box>
          )}
          <PassHead
            title={selected.name}
            meta={
              <>
                <Box
                  component="span"
                  sx={{
                    ...mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', px: 1, lineHeight: '20px', borderRadius: '3px',
                    backgroundColor: row?.state === 'down' ? signal.down : 'transparent',
                    color: row?.state === 'down' ? '#FFFFFF' : 'text.primary',
                    border: row?.state === 'down' ? 'none' : '1px solid',
                    borderColor: row?.state === 'up' ? 'text.primary' : 'divider',
                  }}
                >
                  {stateLabel.toUpperCase()}
                </Box>
                <Tag>{selected.type}</Tag>
                <span>{selected.host}</span>
                {autoCheck && <span>· {autoCheck.running ? `auto-check every ${autoCheck.intervalSeconds} s` : 'auto-check paused'}</span>}
              </>
            }
            actions={
              <>
                <Button size="small" variant="outlined" startIcon={<VolumeUpRoundedIcon />} onClick={playAlertSound}>
                  {alertPlayed ? 'Played' : 'Test alert sound'}
                </Button>
                <Button size="small" variant="outlined" startIcon={<TuneRoundedIcon />} disabled={selectedRemoved} onClick={() => { navigate('targets'); }}>
                  {selectedRemoved ? 'Removed' : 'Configure'}
                </Button>
              </>
            }
          />

          <Box sx={{ px: 3, py: 2, borderTop: '1px dashed', borderColor: 'divider', display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
            <Fact
              label={row?.state === 'down' ? 'Down for' : 'Up for'}
              tone={row?.state === 'down' ? 'down' : undefined}
              value={row?.since ? formatDuration(row.since, now) : '—'}
            />
            <Fact label="Last checked" value={row?.lastChecked ? formatClock(row.lastChecked) : '—'} />
            <Fact label="Outages recorded" value={incidents.length} />
          </Box>

          <PassSection
            label="Availability"
            aside={
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <TextField type="date" label="From" size="small" value={fromDate} onChange={(e) => { setFromDate(e.target.value); }} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField type="date" label="To" size="small" value={toDate} onChange={(e) => { setToDate(e.target.value); }} slotProps={{ inputLabel: { shrink: true } }} />
              </Stack>
            }
          >
            <Box sx={{ mx: -3, overflowX: 'auto' }}>
              <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr>
                    {['Period', 'Availability', 'Checks OK', 'Downtime', 'Outages', 'Longest', 'Average'].map((h, i) => (
                      <Box component="th" scope="col" key={h} sx={{ ...headCell, pl: i === 0 ? 3 : 1.5, pr: i === 6 ? 3 : 1.5 }}>{h}</Box>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {windows.map((w, i) => <StatsRow key={i} label={w.label} stats={w.stats} />)}
                </tbody>
              </Box>
            </Box>
            <Box sx={{ fontSize: 12.5, color: 'text.secondary', mt: 1.5, lineHeight: 1.5 }}>
              {coverage
                ? `Based on ${checks.length} recorded checks since ${formatDateTime(coverage)}. Periods before that show no data; Settings sets how many days of history are kept.`
                : 'No checks recorded for this target yet.'}
              {maintenanceChecks > 0 && ` ${maintenanceChecks.toLocaleString()} ${maintenanceChecks === 1 ? 'check' : 'checks'} during maintenance windows ${maintenanceChecks === 1 ? "isn't" : "aren't"} counted.`}
            </Box>
          </PassSection>

          <PassSection label={`Outages${incidents.length ? ` · ${incidents.length}` : ''}`}>
            {incidents.length === 0 ? (
              <Box sx={{ fontSize: 14, color: 'text.secondary' }}>
                No outages in the recorded checks{coverage ? ` (since ${formatDateTime(coverage)})` : ''}.
              </Box>
            ) : (
              <Box sx={{ mx: -3, borderTop: '1px solid', borderColor: 'divider' }}>
                {incidents.map((inc) => (
                  <ButtonBase
                    key={inc.id}
                    onClick={() => { setOpenIncident(inc); setNoteInput(''); }}
                    sx={(theme) => ({
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      px: 3,
                      py: 1.25,
                      textAlign: 'left',
                      borderBottom: `1px solid ${(theme.vars || theme).palette.divider}`,
                      '&:hover': { backgroundColor: (theme.vars || theme).palette.action.hover },
                      '&:focus-visible': { outline: `2px solid ${(theme.vars || theme).palette.text.primary}`, outlineOffset: -2 },
                    })}
                  >
                    <Box
                      sx={{
                        ...mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', px: 0.75, lineHeight: '20px', borderRadius: '3px', flexShrink: 0, width: 76, textAlign: 'center',
                        backgroundColor: inc.end ? 'transparent' : signal.down,
                        color: inc.end ? 'text.secondary' : '#FFFFFF',
                        border: inc.end ? '1px solid' : 'none',
                        borderColor: 'divider',
                      }}
                    >
                      {inc.end ? 'RESOLVED' : 'ONGOING'}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ ...mono, fontSize: 13, fontWeight: 600 }}>
                        {formatDateTime(inc.start)} · {formatSpan(inc.durationMs)}
                      </Box>
                      <Box sx={{ fontSize: 12.5, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inc.failedChecks[inc.failedChecks.length - 1].message || 'Check failed'} · {inc.failedChecks.length} failed {inc.failedChecks.length === 1 ? 'check' : 'checks'}
                        {notes[inc.id]?.length ? ` · ${notes[inc.id].length} ${notes[inc.id].length === 1 ? 'note' : 'notes'}` : ''}
                      </Box>
                    </Box>
                    <ChevronRightRoundedIcon sx={{ color: 'text.secondary' }} />
                  </ButtonBase>
                ))}
              </Box>
            )}
          </PassSection>
        </Pass>
      )}

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
                {[...openIncident.failedChecks, ...(openIncident.recovery ? [openIncident.recovery] : [])].map((c, i) => (
                  <Box component="li" key={`${i}-${c.timestamp}`} sx={{ display: 'grid', gridTemplateColumns: '84px 64px 1fr', gap: 1.5, ...mono, fontSize: 13 }}>
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
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Notes appear in reports and scheduled report emails.</Typography>
              {(notes[openIncident.id] ?? []).map((n) => (
                <Box key={n.time} sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ ...mono, fontSize: 12, color: 'text.secondary' }}>{formatDateTime(new Date(n.time))}</Typography>
                    <Typography variant="body2" className="selectable" sx={{ whiteSpace: 'pre-wrap' }}>{n.text}</Typography>
                  </Box>
                  <IconButton size="small" aria-label="Delete note" onClick={() => { removeNote(n.time); }}>
                    <CloseRoundedIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
              {noteError && <Typography variant="body2" role="alert" sx={{ color: 'error.main', mt: 1 }}>{noteError}</Typography>}
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
                <Button variant="contained" size="small" onClick={() => { void addNote(); }} disabled={!noteInput.trim()}>
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
    </Workspace>
  );
}
