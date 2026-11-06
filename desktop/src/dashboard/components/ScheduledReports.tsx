import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ScheduleSendRoundedIcon from '@mui/icons-material/ScheduleSendRounded';
import AddIcon from '@mui/icons-material/Add';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { Label, Tag } from './workspace';
import ScopePicker, { describeScope } from './ScopePicker';
import { RecipientsInput } from './EmailAlertFields';
import { Gate, useAppCapabilities } from './AppGate';
import { DAY_NAMES, ReportSchedule, formatLocal, getSchedules, putSchedules, sendSchedule } from '../serverData';
import { fonts } from '../../shared-theme/themePrimitives';

function blank(sla: number | null): ReportSchedule {
  return {
    name: 'Weekly uptime report', enabled: true, frequency: 'WEEKLY', dayOfWeek: 1, dayOfMonth: 1, time: '08:00',
    scope: 'ALL', profileId: null, targetIds: [], recipients: [], sla: sla ?? 99.9, includeOutages: true,
  };
}

function describeWhen(s: ReportSchedule): string {
  if (s.frequency === 'DAILY') return `Daily at ${s.time}, covering the day before`;
  if (s.frequency === 'MONTHLY') return `Monthly on day ${s.dayOfMonth} at ${s.time}, covering last month`;
  return `Every ${DAY_NAMES[s.dayOfWeek - 1]} at ${s.time}, covering the 7 days before`;
}

