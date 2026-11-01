import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import DescriptionIcon from '@mui/icons-material/Description';
import { fonts, signal } from '../../shared-theme/themePrimitives';
import { CheckResult, formatClock } from '../home/boardModel';
import {
  Incident, WindowStats, checksFor, computeIncidents, coverageStart, daysAgo, fetchHistory, formatDateTime,
  formatPct, formatSpan, fromDateInput, toDateInput, windowStats, BACKEND_HISTORY_LIMIT,
} from '../historyStats';

const APP_VERSION = 'v0.4.0';
const mono = { fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' } as const;

interface Target {
  id: number;
  profileId: string;
  name: string;
  type: string;
  host: string;
}

interface Profile {
  id: string;
  name: string;
}

interface TargetReport {
  target: Target;
  stats: WindowStats;
  incidents: Incident[];
}

/** Sums per-target stats into one row for the whole scope. */
function totalOf(rows: TargetReport[]): WindowStats {
  const checks = rows.reduce((a, r) => a + r.stats.checks, 0);
  const failed = rows.reduce((a, r) => a + r.stats.failed, 0);
  const all = rows.flatMap((r) => r.incidents);
  const downtimeMs = rows.reduce((a, r) => a + r.stats.downtimeMs, 0);
  return {
    checks,
    failed,
    availability: checks ? ((checks - failed) / checks) * 100 : null,
    incidents: all.length,
    downtimeMs,
    longestMs: rows.reduce((a, r) => Math.max(a, r.stats.longestMs), 0),
    averageMs: all.length ? downtimeMs / all.length : 0,
  };
}

export default function ReportsTab() {
  const [profiles, setProfiles] = React.useState<Profile[]>([]);
  const [targets, setTargets] = React.useState<Target[]>([]);
  const [history, setHistory] = React.useState<CheckResult[]>([]);
  const [historyError, setHistoryError] = React.useState(false);
  const [now, setNow] = React.useState(() => new Date());

  // Form state
  const [scope, setScope] = React.useState<'profile' | 'target'>('profile');
  const [selectedProfileId, setSelectedProfileId] = React.useState<string>('');
  const [selectedTargetId, setSelectedTargetId] = React.useState<string>('all');
  const [fromDate, setFromDate] = React.useState(() => toDateInput(daysAgo(new Date(), 7)));
  const [toDate, setToDate] = React.useState(() => toDateInput(new Date()));
  const [reportTitle, setReportTitle] = React.useState('Uptime report');
  const [authorNotes, setAuthorNotes] = React.useState('');

  // Contents
  const [incTable, setIncTable] = React.useState(true);
  const [incOutages, setIncOutages] = React.useState(true);
  const [incCheckLog, setIncCheckLog] = React.useState(false);

  // Export dialog
  const [exportModal, setExportModal] = React.useState<{
    open: boolean;
    format: 'md' | 'txt' | 'pdf';
    fileName: string;
  } | null>(null);
  const [openImmediately, setOpenImmediately] = React.useState(true);

  React.useEffect(() => {
    try {
      const storedProfiles = localStorage.getItem('uptime_sentry_profiles');
      const storedTargets = localStorage.getItem('uptime_sentry_targets');
      const activeId = localStorage.getItem('uptime_sentry_active_id');
      if (storedProfiles) {
        const pList = JSON.parse(storedProfiles) as Profile[];
        setProfiles(pList);
        if (activeId && pList.some((p) => p.id === activeId)) setSelectedProfileId(activeId);
        else if (pList.length > 0) setSelectedProfileId(pList[0].id);
      }
      if (storedTargets) setTargets(JSON.parse(storedTargets) as Target[]);
    } catch (e) {
      console.error('Failed to load profiles/targets for reports:', e);
    }
    fetchHistory()
      .then((h) => { setHistory(h); setHistoryError(false); })
      .catch(() => { setHistoryError(true); })
      .finally(() => { setNow(new Date()); });
  }, []);

  const activeProfileObj = profiles.find((p) => p.id === selectedProfileId);
  const profileTargets = targets.filter((t) => t.profileId === selectedProfileId);
  const scopedTargets = scope === 'target' && selectedTargetId !== 'all'
    ? profileTargets.filter((t) => String(t.id) === selectedTargetId)
    : profileTargets;

  const from = fromDateInput(fromDate, 'start');
  const to = fromDateInput(toDate, 'end');
  const rangeValid = !!from && !!to && from <= to;

  const reports: TargetReport[] = React.useMemo(() => {
    if (!from || !to || from > to) return [];
    return scopedTargets.map((target) => {
      const checks = checksFor(history, target.id);
      const all = computeIncidents(checks, now);
      const inRange = all.filter((i) => i.start <= to && (i.end ?? now) >= from);
      return { target, stats: windowStats(checks, all, from, to, now), incidents: inRange };
    });
  }, [scopedTargets, history, from, to, now]);

  const total = totalOf(reports);
  const allOutages = reports.flatMap((r) => r.incidents).sort((a, b) => b.start.getTime() - a.start.getTime());
  const coverage = coverageStart(history.filter((h) => scopedTargets.some((t) => t.id === h.targetId)));
  const scopeLabel = scope === 'target' && selectedTargetId !== 'all'
    ? `Target: ${scopedTargets[0]?.name ?? 'unknown'}`
    : `Profile: ${activeProfileObj?.name ?? 'none'}`;
  const coverageNote = coverage
    ? `Figures are computed from ${total.checks} recorded checks in this range. Recorded history starts ${formatDateTime(coverage)}; the monitoring service keeps the latest ${BACKEND_HISTORY_LIMIT} checks across all targets, so earlier days show no data.`
    : 'No checks are recorded for these targets yet.';

  const generateMarkdownReport = () => {
    let md = `# ${reportTitle}\n\n`;
    md += `**Scope:** ${scopeLabel}\n`;
    md += `**Period:** ${fromDate} to ${toDate}\n`;
    md += `**Generated:** ${formatDateTime(new Date())} by Uptime Sentry ${APP_VERSION}\n\n`;
    if (authorNotes.trim()) md += `## Notes\n${authorNotes.trim()}\n\n`;
    if (incTable) {
      md += `## Availability\n\n`;
      md += `| Target | Availability | Checks OK | Downtime | Outages | Longest |\n| --- | --- | --- | --- | --- | --- |\n`;
      for (const r of reports) {
        md += `| ${r.target.name} | ${formatPct(r.stats.availability)} | ${r.stats.checks - r.stats.failed} / ${r.stats.checks} | ${formatSpan(r.stats.downtimeMs)} | ${r.stats.incidents} | ${formatSpan(r.stats.longestMs)} |\n`;
      }
      if (reports.length > 1) {
        md += `| **All targets** | **${formatPct(total.availability)}** | ${total.checks - total.failed} / ${total.checks} | ${formatSpan(total.downtimeMs)} | ${total.incidents} | ${formatSpan(total.longestMs)} |\n`;
      }
      md += `\n`;
    }
    if (incOutages) {
      md += `## Outages\n\n`;
      if (allOutages.length === 0) md += `No outages recorded in this period.\n\n`;
      for (const o of allOutages) {
        md += `### ${o.targetName} — ${formatDateTime(o.start)}\n`;
        md += `- **Ended:** ${o.end ? formatDateTime(o.end) : 'ongoing'} (${formatSpan(o.durationMs)})\n`;
        md += `- **Failed checks:** ${o.failedChecks.length}\n`;
        md += `- **Last error:** ${o.failedChecks[o.failedChecks.length - 1].message || 'Check failed'}\n`;
        if (incCheckLog) {
          for (const c of [...o.failedChecks, ...(o.recovery ? [o.recovery] : [])]) {
            md += `  - ${formatClock(c.timestamp)} ${c.success ? 'UP' : 'DOWN'} — ${c.message || (c.success ? 'ok' : 'failed')}\n`;
          }
        }
        md += `\n`;
      }
    }
    md += `---\n*${coverageNote}*\n`;
    return md;
  };

  const triggerOpenExportDialog = (format: 'md' | 'txt' | 'pdf') => {
    setExportModal({
      open: true,
      format,
      fileName: `UptimeSentry_Report_${fromDate}_to_${toDate}.${format}`,
    });
  };

  const handleConfirmSaveExport = async () => {
    if (!exportModal) return;

    if (exportModal.format === 'pdf') {
      setExportModal(null);
      setTimeout(() => { window.print(); }, 300);
      return;
    }

    const content = generateMarkdownReport();
    const ext = exportModal.format === 'md' ? 'md' : 'txt';
    const mimeType = exportModal.format === 'md' ? 'text/markdown' : 'text/plain';

    // Native desktop Save As dialog if supported
    if (typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function') {
      try {
        const handle = await (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<{ createWritable(): Promise<{ write(c: string): Promise<void>; close(): Promise<void> }> }> }).showSaveFilePicker({
          suggestedName: exportModal.fileName,
          types: [{
            description: exportModal.format === 'md' ? 'Markdown Document' : 'Plain Text Document',
            accept: { [mimeType]: [`.${ext}`] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        if (openImmediately) {
          const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
          window.open(URL.createObjectURL(blob), '_blank');
        }
        setExportModal(null);
        return;
      } catch (err: unknown) {
        if ((err as { name?: string }).name === 'AbortError') return; // user cancelled
      }
    }

    // Fallback browser download
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportModal.fileName;
    a.click();
    if (openImmediately) setTimeout(() => window.open(url, '_blank'), 100);
    setTimeout(() => { URL.revokeObjectURL(url); }, 1000);
    setExportModal(null);
  };

  const downTone = (theme: import('@mui/material/styles').Theme, low: boolean) => ({
    color: low ? signal.downInk : 'inherit',
    ...theme.applyStyles('dark', { color: low ? signal.downOnDark : 'inherit' }),
  });

  return (
    <Box sx={{ width: '100%', maxWidth: { sm: '100%', md: '1700px' } }}>
      {/* Print rules isolate the report document for PDF export */}
      <style>{`
        @media print {
          @page { margin: 12mm; size: portrait; }
          body, html { background: #ffffff !important; color: #0B0D10 !important; }
          .no-print, header, nav, aside, button { display: none !important; }
          .printable-report { width: 100% !important; max-width: 100% !important; flex-basis: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; }
          .printable-report * { color: #0B0D10 !important; background: transparent !important; border-color: #C8CBD0 !important; }
        }
      `}</style>

      <Grid container spacing={3}>
        {/* Report options */}
        <Grid size={{ xs: 12, md: 4 }} className="no-print">
          <Stack spacing={2.5}>
            <TextField label="Report title" size="small" fullWidth value={reportTitle} onChange={(e) => { setReportTitle(e.target.value); }} />

            <TextField select label="Scope" size="small" fullWidth value={scope} onChange={(e) => { setScope(e.target.value as 'profile' | 'target'); }}>
              <MenuItem value="profile">Entire profile</MenuItem>
              <MenuItem value="target">Single target</MenuItem>
            </TextField>

            <TextField select label="Profile" size="small" fullWidth value={selectedProfileId} onChange={(e) => { setSelectedProfileId(e.target.value); setSelectedTargetId('all'); }}>
              {profiles.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </TextField>

            {scope === 'target' && (
              <TextField select label="Target" size="small" fullWidth value={selectedTargetId} onChange={(e) => { setSelectedTargetId(e.target.value); }}>
                <MenuItem value="all">All targets in profile</MenuItem>
                {profileTargets.map((t) => <MenuItem key={t.id} value={String(t.id)}>{t.name}</MenuItem>)}
              </TextField>
            )}

            <Stack direction="row" spacing={1.5}>
              <TextField type="date" label="From" size="small" fullWidth value={fromDate} onChange={(e) => { setFromDate(e.target.value); }} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField type="date" label="To" size="small" fullWidth value={toDate} onChange={(e) => { setToDate(e.target.value); }} slotProps={{ inputLabel: { shrink: true } }} error={!rangeValid} helperText={rangeValid ? undefined : 'The end date is before the start date.'} />
            </Stack>

            <TextField
              label="Notes for readers"
              placeholder="Planned maintenance, known issues, actions taken…"
              multiline
              minRows={4}
              maxRows={12}
              size="small"
              fullWidth
              value={authorNotes}
              onChange={(e) => { setAuthorNotes(e.target.value); }}
              slotProps={{ inputLabel: { shrink: true } }}
            />

            <Divider />
            <Typography variant="overline" color="text.secondary">Contents</Typography>
            <Stack spacing={0.25} sx={{ mt: '-8px !important' }}>
              <FormControlLabel control={<Checkbox size="small" checked={incTable} onChange={(e) => { setIncTable(e.target.checked); }} />} label="Availability table" />
              <FormControlLabel control={<Checkbox size="small" checked={incOutages} onChange={(e) => { setIncOutages(e.target.checked); }} />} label="Outage list" />
              <FormControlLabel control={<Checkbox size="small" checked={incCheckLog} disabled={!incOutages} onChange={(e) => { setIncCheckLog(e.target.checked); }} />} label="Check log for each outage" />
            </Stack>

            <Divider />
            <Stack spacing={1}>
              <Button variant="contained" startIcon={<DownloadIcon />} onClick={() => { triggerOpenExportDialog('md'); }} disabled={!rangeValid}>
                Export Markdown (.md)
              </Button>
              <Button variant="outlined" startIcon={<DescriptionIcon />} onClick={() => { triggerOpenExportDialog('txt'); }} disabled={!rangeValid}>
                Export plain text (.txt)
              </Button>
              <Button variant="outlined" startIcon={<PrintIcon />} onClick={() => { triggerOpenExportDialog('pdf'); }} disabled={!rangeValid}>
                Print or save as PDF
              </Button>
            </Stack>
          </Stack>
        </Grid>

        {/* Live report preview */}
        <Grid size={{ xs: 12, md: 8 }} className="printable-report">
          <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: { xs: 2.5, md: 4 } }}>
            <Box sx={{ pb: 2, mb: 3, borderBottom: '2px solid', borderColor: 'text.primary' }}>
              <Typography component="h2" sx={{ fontSize: 30, fontWeight: 800, fontStretch: '72%', lineHeight: 1.1 }}>
                {reportTitle || 'Untitled report'}
              </Typography>
              <Typography sx={{ ...mono, fontSize: 13, color: 'text.secondary', mt: 0.75 }}>
                {scopeLabel} · {fromDate} to {toDate}
              </Typography>
            </Box>

            {historyError && (
              <Typography role="alert" variant="body2" sx={{ mb: 3 }}>
                Can't reach the monitoring service at 127.0.0.1:8765, so this report has no check data.
              </Typography>
            )}

            {authorNotes.trim() && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="overline" color="text.secondary">Notes</Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, maxWidth: '70ch' }}>{authorNotes.trim()}</Typography>
              </Box>
            )}

            {incTable && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="overline" color="text.secondary">Availability</Typography>
                {reports.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No targets in this scope.</Typography>
                ) : (
                  <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflowX: 'auto' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          {['Target', 'Availability', 'Checks OK', 'Downtime', 'Outages', 'Longest'].map((h) => (
                            <TableCell key={h}><Typography variant="overline" color="text.secondary">{h}</Typography></TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {reports.map((r) => (
                          <TableRow key={r.target.id}>
                            <TableCell sx={{ fontWeight: 600 }}>{r.target.name}</TableCell>
                            <TableCell sx={(theme) => ({ ...mono, fontWeight: 700, ...downTone(theme, r.stats.availability !== null && r.stats.availability < 100) })}>
                              {formatPct(r.stats.availability)}
                            </TableCell>
                            <TableCell sx={mono}>{r.stats.checks ? `${r.stats.checks - r.stats.failed} / ${r.stats.checks}` : '—'}</TableCell>
                            <TableCell sx={mono}>{formatSpan(r.stats.downtimeMs)}</TableCell>
                            <TableCell sx={mono}>{r.stats.incidents}</TableCell>
                            <TableCell sx={mono}>{formatSpan(r.stats.longestMs)}</TableCell>
                          </TableRow>
                        ))}
                        {reports.length > 1 && (
                          <TableRow sx={{ '& td': { borderTop: '2px solid', borderTopColor: 'divider', fontWeight: 700 } }}>
                            <TableCell>All targets</TableCell>
                            <TableCell sx={(theme) => ({ ...mono, ...downTone(theme, total.availability !== null && total.availability < 100) })}>{formatPct(total.availability)}</TableCell>
                            <TableCell sx={mono}>{total.checks ? `${total.checks - total.failed} / ${total.checks}` : '—'}</TableCell>
                            <TableCell sx={mono}>{formatSpan(total.downtimeMs)}</TableCell>
                            <TableCell sx={mono}>{total.incidents}</TableCell>
                            <TableCell sx={mono}>{formatSpan(total.longestMs)}</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Box>
                )}
              </Box>
            )}

            {incOutages && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="overline" color="text.secondary">Outages</Typography>
                {allOutages.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No outages recorded in this period.</Typography>
                ) : (
                  <Stack spacing={1.5}>
                    {allOutages.map((o) => (
                      <Box key={o.id} sx={{ py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
                        <Typography sx={{ fontWeight: 700 }}>
                          {o.targetName}
                          <Box component="span" sx={{ ...mono, fontWeight: 400, fontSize: 13, color: 'text.secondary', ml: 1 }}>
                            {formatDateTime(o.start)} → {o.end ? o.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : 'ongoing'} · {formatSpan(o.durationMs)}
                          </Box>
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {o.failedChecks.length} failed {o.failedChecks.length === 1 ? 'check' : 'checks'} · last error: {o.failedChecks[o.failedChecks.length - 1].message || 'Check failed'}
                        </Typography>
                        {incCheckLog && (
                          <Box component="ol" sx={{ listStyle: 'none', m: 0, mt: 1, p: 0 }}>
                            {[...o.failedChecks, ...(o.recovery ? [o.recovery] : [])].map((c) => (
                              <Box component="li" key={c.timestamp} sx={{ ...mono, fontSize: 12.5, display: 'grid', gridTemplateColumns: '76px 52px 1fr', gap: 1 }}>
                                <span>{formatClock(c.timestamp)}</span>
                                <span>{c.success ? 'UP' : 'DOWN'}</span>
                                <Box component="span" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>{c.message}</Box>
                              </Box>
                            ))}
                          </Box>
                        )}
                      </Box>
                    ))}
                  </Stack>
                )}
              </Box>
            )}

            <Divider sx={{ my: 3 }} />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.5 }}>
              {coverageNote}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Generated {formatDateTime(now)} by Uptime Sentry {APP_VERSION}
            </Typography>
          </Box>
        </Grid>
      </Grid>

      {/* Export dialog */}
      {exportModal && (
        <Dialog open={exportModal.open} onClose={() => { setExportModal(null); }} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ fontWeight: 700 }}>
            {exportModal.format === 'pdf' ? 'Print or save as PDF' : `Save report (.${exportModal.format})`}
          </DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {exportModal.format !== 'pdf' && (
              <>
                <TextField
                  label="File name"
                  size="small"
                  fullWidth
                  value={exportModal.fileName}
                  onChange={(e) => { setExportModal({ ...exportModal, fileName: e.target.value }); }}
                  sx={{ mt: 1 }}
                />
                <FormControlLabel
                  control={<Checkbox checked={openImmediately} onChange={(e) => { setOpenImmediately(e.target.checked); }} />}
                  label="Open the file after saving"
                />
              </>
            )}
            {exportModal.format === 'pdf' && (
              <Typography variant="body2" color="text.secondary">
                Opens the print dialog with just the report. Choose “Save as PDF” as the printer to create a file.
              </Typography>
            )}
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button variant="outlined" onClick={() => { setExportModal(null); }}>Cancel</Button>
            <Button variant="contained" startIcon={exportModal.format === 'pdf' ? <PrintIcon /> : <DownloadIcon />} onClick={() => { void handleConfirmSaveExport(); }}>
              {exportModal.format === 'pdf' ? 'Open print dialog' : 'Save'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}
