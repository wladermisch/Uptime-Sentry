import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { Tag, mono } from './workspace';
import { navigate } from '../nav';
import {
  DiscoveryInfo, DiscoveryStatus, FoundDevice, FoundService, cancelDiscovery, getDiscoveryInfo, getDiscoveryStatus, startDiscovery,
} from '../serverData';

/** What the Targets screen needs to create a target from a found service. */
export interface DiscoveredTarget {
  name: string;
  type: 'HTTP' | 'TCP' | 'PING';
  host: string;
  port?: number;
}

interface ExistingTarget {
  type: string;
  host: string;
  port?: number;
}

const key = (ip: string, s: FoundService) => `${ip}|${s.port}|${s.name}`;

function toTarget(d: FoundDevice, s: FoundService): DiscoveredTarget {
  const where = d.hostname || d.ip;
  const name = s.confidence === 'UNKNOWN' && s.detail ? s.detail : s.name;
  return {
    name: `${name} (${where})`,
    type: s.check,
    host: s.check === 'PING' || s.check === 'TCP' ? d.ip : s.suggestedHost,
    port: s.check === 'TCP' ? s.port : undefined,
  };
}

function alreadyThere(t: DiscoveredTarget, existing: ExistingTarget[]): boolean {
  const norm = (h: string) => h.trim().toLowerCase().replace(/\/+$/, '');
  return existing.some((e) => e.type === t.type && norm(e.host) === norm(t.host) && (t.type !== 'TCP' || e.port === t.port));
}

/**
 * Finds services on the local network and offers them as targets. Opens on the choice of networks;
 * nothing is checked until Start, and nothing is added until the person picks it.
 */
