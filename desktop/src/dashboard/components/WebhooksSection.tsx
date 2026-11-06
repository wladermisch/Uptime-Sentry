import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { PassSection } from './workspace';
import { AlertEventKind, Webhook, WebhookFormat, getWebhooks, putWebhooks, readProfilesAndTargets, testWebhook } from '../serverData';

const FORMATS: Record<WebhookFormat, { label: string; help: string; placeholder: string }> = {
  SLACK: { label: 'Slack', help: 'An incoming webhook URL from your Slack app.', placeholder: 'https://hooks.slack.com/services/…' },
  TEAMS: { label: 'Microsoft Teams', help: 'In Teams, add the Workflows template "Post to a channel when a webhook request is received" and paste its URL.', placeholder: 'https://…logic.azure.com/workflows/…' },
  DISCORD: { label: 'Discord', help: 'Channel settings → Integrations → Webhooks → Copy webhook URL.', placeholder: 'https://discord.com/api/webhooks/…' },
  NTFY: { label: 'ntfy (phone push)', help: 'A topic on ntfy.sh or your own ntfy server; subscribe to it in the ntfy app.', placeholder: 'https://ntfy.sh/my-uptime-alerts' },
  GENERIC: { label: 'Other (JSON)', help: 'Sends JSON with event, target, time, message and duration, for Home Assistant, n8n, scripts…', placeholder: 'https://example.com/hooks/uptime' },
};

const EVENTS: { key: AlertEventKind; label: string }[] = [
  { key: 'DOWN', label: 'Down' },
  { key: 'UP', label: 'Recovered' },
  { key: 'SLOW', label: 'Slow' },
  { key: 'NORMAL', label: 'Fast again' },
];

function blank(): Webhook {
  return { name: '', url: '', format: 'SLACK', enabled: true, events: ['DOWN', 'UP'], profileIds: [] };
}

