import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import {
  FieldGrid, IndexEmpty, IndexHeader, IndexList, IndexRow, Pass, PassFooter, PassHead, PassSection, Tag, Workspace,
} from './workspace';
import ScopePicker, { describeScope } from './ScopePicker';
import {
  DAY_NAMES, MaintenanceWindow, formatLocal, getMaintenance, putMaintenance, readProfilesAndTargets,
} from '../serverData';

const pad = (n: number) => String(n).padStart(2, '0');
/** "yyyy-mm-ddThh:mm" for datetime-local inputs. */
function toInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function blank(): MaintenanceWindow {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 3600_000);
  return {
    title: 'Planned maintenance', note: '', enabled: true, scope: 'ALL', profileId: null, targetIds: [],
    mode: 'ONCE', start: toInput(start), end: toInput(end), days: [6], startTime: '22:00', endTime: '23:00',
  };
}

function describeWhen(w: MaintenanceWindow): string {
  if (w.mode === 'WEEKLY') {
    const days = [...w.days].sort().map((d) => DAY_NAMES[d - 1]).join(', ');
    return `Every ${days || '—'} · ${w.startTime}–${w.endTime}${w.endTime <= w.startTime ? ' (next day)' : ''}`;
  }
  return `${formatLocal(w.start)} → ${formatLocal(w.end)}`;
}

function status(w: MaintenanceWindow): { label: string; solid?: boolean } {
  if (!w.enabled) return { label: 'OFF' };
  if (w.activeNow) return { label: 'ACTIVE', solid: true };
  if (w.nextStart) return { label: 'PLANNED' };
  return { label: 'ENDED' };
}

function invalid(w: MaintenanceWindow, targetsChosen: boolean): string | null {
  if (!w.title.trim()) return 'Give the window a name.';
  if (w.scope === 'TARGETS' && !targetsChosen) return 'Pick at least one target.';
  if (w.mode === 'ONCE') {
    if (!w.start || !w.end) return 'Enter when it starts and ends.';
    if (w.end <= w.start) return 'The end must be after the start.';
  } else if (w.days.length === 0) {
    return 'Pick at least one day.';
  } else if (w.startTime === w.endTime) {
    return 'Start and end time are the same.';
  }
  return null;
}