export default function DiscoveryDialog({ open, onClose, existing, onAdd }: {
  open: boolean;
  onClose: () => void;
  existing: ExistingTarget[];
  onAdd: (targets: DiscoveredTarget[]) => void;
}) {
  const [info, setInfo] = React.useState<DiscoveryInfo | null>(null);
  const [offline, setOffline] = React.useState(false);
  const [nets, setNets] = React.useState<string[]>([]);
  const [ports, setPorts] = React.useState(false);
  const [status, setStatus] = React.useState<DiscoveryStatus | null>(null);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  const preselected = React.useRef(false);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    preselected.current = false;
    Promise.all([getDiscoveryInfo(), getDiscoveryStatus()])
      .then(([i, s]) => {
        setInfo(i);
        setNets(i.networks.filter((n) => !n.virtual).map((n) => n.id));
        setStatus(s.running ? s : null);
        setOffline(false);
      })
      .catch(() => { setOffline(true); });
  }, [open]);

  // Follow a running search.
  React.useEffect(() => {
    if (!open || !status?.running) return;
    const t = setInterval(() => {
      getDiscoveryStatus().then(setStatus).catch(() => { /* next tick */ });
    }, 700);
    return () => { clearInterval(t); };
  }, [open, status?.running]);

  // When a search ends, tick what it recognised and isn't monitored yet.
  React.useEffect(() => {
    if (!status || status.running || preselected.current) return;
    preselected.current = true;
    const next = new Set<string>();
    for (const d of status.devices) {
      for (const s of d.services) {
        if (s.confidence === 'IDENTIFIED' && !alreadyThere(toTarget(d, s), existing)) next.add(key(d.ip, s));
      }
    }
    setPicked(next);
  }, [status, existing]);

  const start = async () => {
    setError(null);
    preselected.current = false;
    try {
      setStatus(await startDiscovery(nets, ports));
    } catch (e) {
      let message = 'The search could not start.';
      try { message = (JSON.parse((e as Error).message) as { message?: string }).message ?? message; } catch { /* not JSON */ }
      setError(message);
    }
  };

  const add = () => {
    if (!status) return;
    const list: DiscoveredTarget[] = [];
    for (const d of status.devices) for (const s of d.services) if (picked.has(key(d.ip, s))) list.push(toTarget(d, s));
    onAdd(list);
    onClose();
  };

  const results = status && !status.running;
  const found = results ? status.devices.filter((d) => d.services.length > 0) : [];
  const chosenNets = info?.networks.filter((n) => nets.includes(n.id)) ?? [];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontSize: 18, fontWeight: 700 }}>Find services on my network</DialogTitle>
      <DialogContent dividers sx={{ minHeight: 280 }}>
        {offline && <Typography variant="body2" role="alert">Can&apos;t reach the monitoring service at 127.0.0.1:8765.</Typography>}

        {info && !info.enabled && (
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1, px: 1.5, py: 1.25, border: '1px dashed', borderColor: 'divider', borderRadius: 1.5 }}>
            <LockOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            <Typography variant="body2" sx={{ flex: '1 1 260px', color: 'text.secondary' }}>
              Network discovery is switched off. Turn it on in Settings; it explains what a search does first.
            </Typography>
            <Button size="small" variant="outlined" onClick={() => { onClose(); navigate('settings'); }}>Open Settings</Button>
          </Stack>
        )}

        {info?.enabled && !status && (
          <Stack spacing={2.5}>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '70ch' }}>
              Looks for services on this computer&apos;s own networks and suggests them as targets. Nothing is added until you pick it, and nothing leaves this computer.
            </Typography>
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>Networks</Typography>
              {info.networks.length === 0 && <Typography variant="body2">This computer isn&apos;t on a private network right now.</Typography>}
              {info.networks.map((n) => (
                <FormControlLabel
                  key={n.id}
                  sx={{ display: 'flex', ml: -1 }}
                  control={<Checkbox size="small" checked={nets.includes(n.id)} onChange={(e) => { setNets(e.target.checked ? [...nets, n.id] : nets.filter((x) => x !== n.id)); }} />}
                  label={(
                    <Box component="span" sx={{ fontSize: 14 }}>
                      {n.name} <Box component="span" sx={{ ...mono, fontSize: 12.5, color: 'text.secondary' }}>{n.range}</Box>
                      {n.virtual && <Box component="span" sx={{ ml: 1 }}><Tag>VIRTUAL</Tag></Box>}
                    </Box>
                  )}
                />
              ))}
            </Box>
            <Box>
              <FormControlLabel
                sx={{ ml: -1, alignItems: 'flex-start' }}
                control={<Checkbox size="small" checked={ports} onChange={(e) => { setPorts(e.target.checked); }} sx={{ mt: -0.5 }} />}
                label={(
                  <Box>
                    <Box component="span" sx={{ fontSize: 14 }}>Also check {info.ports.length} common ports on these addresses</Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.5, maxWidth: '64ch' }}>
                      Finds what doesn&apos;t announce itself (web interfaces, SSH, databases). This is a port scan of {chosenNets.map((n) => n.range).join(' and ') || 'the chosen networks'}; security software may notice it. It takes about a minute.
                    </Typography>
                  </Box>
                )}
              />
            </Box>
            {error && <Typography variant="body2" role="alert" sx={{ color: 'error.main' }}>{error}</Typography>}
          </Stack>
        )}

        {status?.running && (
          <Stack spacing={1.5} sx={{ py: 3 }} aria-live="polite">
            <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{status.message}</Typography>
            <LinearProgress variant="determinate" value={Math.round(status.progress * 100)} aria-label="Search progress" />
            <Typography variant="caption" color="text.secondary">
              {status.devices.length > 0 ? `${status.devices.length} ${status.devices.length === 1 ? 'device' : 'devices'} so far` : 'Nothing found yet'}
            </Typography>
          </Stack>
        )}

        {results && (
          <Stack spacing={2}>
            <Typography variant="body2" role="status" sx={{ color: status.error ? 'error.main' : 'text.secondary' }}>
              {status.error ? `The search stopped: ${status.error}` : status.message}
              {!status.active && !status.error && ' Only devices that announce themselves were asked; tick the ports option to find more.'}
            </Typography>
            {found.length === 0 && !status.error && (
              <Typography variant="body2">Nothing answered. Devices that don&apos;t announce themselves show up when the ports option is ticked.</Typography>
            )}
            {found.map((d) => (
              <Box key={d.ip} sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 1.5 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
                  {d.hostname || d.ip}
                  {d.hostname && <Box component="span" sx={{ ...mono, fontWeight: 400, fontSize: 12.5, color: 'text.secondary', ml: 1 }}>{d.ip}</Box>}
                </Typography>
                {d.services.map((s) => {
                  const t = toTarget(d, s);
                  const there = alreadyThere(t, existing);
                  const k = key(d.ip, s);
                  return (
                    <FormControlLabel
                      key={k}
                      disabled={there}
                      sx={{ display: 'flex', ml: -1, alignItems: 'flex-start', mt: 0.25 }}
                      control={<Checkbox size="small" checked={!there && picked.has(k)} onChange={(e) => {
                        const next = new Set(picked);
                        if (e.target.checked) next.add(k); else next.delete(k);
                        setPicked(next);
                      }} sx={{ mt: -0.25 }} />}
                      label={(
                        <Box sx={{ minWidth: 0 }}>
                          <Box component="span" sx={{ fontSize: 14 }}>{t.name.replace(/ \([^)]*\)$/, '')}</Box>
                          {s.confidence === 'LIKELY' && <Box component="span" sx={{ ml: 1 }}><Tag>LIKELY</Tag></Box>}
                          {there && <Box component="span" sx={{ ml: 1 }}><Tag>MONITORED</Tag></Box>}
                          <Box sx={{ ...mono, fontSize: 12, color: 'text.secondary', overflowWrap: 'anywhere' }}>
                            {t.type} {t.type === 'TCP' ? `${t.host}:${t.port}` : t.host}
                            {s.detail && s.detail !== t.name.replace(/ \([^)]*\)$/, '') ? `, ${s.detail}` : ''}
                          </Box>
                        </Box>
                      )}
                    />
                  );
                })}
              </Box>
            ))}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        {status?.running ? (
          <Button size="small" variant="outlined" onClick={() => { cancelDiscovery().then(setStatus).catch(() => { /* shown on next poll */ }); }}>Stop</Button>
        ) : results ? (
          <>
            <Button size="small" onClick={() => { setStatus(null); }} sx={{ mr: 'auto' }}>Search again</Button>
            <Button size="small" onClick={onClose}>Close</Button>
            <Button size="small" variant="contained" disabled={picked.size === 0} onClick={add}>
              Add {picked.size} {picked.size === 1 ? 'target' : 'targets'}
            </Button>
          </>
        ) : (
          <>
            <Button size="small" onClick={onClose}>Cancel</Button>
            {info?.enabled && <Button size="small" variant="contained" disabled={nets.length === 0} onClick={() => { void start(); }}>Start search</Button>}
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