/** Chat and push alerts: each webhook gets a POST when targets go down, recover or turn slow. */
export default function WebhooksSection() {
  const [hooks, setHooks] = React.useState<Webhook[]>([]);
  const [dirty, setDirty] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [tests, setTests] = React.useState<Record<number, { ok: boolean; message: string } | 'sending'>>({});
  const [offline, setOffline] = React.useState(false);
  const { profiles } = React.useMemo(readProfilesAndTargets, []);

  React.useEffect(() => {
    getWebhooks().then((list) => { setHooks(list); setOffline(false); }).catch(() => { setOffline(true); });
  }, []);

  const update = (i: number, patch: Partial<Webhook>) => {
    setHooks((list) => list.map((h, j) => (j === i ? { ...h, ...patch } : h)));
    setDirty(true);
    setStatus(null);
  };

  const save = async () => {
    try {
      setHooks(await putWebhooks(hooks));
      setDirty(false);
      setStatus('Webhooks saved.');
    } catch {
      setStatus("Can't reach the monitoring service, so webhooks weren't saved.");
    }
  };

  const test = async (i: number) => {
    setTests((t) => ({ ...t, [i]: 'sending' }));
    try {
      const r = await testWebhook(hooks[i]);
      setTests((t) => ({ ...t, [i]: r }));
    } catch {
      setTests((t) => ({ ...t, [i]: { ok: false, message: "Can't reach the monitoring service." } }));
    }
  };

  const invalid = hooks.some((h) => !/^https?:\/\/\S+$/i.test(h.url.trim()) || h.events.length === 0);

  return (
    <PassSection
      label="Webhooks"
      hint="Send alerts to Slack, Teams, Discord, your phone (ntfy) or any service that accepts a web request."
      aside={<Button size="small" startIcon={<AddIcon />} onClick={() => { setHooks([...hooks, blank()]); setDirty(true); }}>Add webhook</Button>}
    >
      {offline && <Typography variant="body2" role="alert">Can&apos;t reach the monitoring service at 127.0.0.1:8765, so webhooks can&apos;t be loaded.</Typography>}
      {hooks.length === 0 && !offline && (
        <Typography variant="body2" color="text.secondary">No webhooks yet.</Typography>
      )}
      <Stack spacing={2}>
        {hooks.map((h, i) => {
          const f = FORMATS[h.format] ?? FORMATS.GENERIC;
          const t = tests[i];
          const urlBad = h.url.trim() !== '' && !/^https?:\/\/\S+$/i.test(h.url.trim());
          return (
            <Box key={h.id ?? `new-${i}`} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, p: 2, opacity: h.enabled ? 1 : 0.7 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 200px auto' }, gap: 1.5, alignItems: 'start' }}>
                <TextField label="Name" size="small" placeholder="e.g. Ops channel" value={h.name} onChange={(e) => { update(i, { name: e.target.value }); }} />
                <TextField select label="Service" size="small" value={h.format} onChange={(e) => { update(i, { format: e.target.value as WebhookFormat }); }}>
                  {Object.entries(FORMATS).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
                </TextField>
                <Stack direction="row" sx={{ alignItems: 'center' }}>
                  <Tooltip title={h.enabled ? 'On' : 'Off'}>
                    <Switch size="small" checked={h.enabled} onChange={(e) => { update(i, { enabled: e.target.checked }); }} slotProps={{ input: { 'aria-label': 'Webhook on' } }} />
                  </Tooltip>
                  <Tooltip title="Remove">
                    <IconButton size="small" aria-label="Remove webhook" onClick={() => { setHooks(hooks.filter((_, j) => j !== i)); setDirty(true); }}>
                      <DeleteOutlineRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Box>
              <TextField
                sx={{ mt: 1.5 }}
                label="Webhook URL"
                size="small"
                fullWidth
                required
                placeholder={f.placeholder}
                value={h.url}
                error={urlBad}
                onChange={(e) => { update(i, { url: e.target.value.trim() }); }}
                helperText={urlBad ? 'The address must start with https://' : f.help}
                slotProps={{ htmlInput: { style: { fontFamily: '"JetBrains Mono Variable", monospace', fontSize: 13 } } }}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1, alignItems: { sm: 'center' }, flexWrap: 'wrap' }}>
                <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Send when a target</Typography>
                {EVENTS.map((ev) => (
                  <FormControlLabel
                    key={ev.key}
                    sx={{ mr: 1, '& .MuiFormControlLabel-label': { fontSize: 13.5 } }}
                    control={(
                      <Checkbox
                        size="small"
                        checked={h.events.includes(ev.key)}
                        onChange={(e) => { update(i, { events: e.target.checked ? [...h.events, ev.key] : h.events.filter((x) => x !== ev.key) }); }}
                      />
                    )}
                    label={ev.label}
                  />
                ))}
              </Stack>
              {profiles.length > 1 && (
                <TextField
                  select
                  sx={{ mt: 1, minWidth: 240 }}
                  label="Profiles"
                  size="small"
                  value={h.profileIds}
                  onChange={(e) => { const v = e.target.value as unknown as string[]; update(i, { profileIds: v.includes('*') ? [] : v }); }}
                  slotProps={{
                    select: {
                      multiple: true,
                      displayEmpty: true,
                      renderValue: (v) => ((v as string[]).length === 0 ? 'All profiles' : (v as string[]).map((id) => profiles.find((p) => p.id === id)?.name ?? '?').join(', ')),
                    },
                    inputLabel: { shrink: true },
                  }}
                >
                  <MenuItem value="*">All profiles</MenuItem>
                  {profiles.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                </TextField>
              )}
              <Stack direction="row" spacing={1.5} sx={{ mt: 1.5, alignItems: 'center' }}>
                <Button size="small" variant="outlined" startIcon={<SendRoundedIcon />} disabled={!h.url || urlBad || t === 'sending'} onClick={() => { void test(i); }}>
                  {t === 'sending' ? 'Sending…' : 'Send test'}
                </Button>
                {t && t !== 'sending' && (
                  <Typography variant="body2" role="status" sx={{ color: t.ok ? 'success.main' : 'error.main', overflowWrap: 'anywhere' }}>{t.message}</Typography>
                )}
              </Stack>
            </Box>
          );
        })}
      </Stack>
      {(dirty || status) && (
        <Stack direction="row" spacing={1.5} sx={{ mt: 2, alignItems: 'center' }}>
          {dirty && <Button size="small" variant="contained" onClick={() => { void save(); }} disabled={invalid}>Save webhooks</Button>}
          {dirty && invalid && <Typography variant="caption" color="text.secondary">Each webhook needs an https:// address and at least one event.</Typography>}
          {status && <Typography variant="body2" role="status">{status}</Typography>}
        </Stack>
      )}
    </PassSection>
  );
}