/** Planned work: alerts pause and reports leave the time out, while checks keep running. */
export default function MaintenanceTab() {
  const [windows, setWindows] = React.useState<MaintenanceWindow[]>([]);
  const [selected, setSelected] = React.useState<number | 'new' | null>(null);
  const [draft, setDraft] = React.useState<MaintenanceWindow>(blank);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const { profiles, targets } = React.useMemo(readProfilesAndTargets, []);

  const load = React.useCallback(async (select?: number) => {
    try {
      const list = await getMaintenance();
      setWindows(list);
      setError(null);
      setSelected((cur) => {
        const idx = select ?? (typeof cur === 'number' && cur < list.length ? cur : list.length ? 0 : 'new');
        if (idx === 'new') setDraft(blank());
        else if (list[idx]) setDraft({ ...list[idx] });
        return idx;
      });
    } catch {
      setError("Can't reach the monitoring service at 127.0.0.1:8765, so maintenance windows can't be loaded.");
    }
  }, []);

  React.useEffect(() => {
    void load();
    const t = setInterval(() => {
      // Keep "active" and "planned" current without touching the form.
      getMaintenance().then(setWindows).catch(() => { /* shown on next save */ });
    }, 30_000);
    return () => { clearInterval(t); };
  }, [load]);

  const pick = (i: number) => { setSelected(i); setDraft({ ...windows[i] }); setSaved(false); };
  const startNew = () => { setSelected('new'); setDraft(blank()); setSaved(false); };

  const persist = async (list: MaintenanceWindow[], select: number | 'new' | null) => {
    setSaving(true);
    try {
      const strip = list.map(({ activeNow: _a, nextStart: _n, ...w }) => w);
      await putMaintenance(strip);
      await load(typeof select === 'number' ? select : undefined);
      setSaved(true);
      setTimeout(() => { setSaved(false); }, 2000);
    } catch {
      setError("Can't reach the monitoring service, so the change wasn't saved.");
    } finally {
      setSaving(false);
    }
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (selected === 'new') void persist([...windows, draft], windows.length);
    else if (typeof selected === 'number') void persist(windows.map((w, i) => (i === selected ? draft : w)), selected);
  };

  const remove = () => {
    if (typeof selected !== 'number') return;
    void persist(windows.filter((_, i) => i !== selected), windows.length > 1 ? 0 : 'new');
  };

  const quickStart = (minutes: number) => {
    const now = new Date();
    setDraft({ ...draft, mode: 'ONCE', start: toInput(now), end: toInput(new Date(now.getTime() + minutes * 60_000)) });
  };

  const problem = invalid(draft, draft.targetIds.length > 0);
  const isNew = selected === 'new';
  const st = isNew ? null : status(draft.id ? (windows.find((w) => w.id === draft.id) ?? draft) : draft);

  return (
    <Workspace
      index={
        <>
          <IndexHeader title="Maintenance" count={windows.length} action={{ label: 'Add', icon: <AddIcon />, onClick: startNew }} />
          <IndexList label="Maintenance windows">
            {windows.map((w, i) => {
              const s = status(w);
              return (
                <IndexRow
                  key={w.id ?? i}
                  n={i + 1}
                  selected={selected === i}
                  onSelect={() => { pick(i); }}
                  title={w.title || 'Untitled window'}
                  badge={<Tag solid={s.solid}>{s.label}</Tag>}
                  meta={`${describeWhen(w)} · ${describeScope(w, profiles, targets)}`}
                />
              );
            })}
            {windows.length === 0 && (
              <IndexEmpty>No maintenance planned. Add a window before planned work so nobody gets paged for it.</IndexEmpty>
            )}
          </IndexList>
        </>
      }
    >
      <Pass component="form" onSubmit={save} aria-label="Maintenance window">
        <PassHead
          title={isNew ? 'New maintenance window' : draft.title || 'Untitled window'}
          meta={st ? <><Tag solid={st.solid}>{st.label}</Tag><span>{draft.nextStart && !draft.activeNow ? `next ${formatLocal(draft.nextStart)}` : describeWhen(draft)}</span></> : <span>Checks keep running; alerts pause.</span>}
          actions={
            <>
              <FormControlLabel
                sx={{ mr: 0.5 }}
                control={<Switch size="small" checked={draft.enabled} onChange={(e) => { setDraft({ ...draft, enabled: e.target.checked }); }} />}
                label={<Box component="span" sx={{ fontSize: 13 }}>{draft.enabled ? 'On' : 'Off'}</Box>}
              />
              {!isNew && (
                <Button variant="outlined" size="small" startIcon={<DeleteOutlineRoundedIcon />} onClick={remove} disabled={saving}>Remove</Button>
              )}
            </>
          }
        />

        {error && (
          <Box sx={{ px: 3, pt: 2 }}>
            <Typography variant="body2" role="alert">{error}</Typography>
          </Box>
        )}

        <PassSection label="What" hint="The note is shown on the status page while the window runs.">
          <FieldGrid>
            <TextField label="Name" size="small" required value={draft.title} onChange={(e) => { setDraft({ ...draft, title: e.target.value }); }} />
            <TextField label="Note (optional)" size="small" placeholder="e.g. Database upgrade" value={draft.note} onChange={(e) => { setDraft({ ...draft, note: e.target.value }); }} />
          </FieldGrid>
          <Box sx={{ mt: 2.5 }}>
            <ScopePicker value={draft} onChange={(v) => { setDraft({ ...draft, ...v }); }} profiles={profiles} targets={targets} />
          </Box>
        </PassSection>

        <PassSection label="When">
          <ToggleButtonGroup
            exclusive
            size="small"
            value={draft.mode}
            onChange={(_e, v: 'ONCE' | 'WEEKLY' | null) => { if (v) setDraft({ ...draft, mode: v }); }}
            sx={{ mb: 2.5 }}
          >
            <ToggleButton value="ONCE">One time</ToggleButton>
            <ToggleButton value="WEEKLY">Every week</ToggleButton>
          </ToggleButtonGroup>
          {draft.mode === 'ONCE' ? (
            <>
              <FieldGrid>
                <TextField type="datetime-local" label="Starts" size="small" value={draft.start ?? ''} onChange={(e) => { setDraft({ ...draft, start: e.target.value }); }} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField type="datetime-local" label="Ends" size="small" value={draft.end ?? ''} onChange={(e) => { setDraft({ ...draft, end: e.target.value }); }} slotProps={{ inputLabel: { shrink: true } }} />
              </FieldGrid>
              <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Start now for</Typography>
                {[30, 60, 120, 240].map((m) => (
                  <Button key={m} size="small" variant="outlined" onClick={() => { quickStart(m); }}>{m < 60 ? `${m} min` : `${m / 60} h`}</Button>
                ))}
              </Box>
            </>
          ) : (
            <>
              <ToggleButtonGroup
                size="small"
                value={draft.days}
                onChange={(_e, days: number[]) => { setDraft({ ...draft, days }); }}
                aria-label="Days of the week"
                sx={{ flexWrap: 'wrap', mb: 2.5 }}
              >
                {DAY_NAMES.map((d, i) => <ToggleButton key={d} value={i + 1} sx={{ minWidth: 48 }}>{d}</ToggleButton>)}
              </ToggleButtonGroup>
              <FieldGrid>
                <TextField type="time" label="From" size="small" value={draft.startTime} onChange={(e) => { setDraft({ ...draft, startTime: e.target.value }); }} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField
                  type="time"
                  label="To"
                  size="small"
                  value={draft.endTime}
                  onChange={(e) => { setDraft({ ...draft, endTime: e.target.value }); }}
                  helperText={draft.endTime <= draft.startTime && draft.endTime !== draft.startTime ? 'Ends the next morning.' : ' '}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </FieldGrid>
            </>
          )}
        </PassSection>

        <PassSection label="During the window">
          <Box component="ul" sx={{ m: 0, pl: 2.5, color: 'text.secondary', fontSize: 13.5, lineHeight: 1.7 }}>
            <li>Checks keep running and are recorded, marked as maintenance.</li>
            <li>No sounds, desktop notifications, emails, webhooks or recovery commands.</li>
            <li>Analytics, reports and the status page leave this time out of availability.</li>
            <li>If a target is still down when the window ends, you are alerted then.</li>
          </Box>
        </PassSection>

        <PassFooter>
          <Button type="submit" variant="contained" size="small" disabled={!!problem || saving}>
            {saved ? 'Saved' : isNew ? 'Add window' : 'Save window'}
          </Button>
          {isNew && windows.length > 0 && <Button size="small" onClick={() => { pick(0); }}>Cancel</Button>}
          {problem && <Typography variant="caption" color="text.secondary">{problem}</Typography>}
        </PassFooter>
      </Pass>
    </Workspace>
  );
}
