import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import CircularProgress from '@mui/material/CircularProgress';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import DescriptionIcon from '@mui/icons-material/Description';
import { Theme } from '@mui/material/styles';
import { fonts, gray, ink, signal } from '../../shared-theme/themePrimitives';
import { IndexHeader, Label, Tag } from './workspace';
import { CheckResult, formatClock } from '../home/boardModel';
import {
  daysAgo, fetchHistory, formatDateTime, formatPct, formatSpan, fromDateInput, toDateInput,
} from '../historyStats';
import {
  TargetFigures, allowedDowntimeMs, daysBetween, figuresFor, formatDelta, formatMs, reportTargets, responseByDay, totals,
} from '../reportModel';
import { DowntimeBars, ResponseChart, UptimeStrip } from './ReportCharts';

const APP_VERSION = 'v0.5.1';
const mono = { fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' } as const;
const SLA_OPTIONS = [99, 99.5, 99.9, 99.95, 99.99];

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

type Preset = '7d' | '30d' | 'month' | 'lastMonth' | 'custom';

function presetRange(p: Preset, now: Date): { from: string; to: string } | null {
  switch (p) {
    case '7d': return { from: toDateInput(daysAgo(now, 6)), to: toDateInput(now) };
    case '30d': return { from: toDateInput(daysAgo(now, 29)), to: toDateInput(now) };
    case 'month': return { from: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)), to: toDateInput(now) };
    case 'lastMonth': return {
      from: toDateInput(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: toDateInput(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
    default: return null;
  }
}

interface Contents {
  summary: boolean;
  uptimeChart: boolean;
  responseChart: boolean;
  downtimeChart: boolean;
  table: boolean;
  compare: boolean;
  outages: boolean;
  checkLog: boolean;
}

const CONTENT_OPTIONS: { key: keyof Contents; label: string; group: 'Figures' | 'Charts' | 'Details' }[] = [
  { key: 'summary', label: 'Summary figures', group: 'Figures' },
  { key: 'table', label: 'Per-target table', group: 'Figures' },
  { key: 'compare', label: 'Compare with previous period', group: 'Figures' },
  { key: 'uptimeChart', label: 'Daily uptime bars', group: 'Charts' },
  { key: 'responseChart', label: 'Response time chart', group: 'Charts' },
  { key: 'downtimeChart', label: 'Downtime by target', group: 'Charts' },
  { key: 'outages', label: 'Outage list with causes', group: 'Details' },
  { key: 'checkLog', label: 'Check log for each outage', group: 'Details' },
];

const DEFAULT_CONTENTS: Contents = {
  summary: true, uptimeChart: true, responseChart: true, downtimeChart: true, table: true, compare: true, outages: true, checkLog: false,
};

const OPTIONS_KEY = 'uptime_sentry_report_options';

interface StoredOptions {
  contents: Contents;
  /** 'off', one of SLA_OPTIONS as text, or 'custom'. */
  slaChoice: string;
  slaCustom: string;
  includeRemoved: boolean;
}

function loadOptions(): StoredOptions {
  try {
    const raw = JSON.parse(localStorage.getItem(OPTIONS_KEY) || '{}') as Partial<StoredOptions & { sla: number }>;
    // Older versions stored a plain number.
    const legacy = typeof raw.sla === 'number' ? raw.sla : null;
    const legacyChoice = legacy === null ? null : SLA_OPTIONS.includes(legacy) ? String(legacy) : 'custom';
    return {
      contents: { ...DEFAULT_CONTENTS, ...raw.contents },
      slaChoice: raw.slaChoice ?? legacyChoice ?? '99.9',
      slaCustom: raw.slaCustom ?? (legacyChoice === 'custom' ? String(legacy) : '99.8'),
      includeRemoved: raw.includeRemoved ?? true,
    };
  } catch {
    return { contents: DEFAULT_CONTENTS, slaChoice: '99.9', slaCustom: '99.8', includeRemoved: true };
  }
}

/** The SLA as a percentage, or null when switched off or the custom value isn't a number in (0, 100]. */
function slaValue(choice: string, custom: string): number | null {
  if (choice === 'off') return null;
  const v = Number((choice === 'custom' ? custom : choice).replace(',', '.'));
  return Number.isFinite(v) && v > 0 && v <= 100 ? v : null;
}

const downTone = (theme: Theme, low: boolean) => ({
  color: low ? signal.downInk : 'inherit',
  ...theme.applyStyles('dark', { color: low ? signal.downOnDark : 'inherit' }),
});

/** Section of the printed report: mono caps label over a 2px rule. */
function ReportSection({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  const id = React.useId();
  return (
    <Box component="section" aria-labelledby={id} sx={{ mb: 4, breakInside: 'avoid-page' }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2, pb: 0.75, mb: 1.75, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box component="h3" id={id} sx={{ m: 0 }}><Label>{title}</Label></Box>
        {aside && <Box sx={{ ...mono, fontSize: 12, color: 'text.secondary' }}>{aside}</Box>}
      </Box>
      {children}
    </Box>
  );
}

/** A headline figure: label, big value, one line of context. */
function Kpi({ label, value, sub, alert }: { label: string; value: string; sub?: React.ReactNode; alert?: boolean }) {
  return (
    <Box sx={{ py: 1.5, px: 2, borderTop: '2px solid', borderColor: alert ? signal.down : 'text.primary', minWidth: 0 }}>
      <Label>{label}</Label>
      <Typography sx={(theme) => ({ ...mono, fontSize: 26, fontWeight: 700, lineHeight: 1.2, mt: 0.5, ...downTone(theme, !!alert) })}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.25 }}>{sub}</Typography>}
    </Box>
  );
}

const th = { ...mono, fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'text.secondary', textAlign: 'left' as const, py: 1, px: 1.25, borderBottom: '2px solid', borderColor: 'text.primary', whiteSpace: 'nowrap' as const };
const td = { py: 1, px: 1.25, borderBottom: '1px solid', borderColor: 'divider', fontSize: 13.5, verticalAlign: 'top' as const };
const tdNum = { ...td, ...mono, fontSize: 13, whiteSpace: 'nowrap' as const, textAlign: 'right' as const };

export default function ReportsTab() {
  const initial = React.useMemo(loadOptions, []);
  const [profiles, setProfiles] = React.useState<Profile[]>([]);
  const [targets, setTargets] = React.useState<Target[]>([]);
  const [history, setHistory] = React.useState<CheckResult[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [historyError, setHistoryError] = React.useState(false);
  const [now, setNow] = React.useState(() => new Date());

  // Form state
  const [scope, setScope] = React.useState<'profile' | 'target'>('profile');
  const [selectedProfileId, setSelectedProfileId] = React.useState<string>('');
  const [selectedTargetId, setSelectedTargetId] = React.useState<string>('all');
  const [preset, setPreset] = React.useState<Preset>('7d');
  const [fromDate, setFromDate] = React.useState(() => presetRange('7d', new Date())!.from);
  const [toDate, setToDate] = React.useState(() => presetRange('7d', new Date())!.to);
  const [reportTitle, setReportTitle] = React.useState('Uptime report');
  const [authorNotes, setAuthorNotes] = React.useState('');
  const [slaChoice, setSlaChoice] = React.useState(initial.slaChoice);
  const [slaCustom, setSlaCustom] = React.useState(initial.slaCustom);
  const sla = slaValue(slaChoice, slaCustom);
  const customInvalid = slaChoice === 'custom' && sla === null;
  const [includeRemoved, setIncludeRemoved] = React.useState(initial.includeRemoved);
  const [contents, setContents] = React.useState<Contents>(initial.contents);

  // Export dialog
  const [exportModal, setExportModal] = React.useState<{ open: boolean; format: 'md' | 'txt' | 'pdf'; fileName: string } | null>(null);
  const [openImmediately, setOpenImmediately] = React.useState(true);

  React.useEffect(() => {
    try { localStorage.setItem(OPTIONS_KEY, JSON.stringify({ contents, slaChoice, slaCustom, includeRemoved })); } catch { /* storage unavailable */ }
  }, [contents, slaChoice, slaCustom, includeRemoved]);

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
  }, []);

  const from = fromDateInput(fromDate, 'start');
  const to = fromDateInput(toDate, 'end');
  const rangeValid = !!from && !!to && from <= to;

  // Fetch the period plus the one before it (for the comparison). Debounced while dates are typed.
  React.useEffect(() => {
    if (!from || !to || from > to) return;
    const span = to.getTime() - from.getTime();
    const since = new Date(from.getTime() - span - 1);
    setLoading(true);
    const timer = setTimeout(() => {
      fetchHistory({ since, until: to })
        .then((h) => { setHistory(h); setHistoryError(false); })
        .catch(() => { setHistoryError(true); })
        .finally(() => { setNow(new Date()); setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- from/to are derived from these strings
  }, [fromDate, toDate]);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    const r = presetRange(p, new Date());
    if (r) { setFromDate(r.from); setToDate(r.to); }
  };

  const activeProfileObj = profiles.find((p) => p.id === selectedProfileId);
  const profileTargets = targets.filter((t) => t.profileId === selectedProfileId);
  const singleTarget = scope === 'target' && selectedTargetId !== 'all';

  const scoped = React.useMemo(() => {
    const allIds = new Set(targets.map((t) => t.id));
    const current = singleTarget ? profileTargets.filter((t) => String(t.id) === selectedTargetId) : profileTargets;
    return reportTargets(current, allIds, history, activeProfileObj?.name, includeRemoved && !singleTarget);
  }, [targets, profileTargets, selectedTargetId, singleTarget, history, activeProfileObj, includeRemoved]);

  const rows: TargetFigures[] = React.useMemo(() => {
    if (!from || !to || from > to) return [];
    return scoped.map((t) => figuresFor(t, history, from, to, now))
      // A removed target is only worth a row when it has checks in this period.
      .filter((r) => !r.target.removed || r.stats.checks > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- from/to are derived from the date strings
  }, [scoped, history, fromDate, toDate, now]);

  // Keyed on the date strings: `from`/`to` are new Date objects on every render.
  const total = React.useMemo(() => (from && to ? totals(rows, history, from, to) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, history, fromDate, toDate]);
  const days = React.useMemo(() => (from && to && from <= to ? daysBetween(from, to < now ? to : now) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fromDate, toDate, now]);
  const responseDays = React.useMemo(() => responseByDay(history, new Set(rows.map((r) => r.target.id)), days), [history, rows, days]);

  const allOutages = rows.flatMap((r) => r.incidents.map((i) => ({ ...i, removed: r.target.removed }))).sort((a, b) => b.start.getTime() - a.start.getTime());
  const removedCount = rows.filter((r) => r.target.removed).length;
  const periodEnd = to && to < now ? to : now;
  const spanMs = from ? Math.max(0, periodEnd.getTime() - from.getTime()) : 0;
  const allowedMs = sla === null ? 0 : allowedDowntimeMs(sla, spanMs);
  const metCount = sla === null ? 0 : rows.filter((r) => r.stats.availability !== null && r.stats.availability >= sla).length;
  const withOutages = rows.filter((r) => r.stats.incidents > 0).length;
  const measured = rows.filter((r) => r.stats.availability !== null).length;
  const slaMet = sla !== null && total?.availability !== null && total?.availability !== undefined && total.availability >= sla;
  const earliest = rows.reduce<Date | null>((m, r) => (r.firstCheck && (!m || r.firstCheck < m) ? r.firstCheck : m), null);
  const partialCoverage = !!(earliest && from && earliest > from);

  const scopeLabel = singleTarget
    ? `Target: ${scoped[0]?.name ?? 'unknown'}`
    : `Profile: ${activeProfileObj?.name ?? 'none'}`;
  const periodLabel = `${fromDate} to ${toDate}`;
  const coverageNote = total && total.checks
    ? `Availability is the share of successful checks; downtime runs from the first failed check of an outage to the next successful one. ${total.checks.toLocaleString()} checks were recorded in this period${partialCoverage && earliest ? `, the first on ${formatDateTime(earliest)}, so days before that show no data` : ''}. Settings sets how many days of history are kept.`
    : 'No checks are recorded for these targets in this period.';

  const toggle = (key: keyof Contents) => (e: React.ChangeEvent<HTMLInputElement>) => { setContents((c) => ({ ...c, [key]: e.target.checked })); };

  // ── Text export ──────────────────────────────────────────────────────────────
  const generateMarkdownReport = () => {
    const t = total;
    let md = `# ${reportTitle}\n\n`;
    md += `**Scope:** ${scopeLabel}  \n**Period:** ${periodLabel}  \n${sla !== null ? `**SLA target:** ${sla}%  \n` : ''}`;
    md += `**Generated:** ${formatDateTime(new Date())} by Uptime Sentry ${APP_VERSION}\n\n`;
    if (authorNotes.trim()) md += `## Notes\n\n${authorNotes.trim()}\n\n`;
    if (contents.summary && t) {
      md += `## Summary\n\n`;
      md += `| Figure | Value |\n| --- | --- |\n`;
      md += `| Availability | ${formatPct(t.availability)}${sla !== null ? ` (${slaMet ? 'meets' : 'misses'} the ${sla}% SLA)` : ''} |\n`;
      md += `| Downtime | ${formatSpan(t.downtimeMs)}${sla !== null ? ` (SLA allows ${formatSpan(allowedMs)} per target)` : ''} |\n`;
      md += `| Outages | ${t.incidents} |\n`;
      md += `| Longest outage | ${formatSpan(t.longestMs)} |\n`;
      md += `| Mean time to recovery | ${t.mttrMs === null ? '—' : formatSpan(t.mttrMs)} |\n`;
      md += `| Response time (avg / p95) | ${formatMs(t.response.avg)} / ${formatMs(t.response.p95)} |\n`;
      md += `| Checks | ${t.checks.toLocaleString()} (${t.failed} failed) |\n`;
      md += sla !== null ? `| Targets meeting SLA | ${metCount} of ${measured} |\n` : `| Targets with outages | ${withOutages} of ${rows.length} |\n`;
      if (contents.compare && t.previousAvailability !== null) {
        md += `| Previous period availability | ${formatPct(t.previousAvailability)} (${formatDelta(t.availability, t.previousAvailability)}) |\n`;
      }
      md += `\n`;
    }
    if (contents.table) {
      md += `## Targets\n\n`;
      md += `| Target | Availability |${sla !== null ? ' SLA |' : ''} Downtime | Outages | MTTR | Avg response | p95 | Checks |${contents.compare ? ' vs previous |' : ''}\n`;
      md += `| --- | --- |${sla !== null ? ' --- |' : ''} --- | --- | --- | --- | --- | --- |${contents.compare ? ' --- |' : ''}\n`;
      for (const r of rows) {
        const meets = sla === null ? '' : r.stats.availability === null ? ' — |' : r.stats.availability >= sla ? ' met |' : ' missed |';
        md += `| ${r.target.name}${r.target.removed ? ' (removed)' : ''} | ${formatPct(r.stats.availability)} |${meets} ${formatSpan(r.stats.downtimeMs)} | ${r.stats.incidents} | ${r.mttrMs === null ? '—' : formatSpan(r.mttrMs)} | ${formatMs(r.response.avg)} | ${formatMs(r.response.p95)} | ${r.stats.checks} |`;
        if (contents.compare) md += ` ${formatDelta(r.stats.availability, r.previous?.availability ?? null) || '—'} |`;
        md += `\n`;
      }
      md += `\n`;
    }
    if (contents.uptimeChart && rows.length) {
      md += `## Daily availability\n\n| Day | ${rows.map((r) => r.target.name).join(' | ')} |\n| --- |${rows.map(() => ' --- |').join('')}\n`;
      days.forEach((d, i) => {
        md += `| ${toDateInput(d)} | ${rows.map((r) => formatPct(r.days[i]?.availability ?? null)).join(' | ')} |\n`;
      });
      md += `\n`;
    }
    if (contents.responseChart) {
      md += `## Response time per day\n\n| Day | Average | p95 |\n| --- | --- | --- |\n`;
      for (const d of responseDays) md += `| ${toDateInput(d.day)} | ${formatMs(d.avgMs)} | ${formatMs(d.p95Ms)} |\n`;
      md += `\n`;
    }
    if (contents.outages) {
      md += `## Outages\n\n`;
      if (allOutages.length === 0) md += `No outages recorded in this period.\n\n`;
      for (const o of allOutages) {
        md += `### ${o.targetName} — ${formatDateTime(o.start)}\n`;
        md += `- **Ended:** ${o.end ? formatDateTime(o.end) : 'ongoing'} (${formatSpan(o.durationMs)})\n`;
        md += `- **Failed checks:** ${o.failedChecks.length}\n`;
        md += `- **Cause:** ${o.failedChecks[o.failedChecks.length - 1].message || 'Check failed'}\n`;
        if (contents.checkLog) {
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
    setExportModal({ open: true, format, fileName: `UptimeSentry_Report_${fromDate}_to_${toDate}.${format}` });
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
          types: [{ description: exportModal.format === 'md' ? 'Markdown Document' : 'Plain Text Document', accept: { [mimeType]: [`.${ext}`] } }],
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

  const groups = ['Figures', 'Charts', 'Details'] as const;

  return (
    <Box sx={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0 }}>
      {/* Print rules isolate the report document for PDF export */}
      <style>{`
        @media print {
          @page { margin: 12mm; size: portrait; }
          body, html { background: #ffffff !important; color: #0B0D10 !important; }
          .no-print, header, nav, aside, button { display: none !important; }
          .report-scroll { overflow: visible !important; padding: 0 !important; background: #ffffff !important; }
          .printable-report { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; border: none !important; box-shadow: none !important; background: #ffffff !important; color: #0B0D10 !important; }
          .printable-report * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* Report options */}
      <Box
        component="nav"
        aria-label="Report options"
        className="no-print"
        sx={(theme) => ({
          width: { xs: 300, lg: 360 },
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          backgroundColor: '#FFFFFF',
          borderRight: `1px solid ${(theme.vars || theme).palette.divider}`,
          ...theme.applyStyles('dark', { backgroundColor: ink }),
        })}
      >
        <IndexHeader title="Report options" />
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2.5 }}>
          <Stack spacing={2.5}>
            <TextField label="Report title" size="small" fullWidth value={reportTitle} onChange={(e) => { setReportTitle(e.target.value); }} />

            <Stack direction="row" spacing={1.5}>
              <TextField select label="Scope" size="small" fullWidth value={scope} onChange={(e) => { setScope(e.target.value as 'profile' | 'target'); }}>
                <MenuItem value="profile">Entire profile</MenuItem>
                <MenuItem value="target">Single target</MenuItem>
              </TextField>
              <TextField select label="Profile" size="small" fullWidth value={selectedProfileId} onChange={(e) => { setSelectedProfileId(e.target.value); setSelectedTargetId('all'); }}>
                {profiles.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
              </TextField>
            </Stack>

            {scope === 'target' && (
              <TextField select label="Target" size="small" fullWidth value={selectedTargetId} onChange={(e) => { setSelectedTargetId(e.target.value); }}>
                <MenuItem value="all">All targets in profile</MenuItem>
                {profileTargets.map((t) => <MenuItem key={t.id} value={String(t.id)}>{t.name}</MenuItem>)}
              </TextField>
            )}

            <TextField select label="Period" size="small" fullWidth value={preset} onChange={(e) => { applyPreset(e.target.value as Preset); }}>
              <MenuItem value="7d">Last 7 days</MenuItem>
              <MenuItem value="30d">Last 30 days</MenuItem>
              <MenuItem value="month">This month</MenuItem>
              <MenuItem value="lastMonth">Last month</MenuItem>
              <MenuItem value="custom">Custom dates</MenuItem>
            </TextField>
            {preset === 'custom' && (
              <Stack direction="row" spacing={1.5}>
                <TextField type="date" label="From" size="small" fullWidth value={fromDate} onChange={(e) => { setFromDate(e.target.value); }} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField type="date" label="To" size="small" fullWidth value={toDate} onChange={(e) => { setToDate(e.target.value); }} slotProps={{ inputLabel: { shrink: true } }} error={!rangeValid} helperText={rangeValid ? undefined : 'The end date is before the start date.'} />
              </Stack>
            )}

            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
              <TextField
                select
                label="SLA target"
                size="small"
                fullWidth
                value={slaChoice}
                onChange={(e) => { setSlaChoice(e.target.value); }}
                helperText={sla !== null
                  ? `Allows ${formatSpan(allowedMs)} of downtime per target in this period.`
                  : slaChoice === 'off' ? 'The report shows availability without judging it.' : undefined}
              >
                <MenuItem value="off">No SLA</MenuItem>
                {SLA_OPTIONS.map((v) => <MenuItem key={v} value={String(v)}>{v}% availability</MenuItem>)}
                <MenuItem value="custom">Custom…</MenuItem>
              </TextField>
              {slaChoice === 'custom' && (
                <TextField
                  label="Percent"
                  size="small"
                  value={slaCustom}
                  onChange={(e) => { setSlaCustom(e.target.value); }}
                  error={customInvalid}
                  helperText={customInvalid ? '0–100' : undefined}
                  slotProps={{ htmlInput: { inputMode: 'decimal', 'aria-label': 'Custom SLA percent' } }}
                  sx={{ width: 110, flexShrink: 0 }}
                />
              )}
            </Stack>

            <FormControlLabel
              control={<Checkbox size="small" checked={includeRemoved} disabled={singleTarget} onChange={(e) => { setIncludeRemoved(e.target.checked); }} />}
              label={
                <Box>
                  <Box sx={{ fontSize: 14 }}>Include removed targets</Box>
                  <Box sx={{ fontSize: 12.5, color: 'text.secondary' }}>Deleted targets that still have checks in this period.</Box>
                </Box>
              }
              sx={{ alignItems: 'flex-start', '& .MuiCheckbox-root': { mt: -0.5 } }}
            />

            <TextField
              label="Notes for readers"
              placeholder="Planned maintenance, known issues, actions taken…"
              multiline
              minRows={3}
              maxRows={10}
              size="small"
              fullWidth
              value={authorNotes}
              onChange={(e) => { setAuthorNotes(e.target.value); }}
              slotProps={{ inputLabel: { shrink: true } }}
            />

            {groups.map((g) => (
              <Box key={g} sx={{ borderTop: '1px dashed', borderColor: 'divider', pt: 1.5 }}>
                <Label>{g}</Label>
                <Stack sx={{ mt: 0.5 }}>
                  {CONTENT_OPTIONS.filter((o) => o.group === g).map((o) => (
                    <FormControlLabel
                      key={o.key}
                      control={<Checkbox size="small" checked={contents[o.key]} disabled={o.key === 'checkLog' && !contents.outages} onChange={toggle(o.key)} />}
                      label={o.label}
                      sx={{ '& .MuiFormControlLabel-label': { fontSize: 14 } }}
                    />
                  ))}
                </Stack>
              </Box>
            ))}

            <Stack spacing={1} sx={{ borderTop: '1px dashed', borderColor: 'divider', pt: 2 }}>
              <Button variant="contained" startIcon={<PrintIcon />} onClick={() => { triggerOpenExportDialog('pdf'); }} disabled={!rangeValid}>
                Print or save as PDF
              </Button>
              <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => { triggerOpenExportDialog('md'); }} disabled={!rangeValid}>
                Export Markdown (.md)
              </Button>
              <Button variant="outlined" startIcon={<DescriptionIcon />} onClick={() => { triggerOpenExportDialog('txt'); }} disabled={!rangeValid}>
                Export plain text (.txt)
              </Button>
            </Stack>
          </Stack>
        </Box>
      </Box>

      {/* Live report preview */}
      <Box
        className="report-scroll"
        sx={(theme) => ({
          flex: 1,
          minWidth: 0,
          overflow: 'auto',
          p: { xs: 2, md: 3 },
          backgroundColor: gray[200],
          ...theme.applyStyles('dark', { backgroundColor: gray[900] }),
        })}
      >
        <Box
          className="printable-report selectable"
          sx={(theme) => ({
            maxWidth: 960,
            mx: 'auto',
            backgroundColor: '#FFFFFF',
            border: `1px solid ${(theme.vars || theme).palette.divider}`,
            borderRadius: 2.5,
            boxShadow: 'var(--template-palette-baseShadow)',
            p: { xs: 2.5, md: 4.5 },
            ...theme.applyStyles('dark', { backgroundColor: ink }),
          })}
        >
          {/* Masthead */}
          <Box sx={{ pb: 2.5, mb: 3.5, borderBottom: '3px solid', borderColor: 'text.primary', display: 'flex', justifyContent: 'space-between', gap: 3, flexWrap: 'wrap' }}>
            <Box sx={{ minWidth: 0 }}>
              <Label>Uptime Sentry · availability report</Label>
              <Typography component="h2" sx={{ fontSize: 34, fontWeight: 800, fontStretch: '72%', lineHeight: 1.05, mt: 0.75 }}>
                {reportTitle || 'Untitled report'}
              </Typography>
            </Box>
            <Box component="dl" sx={{ ...mono, fontSize: 12.5, m: 0, display: 'grid', gridTemplateColumns: 'auto auto', columnGap: 2, rowGap: 0.25, alignContent: 'end', '& dt': { color: 'text.secondary' }, '& dd': { m: 0 } }}>
              <dt>Scope</dt><dd>{scopeLabel.replace(/^(Profile|Target): /, '')}</dd>
              <dt>Period</dt><dd>{periodLabel}</dd>
              {sla !== null && <><dt>SLA</dt><dd>{sla}%</dd></>}
              <dt>Created</dt><dd>{formatDateTime(now)}</dd>
            </Box>
          </Box>

          {historyError && (
            <Typography role="alert" variant="body2" sx={{ mb: 3 }}>
              Can&apos;t reach the monitoring service at 127.0.0.1:8765, so this report has no check data.
            </Typography>
          )}
          {loading && (
            <Stack direction="row" spacing={1} className="no-print" sx={{ alignItems: 'center', mb: 2, color: 'text.secondary' }}>
              <CircularProgress size={14} color="inherit" />
              <Typography variant="body2">Loading checks…</Typography>
            </Stack>
          )}

          {authorNotes.trim() && (
            <ReportSection title="Notes">
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, maxWidth: '72ch' }}>{authorNotes.trim()}</Typography>
            </ReportSection>
          )}

          {contents.summary && total && (
            <ReportSection title="Summary" aside={`${rows.length} ${rows.length === 1 ? 'target' : 'targets'}${removedCount ? ` · ${removedCount} removed` : ''}`}>
              <Typography sx={{ fontSize: 15, lineHeight: 1.6, mb: 2.5, maxWidth: '75ch' }}>
                {total.availability === null
                  ? 'No checks were recorded for this scope in the selected period.'
                  : <>
                      Availability was <strong>{formatPct(total.availability)}</strong>
                      {sla !== null
                        ? <>, which <strong>{slaMet ? 'meets' : 'misses'}</strong> the {sla}% target. {metCount} of {measured} {measured === 1 ? 'target' : 'targets'} met it on their own.{' '}</>
                        : <>.{' '}</>}
                      {total.incidents === 0
                        ? 'There were no outages.'
                        : <>There {total.incidents === 1 ? 'was 1 outage' : `were ${total.incidents} outages`} with {formatSpan(total.downtimeMs)} of downtime in total; the longest lasted {formatSpan(total.longestMs)}.</>}
                      {contents.compare && total.previousAvailability !== null && <> Previous period: {formatPct(total.previousAvailability)} ({formatDelta(total.availability, total.previousAvailability)}).</>}
                    </>}
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, columnGap: 2, rowGap: 1 }}>
                <Kpi
                  label="Availability"
                  value={formatPct(total.availability)}
                  alert={sla !== null && total.availability !== null && !slaMet}
                  sub={total.availability === null ? 'no data' : [
                    sla !== null ? `${slaMet ? 'Meets' : 'Misses'} ${sla}% SLA` : 'share of successful checks',
                    contents.compare && total.previousAvailability !== null ? formatDelta(total.availability, total.previousAvailability) : '',
                  ].filter(Boolean).join(' · ')}
                />
                <Kpi
                  label="Downtime"
                  value={formatSpan(total.downtimeMs)}
                  sub={contents.compare && total.previousAvailability !== null ? `previous ${formatSpan(total.previousDowntimeMs)}` : sla !== null ? `budget ${formatSpan(allowedMs)} per target` : 'all targets together'}
                />
                <Kpi
                  label="Outages"
                  value={String(total.incidents)}
                  sub={total.incidents ? `longest ${formatSpan(total.longestMs)}` : contents.compare && total.previousAvailability !== null ? `previous ${total.previousIncidents}` : 'none recorded'}
                />
                <Kpi label="Recovery (MTTR)" value={total.mttrMs === null ? '—' : formatSpan(total.mttrMs)} sub="average outage length" />
                <Kpi label="Avg response" value={formatMs(total.response.avg)} sub={`p95 ${formatMs(total.response.p95)}`} />
                <Kpi label="Fastest response" value={formatMs(total.response.min)} sub={`slowest ${formatMs(total.response.max)}`} />
                <Kpi label="Checks" value={total.checks.toLocaleString()} sub={`${total.failed.toLocaleString()} failed`} />
                {sla !== null
                  ? <Kpi label="Targets meeting SLA" value={`${metCount} / ${measured}`} alert={measured > 0 && metCount < measured} sub={measured ? `${measured - metCount} below ${sla}%` : 'no data'} />
                  : <Kpi label="Targets with outages" value={`${withOutages} / ${rows.length}`} sub={withOutages ? 'had at least one outage' : 'none had an outage'} />}
              </Box>
            </ReportSection>
          )}

          {contents.uptimeChart && rows.length > 0 && (
            <ReportSection title="Daily uptime" aside="one bar per day">
              <UptimeStrip rows={rows.map((r) => ({ id: r.target.id, name: r.target.name, removed: r.target.removed, days: r.days }))} sla={sla} />
            </ReportSection>
          )}

          {contents.responseChart && rows.length > 0 && (
            <ReportSection title="Response time" aside="successful checks, all targets">
              <ResponseChart days={responseDays} />
            </ReportSection>
          )}

          {contents.downtimeChart && rows.length > 1 && (
            <ReportSection title="Downtime by target">
              <DowntimeBars rows={rows.map((r) => ({ id: r.target.id, name: r.target.name, downtimeMs: r.stats.downtimeMs, incidents: r.stats.incidents }))} />
            </ReportSection>
          )}

          {contents.table && (
            <ReportSection title="Targets">
              {rows.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No targets in this scope.</Typography>
              ) : (
                <Box sx={{ overflowX: 'auto' }}>
                  <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Target', 'Availability', 'Downtime', 'Outages', 'MTTR', 'Avg resp.', 'p95', 'Checks', ...(contents.compare ? ['vs prev.'] : [])].map((h, i) => (
                          <Box component="th" key={h} scope="col" sx={{ ...th, textAlign: i === 0 ? 'left' : 'right' }}>{h}</Box>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const missed = sla !== null && r.stats.availability !== null && r.stats.availability < sla;
                        return (
                          <tr key={r.target.id}>
                            <Box component="td" sx={{ ...td, minWidth: 180, maxWidth: 280 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                <Box component="span" sx={{ fontWeight: 600, color: r.target.removed ? 'text.secondary' : 'text.primary' }}>{r.target.name}</Box>
                                {r.target.removed && <Tag>REMOVED</Tag>}
                              </Box>
                              {r.target.host && (
                                <Box title={r.target.host} sx={{ ...mono, fontSize: 11.5, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {r.target.type ? `${r.target.type} · ` : ''}{r.target.host}
                                </Box>
                              )}
                            </Box>
                            <Box component="td" sx={(theme) => ({ ...tdNum, textAlign: 'right', ...downTone(theme, missed) })}>
                              <Box sx={{ fontWeight: 700 }}>{formatPct(r.stats.availability)}</Box>
                              {sla !== null && r.stats.availability !== null && <Box sx={{ fontSize: 11.5, fontWeight: 400 }}>{missed ? `below ${sla}%` : 'meets SLA'}</Box>}
                            </Box>
                            <Box component="td" sx={tdNum}>{formatSpan(r.stats.downtimeMs)}</Box>
                            <Box component="td" sx={tdNum}>{r.stats.incidents}</Box>
                            <Box component="td" sx={tdNum}>{r.mttrMs === null ? '—' : formatSpan(r.mttrMs)}</Box>
                            <Box component="td" sx={tdNum}>{formatMs(r.response.avg)}</Box>
                            <Box component="td" sx={tdNum}>{formatMs(r.response.p95)}</Box>
                            <Box component="td" sx={tdNum}>{r.stats.checks.toLocaleString()}</Box>
                            {contents.compare && <Box component="td" sx={{ ...tdNum, color: 'text.secondary' }}>{formatDelta(r.stats.availability, r.previous?.availability ?? null) || '—'}</Box>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </Box>
                </Box>
              )}
            </ReportSection>
          )}

          {contents.outages && (
            <ReportSection title="Outages" aside={allOutages.length ? `${allOutages.length} · newest first` : undefined}>
              {allOutages.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No outages recorded in this period.</Typography>
              ) : (
                <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                  {allOutages.map((o) => (
                    <Box component="li" key={o.id} sx={{ py: 1.5, borderBottom: '1px solid', borderColor: 'divider', breakInside: 'avoid', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '180px 1fr auto' }, columnGap: 2, rowGap: 0.5 }}>
                      <Box sx={{ ...mono, fontSize: 12.5 }}>
                        <div>{formatDateTime(o.start)}</div>
                        <Box sx={{ color: 'text.secondary' }}>→ {o.end ? formatDateTime(o.end) : 'ongoing'}</Box>
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
                          {o.targetName}{o.removed && <Box component="span" sx={{ ml: 1 }}><Tag>REMOVED</Tag></Box>}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                          Cause: {o.failedChecks[o.failedChecks.length - 1].message || 'Check failed'} · {o.failedChecks.length} failed {o.failedChecks.length === 1 ? 'check' : 'checks'}
                        </Typography>
                        {contents.checkLog && (
                          <Box component="ol" sx={{ listStyle: 'none', m: 0, mt: 1, p: 0 }}>
                            {[...o.failedChecks, ...(o.recovery ? [o.recovery] : [])].map((c) => (
                              <Box component="li" key={c.timestamp} sx={{ ...mono, fontSize: 12, display: 'grid', gridTemplateColumns: '76px 52px 1fr', gap: 1 }}>
                                <span>{formatClock(c.timestamp)}</span>
                                <span>{c.success ? 'UP' : 'DOWN'}</span>
                                <Box component="span" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>{c.message}</Box>
                              </Box>
                            ))}
                          </Box>
                        )}
                      </Box>
                      <Box sx={(theme) => ({ ...mono, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', ...downTone(theme, !o.end) })}>
                        {formatSpan(o.durationMs)}{!o.end && ' · ongoing'}
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </ReportSection>
          )}

          <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.55, maxWidth: '90ch' }}>
              {coverageNote}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, ...mono }}>
              Generated {formatDateTime(now)} by Uptime Sentry {APP_VERSION} · checks run from this computer
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Export dialog */}
      {exportModal && (
        <Dialog open={exportModal.open} onClose={() => { setExportModal(null); }} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ fontWeight: 700 }}>
            {exportModal.format === 'pdf' ? 'Print or save as PDF' : `Save report (.${exportModal.format})`}
          </DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {exportModal.format !== 'pdf' && (
              <>
                <TextField label="File name" size="small" fullWidth value={exportModal.fileName} onChange={(e) => { setExportModal({ ...exportModal, fileName: e.target.value }); }} sx={{ mt: 1 }} />
                <FormControlLabel control={<Checkbox checked={openImmediately} onChange={(e) => { setOpenImmediately(e.target.checked); }} />} label="Open the file after saving" />
                <Typography variant="body2" color="text.secondary">Charts are written as tables in text files. Print to PDF to keep them as charts.</Typography>
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

