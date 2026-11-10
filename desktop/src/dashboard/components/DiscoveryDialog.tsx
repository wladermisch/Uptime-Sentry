import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Checkbox from '@mui/material/Checkbox';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import RadarRoundedIcon from '@mui/icons-material/RadarRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import RadioButtonCheckedRoundedIcon from '@mui/icons-material/RadioButtonCheckedRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import type { Theme } from '@mui/material/styles';
import { gray, ink, signal } from '../../shared-theme/themePrimitives';
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

let pendingOpen = false;
/** Opens the search from another screen: goes to Targets, which opens the dialog for the active profile. */
export function openDiscovery() {
  pendingOpen = true;
  navigate('targets');
}
/** True once after openDiscovery(); the Targets screen asks when it mounts. */
export function takePendingDiscovery(): boolean {
  const p = pendingOpen;
  pendingOpen = false;
  return p;
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
  const serviceCount = found.reduce((n, d) => n + d.services.length, 0);
  const fresh = found.flatMap((d) => d.services.filter((s) => !alreadyThere(toTarget(d, s), existing)).map((s) => key(d.ip, s)));

  const togglePick = (k: string) => {
    const next = new Set(picked);
    if (next.has(k)) next.delete(k); else next.add(k);
    setPicked(next);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{ paper: { sx: { backgroundImage: 'none', backgroundColor: 'background.paper' } } }}
    >
      <DialogTitle sx={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <RadarRoundedIcon sx={{ fontSize: 22 }} />
        Find services on my network
      </DialogTitle>
      <DialogContent dividers sx={{ minHeight: 300, backgroundColor: 'background.default', px: { xs: 2, sm: 3 }, py: 2.5 }}>
        {offline && <Typography variant="body2" role="alert">Can&apos;t reach the monitoring service at 127.0.0.1:8765.</Typography>}

        {info && !info.enabled && (
          <Card>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1, p: 2 }}>
              <LockOutlinedIcon fontSize="small" />
              <Typography variant="body2" sx={{ flex: '1 1 260px', color: 'text.primary' }}>
                Network discovery is switched off. Turn it on in Settings; it explains what a search does first.
              </Typography>
              <Button size="small" variant="outlined" onClick={() => { onClose(); navigate('settings'); }}>Open Settings</Button>
            </Stack>
          </Card>
        )}

        {info?.enabled && !status && (
          <Stack spacing={2.5}>
            <Typography variant="body2" sx={{ maxWidth: '70ch', color: 'text.primary' }}>
              Looks for services on this computer&apos;s own networks and suggests them as targets. Nothing is added until you pick it, and nothing leaves this computer.
            </Typography>

            <Card title="Networks" aside={`${nets.length} of ${info.networks.length} chosen`}>
              {info.networks.length === 0 && <Typography variant="body2" sx={{ p: 2 }}>This computer isn&apos;t on a private network right now.</Typography>}
              {info.networks.map((n) => {
                const on = nets.includes(n.id);
                return (
                  <Row key={n.id} onClick={() => { setNets(on ? nets.filter((x) => x !== n.id) : [...nets, n.id]); }} checked={on}>
                    <Checkbox size="small" checked={on} tabIndex={-1} disableRipple sx={{ p: 0 }} slotProps={{ input: { 'aria-label': `${n.name} ${n.range}` } }} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Box sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary' }}>{n.name}</Box>
                      <Box sx={{ ...mono, fontSize: 12.5, color: 'text.secondary' }}>{n.range} · this computer is {n.address}</Box>
                    </Box>
                    {n.virtual && <Tag>VIRTUAL</Tag>}
                  </Row>
                );
              })}
            </Card>

            <Card title="Search depth">
              <Row checked={!ports} onClick={() => { setPorts(false); }}>
                <Radio checked={!ports} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Box sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary' }}>Ask who announces themselves</Box>
                  <Box sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.5 }}>Printers, NAS boxes, media servers, smart home bridges. Not a scan. About 5 seconds.</Box>
                </Box>
              </Row>
              <Row checked={ports} onClick={() => { setPorts(true); }}>
                <Radio checked={ports} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Box sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary' }}>Also check {info.ports.length} common ports</Box>
                  <Box sx={{ fontSize: 12.5, color: 'text.secondary', lineHeight: 1.5 }}>
                    Also finds web interfaces, SSH and databases that stay quiet. This is a port scan of {chosenNets.map((n) => n.range).join(' and ') || 'the chosen networks'}; security software may notice it. About a minute.
                  </Box>
                </Box>
                {ports && <WarningAmberRoundedIcon sx={{ fontSize: 18, color: 'warning.main' }} aria-label="Port scan" />}
              </Row>
            </Card>
            {error && <Typography variant="body2" role="alert" sx={{ color: 'error.main' }}>{error}</Typography>}
          </Stack>
        )}

        {status?.running && (
          <Card>
            <Stack spacing={1.5} sx={{ p: 3 }} aria-live="polite">
              <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'text.primary' }}>{status.message}</Typography>
              <LinearProgress variant="determinate" value={Math.round(status.progress * 100)} aria-label="Search progress" />
              <Typography sx={{ ...mono, fontSize: 12.5, color: 'text.secondary' }}>
                {Math.round(status.progress * 100)}% · {status.devices.length > 0 ? `${status.devices.length} ${status.devices.length === 1 ? 'device' : 'devices'} so far` : 'nothing found yet'}
              </Typography>
            </Stack>
          </Card>
        )}

        {results && (
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
              <Box role="status" sx={{ ...mono, fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', color: 'text.primary', mr: 'auto' }}>
                {status.error
                  ? <Box component="span" sx={{ color: 'error.main' }}>The search stopped: {status.error}</Box>
                  : `${found.length} ${found.length === 1 ? 'DEVICE' : 'DEVICES'} · ${serviceCount} ${serviceCount === 1 ? 'SERVICE' : 'SERVICES'} · ${picked.size} SELECTED`}
              </Box>
              {fresh.length > 0 && (
                <>
                  <Button size="small" variant="outlined" onClick={() => { setPicked(new Set(fresh)); }} disabled={picked.size === fresh.length}>Select all new</Button>
                  <Button size="small" variant="outlined" onClick={() => { setPicked(new Set()); }} disabled={picked.size === 0}>Clear</Button>
                </>
              )}
            </Stack>

            {!status.active && !status.error && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Only devices that announce themselves were asked. Search again with the common ports to find more.
              </Typography>
            )}
            {found.length === 0 && !status.error && (
              <Card><Typography variant="body2" sx={{ p: 2, color: 'text.primary' }}>Nothing answered.</Typography></Card>
            )}

            {found.map((d) => (
              <Card key={d.ip} title={d.hostname || d.ip} titleCase="none" aside={d.hostname ? d.ip : undefined}>
                {d.services.map((s) => {
                  const t = toTarget(d, s);
                  const there = alreadyThere(t, existing);
                  const k = key(d.ip, s);
                  const label = t.name.replace(/ \([^)]*\)$/, '');
                  const on = !there && picked.has(k);
                  return (
                    <Row key={k} checked={on} onClick={there ? undefined : () => { togglePick(k); }}>
                      {there
                        ? <CheckCircleRoundedIcon sx={(theme) => ({ fontSize: 20, color: signal.up, ...theme.applyStyles('dark', { color: signal.upOnDark }) })} aria-label="Already monitored" />
                        : <Checkbox size="small" checked={on} tabIndex={-1} disableRipple sx={{ p: 0 }} slotProps={{ input: { 'aria-label': label } }} />}
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Box component="span" sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary' }}>{label}</Box>
                          {s.confidence === 'LIKELY' && <Tag>LIKELY</Tag>}
                          {there && <Tag>MONITORED</Tag>}
                        </Box>
                        {s.detail && s.detail !== label && (
                          <Box sx={{ fontSize: 12.5, color: 'text.secondary', overflowWrap: 'anywhere' }}>{s.detail}</Box>
                        )}
                      </Box>
                      <Box sx={{ textAlign: 'right', flexShrink: 0, maxWidth: '45%' }}>
                        <Tag solid>{t.type}</Tag>
                        <Box sx={{ ...mono, fontSize: 12, color: 'text.secondary', mt: 0.5, overflowWrap: 'anywhere' }}>
                          {t.type === 'TCP' ? `${t.host}:${t.port}` : t.host}
                        </Box>
                      </Box>
                    </Row>
                  );
                })}
              </Card>
            ))}
            {found.some((d) => d.services.some((s) => s.confidence === 'LIKELY')) && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>LIKELY means it was guessed from the port alone, so check the name before adding.</Typography>
            )}
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

/** A white (dark: ink) block with an optional board-style header band. */
function Card({ title, aside, titleCase = 'uppercase', children }: { title?: string; aside?: string; titleCase?: 'uppercase' | 'none'; children: React.ReactNode }) {
  return (
    <Box
      sx={(theme) => ({
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1.5,
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
        ...theme.applyStyles('dark', { backgroundColor: ink }),
      })}
    >
      {title && (
        <Box
          sx={{
            display: 'flex', alignItems: 'baseline', gap: 1.5, px: 2, py: 1,
            backgroundColor: 'var(--board-head-bg)', borderBottom: '1px solid var(--board-head-rule)', color: 'var(--board-head-ink)',
          }}
        >
          <Box
            component="span"
            sx={titleCase === 'uppercase'
              ? { ...mono, fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase' }
              : { fontSize: 14.5, fontWeight: 700 }}
          >
            {title}
          </Box>
          {aside && <Box component="span" sx={{ ...mono, fontSize: 12, color: 'var(--board-head-muted)', ml: 'auto' }}>{aside}</Box>}
        </Box>
      )}
      {children}
    </Box>
  );
}

/** One clickable line inside a Card; the whole row toggles. Without onClick it is plain, full-contrast text. */
function Row({ checked, onClick, children }: { checked: boolean; onClick?: () => void; children: React.ReactNode }) {
  const body = (theme: Theme) => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    px: 2,
    py: 1.25,
    textAlign: 'left' as const,
    '&:not(:last-of-type)': { borderBottom: '1px solid', borderColor: 'divider' },
    backgroundColor: checked ? gray[100] : 'transparent',
    ...theme.applyStyles('dark', { backgroundColor: checked ? gray[800] : 'transparent' }),
  });
  if (!onClick) return <Box sx={body}>{children}</Box>;
  return (
    <ButtonBase
      component="div"
      role="button"
      aria-pressed={checked}
      onClick={onClick}
      sx={(theme) => ({
        ...body(theme),
        '&:hover': { backgroundColor: gray[100] },
        '&:focus-visible': { outline: '2px solid', outlineColor: (theme.vars || theme).palette.text.primary, outlineOffset: -2 },
        ...theme.applyStyles('dark', {
          backgroundColor: checked ? gray[800] : 'transparent',
          '&:hover': { backgroundColor: gray[800] },
        }),
      })}
    >
      {children}
    </ButtonBase>
  );
}

function Radio({ checked }: { checked: boolean }) {
  return checked
    ? <RadioButtonCheckedRoundedIcon sx={{ fontSize: 20, color: 'text.primary' }} />
    : <RadioButtonUncheckedRoundedIcon sx={{ fontSize: 20, color: 'text.secondary' }} />;
}