/** Reports the monitoring service emails on a schedule, even while this window is closed. */
export default function ScheduledReports({ profiles, targets, defaultSla }: {
  profiles: { id: string; name: string }[];
  targets: { id: number; name: string; profileId: string }[];
  defaultSla: number | null;
}) {
  const caps = useAppCapabilities();
  const [open, setOpen] = React.useState(false);
  const [list, setList] = React.useState<ReportSchedule[]>([]);
  const [editing, setEditing] = React.useState<{ index: number | 'new'; draft: ReportSchedule } | null>(null);
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [offline, setOffline] = React.useState(false);

  const load = React.useCallback(() => {
    getSchedules().then((l) => { setList(l); setOffline(false); }).catch(() => { setOffline(true); });
  }, []);
  React.useEffect(load, [load]);

  const persist = async (next: ReportSchedule[]) => {
    setBusy(true);
    try {
      setList(await putSchedules(next.map(({ nextSend: _n, ...s }) => s)));
      setEditing(null);
      setResult(null);
    } catch {
      setResult({ ok: false, message: "Can't reach the monitoring service, so the schedule wasn't saved." });
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!editing) return;
    const next = editing.index === 'new' ? [...list, editing.draft] : list.map((s, i) => (i === editing.index ? editing.draft : s));
    void persist(next);
  };

  const sendNow = async () => {
    if (!editing) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await sendSchedule(editing.draft));
    } catch {
      setResult({ ok: false, message: "Can't reach the monitoring service." });
    } finally {
      setBusy(false);
    }
  };

  const d = editing?.draft;
  const set = (patch: Partial<ReportSchedule>) => { if (editing) setEditing({ ...editing, draft: { ...editing.draft, ...patch } }); };
  const problem = !d ? null
    : !d.name.trim() ? 'Give the report a name.'
      : d.recipients.length === 0 ? 'Add at least one recipient.'
        : d.scope === 'TARGETS' && d.targetIds.length === 0 ? 'Pick at least one target.'
          : null;
  const activeCount = list.filter((s) => s.enabled).length;

  return (
    <>
      <Label>Scheduled emails</Label>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1 }}>
        {offline ? "Can't reach the monitoring service." : list.length === 0 ? 'Email a report every day, week or month.' : `${activeCount} of ${list.length} schedules on.`}
      </Typography>
      <Button variant="outlined" fullWidth startIcon={<ScheduleSendRoundedIcon />} onClick={() => { load(); setOpen(true); }}>
        Schedule reports…
      </Button>

      <Dialog open={open} onClose={() => { if (!busy) { setOpen(false); setEditing(null); setResult(null); } }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: 18, fontWeight: 700 }}>
          {editing ? (editing.index === 'new' ? 'New scheduled report' : 'Edit scheduled report') : 'Scheduled reports'}
        </DialogTitle>
        <DialogContent dividers>
          <Gate ready={caps.mailServerReady || caps.loading} reason={caps.mailServerBlocker}>
            {!editing && (
              <Stack spacing={1.5}>
                <Typography variant="body2" color="text.secondary">
                  The monitoring service emails these reports through your mail server, also while this window is closed.
                  Each one covers the period that just ended; checks during maintenance aren&apos;t counted.
                </Typography>
                {list.map((s, i) => (
                  <Box key={s.id ?? i} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 1.5, display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{s.name}</Typography>
                        {!s.enabled && <Tag>OFF</Tag>}
                      </Stack>
                      <Typography variant="body2" color="text.secondary">{describeWhen(s)} · {describeScope(s, profiles, targets)}</Typography>
                      <Typography sx={{ fontFamily: fonts.mono, fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere' }}>
                        to {s.recipients.join(', ')}{s.enabled && s.nextSend ? ` · next ${formatLocal(s.nextSend)}` : ''}
                      </Typography>
                      {s.lastError && <Typography variant="body2" sx={{ color: 'error.main', mt: 0.5 }}>Last send failed: {s.lastError}</Typography>}
                    </Box>
                    <Tooltip title="Edit">
                      <IconButton size="small" aria-label={`Edit ${s.name}`} onClick={() => { setResult(null); setEditing({ index: i, draft: { ...s } }); }}><EditRoundedIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Remove">
                      <IconButton size="small" aria-label={`Remove ${s.name}`} onClick={() => { void persist(list.filter((_, j) => j !== i)); }} disabled={busy}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
                    </Tooltip>
                  </Box>
                ))}
                <Box>
                  <Button size="small" startIcon={<AddIcon />} onClick={() => { setResult(null); setEditing({ index: 'new', draft: blank(defaultSla) }); }}>Add a schedule</Button>
                </Box>
              </Stack>
            )}
            {d && (
              <Stack spacing={2.25}>
                <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                  <TextField label="Name" size="small" fullWidth value={d.name} onChange={(e) => { set({ name: e.target.value }); }} helperText="Used as the email subject." />
                  <FormControlLabel control={<Switch checked={d.enabled} onChange={(e) => { set({ enabled: e.target.checked }); }} />} label={d.enabled ? 'On' : 'Off'} />
                </Stack>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 120px' }, gap: 2 }}>
                  <TextField select label="How often" size="small" value={d.frequency} onChange={(e) => { set({ frequency: e.target.value as ReportSchedule['frequency'] }); }}>
                    <MenuItem value="DAILY">Daily (yesterday)</MenuItem>
                    <MenuItem value="WEEKLY">Weekly (last 7 days)</MenuItem>
                    <MenuItem value="MONTHLY">Monthly (last month)</MenuItem>
                  </TextField>
                  {d.frequency === 'WEEKLY' && (
                    <TextField select label="On" size="small" value={d.dayOfWeek} onChange={(e) => { set({ dayOfWeek: Number(e.target.value) }); }}>
                      {DAY_NAMES.map((n, i) => <MenuItem key={n} value={i + 1}>{n}</MenuItem>)}
                    </TextField>
                  )}
                  {d.frequency === 'MONTHLY' && (
                    <TextField select label="Day of month" size="small" value={d.dayOfMonth} onChange={(e) => { set({ dayOfMonth: Number(e.target.value) }); }}>
                      {Array.from({ length: 28 }, (_, i) => <MenuItem key={i} value={i + 1}>{i + 1}</MenuItem>)}
                    </TextField>
                  )}
                  {d.frequency === 'DAILY' && <Box sx={{ display: { xs: 'none', sm: 'block' } }} />}
                  <TextField type="time" label="At" size="small" value={d.time} onChange={(e) => { set({ time: e.target.value }); }} slotProps={{ inputLabel: { shrink: true } }} />
                </Box>
                <ScopePicker value={d} onChange={(v) => { set(v); }} profiles={profiles} targets={targets} />
                <RecipientsInput value={d.recipients} onChange={(recipients) => { set({ recipients }); }} />
                <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
                  <FormControlLabel
                    control={<Checkbox checked={d.sla !== null} onChange={(e) => { set({ sla: e.target.checked ? (defaultSla ?? 99.9) : null }); }} />}
                    label="Compare with an SLA target"
                  />
                  {d.sla !== null && (
                    <TextField
                      label="SLA %"
                      type="number"
                      size="small"
                      value={d.sla}
                      onChange={(e) => { set({ sla: Math.min(100, Math.max(0, Number(e.target.value))) }); }}
                      slotProps={{ htmlInput: { min: 0, max: 100, step: 0.01 } }}
                      sx={{ width: 110 }}
                    />
                  )}
                  <FormControlLabel control={<Checkbox checked={d.includeOutages} onChange={(e) => { set({ includeOutages: e.target.checked }); }} />} label="List outages with notes" />
                </Stack>
              </Stack>
            )}
          </Gate>
          {result && (
            <Typography variant="body2" role="status" sx={{ mt: 2, color: result.ok ? 'success.main' : 'error.main', overflowWrap: 'anywhere' }}>{result.message}</Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          {editing ? (
            <>
              {problem && <Typography variant="caption" color="text.secondary" sx={{ mr: 'auto' }}>{problem}</Typography>}
              <Button size="small" onClick={() => { setEditing(null); setResult(null); }} disabled={busy}>Back</Button>
              <Button size="small" variant="outlined" onClick={() => { void sendNow(); }} disabled={busy || !!problem || !caps.mailServerReady}>Send now</Button>
              <Button size="small" variant="contained" onClick={save} disabled={busy || !!problem}>Save</Button>
            </>
          ) : (
            <Button size="small" variant="outlined" onClick={() => { setOpen(false); }}>Close</Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
