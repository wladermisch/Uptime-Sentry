import * as React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import BrandMark from './BrandMark';
import { fonts, ink, paper, signal } from '../../shared-theme/themePrimitives';

const APP_VERSION = 'v0.4.0';
const REPO = 'https://github.com/wladermisch/Uptime-Sentry';

const mono = { fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' } as const;

function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/i, '').split('.').map(Number);
  const l = parse(latest);
  const c = parse(current);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    const a = l[i] ?? 0;
    const b = c[i] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

/** One labelled row of the status sheet. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '220px 1fr' }, gap: { xs: 0.5, sm: 2 }, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', alignItems: 'center' }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

function Tag({ tone, children }: { tone: 'ok' | 'down' | 'muted'; children: React.ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        ...mono,
        display: 'inline-block',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.06em',
        lineHeight: '22px',
        px: 1,
        borderRadius: '3px',
        ...(tone === 'down'
          ? { backgroundColor: signal.down, color: '#FFFFFF' }
          : { border: '1px solid', borderColor: 'divider', color: tone === 'ok' ? 'text.primary' : 'text.secondary' }),
      }}
    >
      {children}
    </Box>
  );
}

export default function AboutTab() {
  const [status, setStatus] = React.useState<{ online: boolean; running: boolean; interval: number } | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [update, setUpdate] = React.useState<{ message: string; url?: string } | null>(null);

  React.useEffect(() => {
    fetch('http://127.0.0.1:8765/api/autocheck/status')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { running: boolean; intervalSeconds: number }) => { setStatus({ online: true, running: d.running, interval: d.intervalSeconds }); })
      .catch(() => { setStatus({ online: false, running: false, interval: 0 }); });
  }, []);

  const checkForUpdates = async () => {
    setChecking(true);
    setUpdate(null);
    try {
      const res = await fetch('https://api.github.com/repos/wladermisch/Uptime-Sentry/releases/latest');
      if (!res.ok) {
        setUpdate({ message: 'No published release found on GitHub.' });
        return;
      }
      const data = (await res.json()) as { tag_name: string; html_url: string; assets?: { name: string; browser_download_url: string }[] };
      if (isNewerVersion(data.tag_name, APP_VERSION)) {
        const exe = data.assets?.find((a) => a.name.endsWith('.exe'));
        setUpdate({ message: `Version ${data.tag_name} is available.`, url: exe?.browser_download_url ?? data.html_url });
        try { localStorage.setItem('uptime_sentry_latest_release', data.tag_name); } catch { /* storage unavailable */ }
      } else {
        setUpdate({ message: `You're on the latest version (${APP_VERSION}).` });
      }
    } catch {
      setUpdate({ message: "Couldn't reach GitHub. Check your internet connection and try again." });
    } finally {
      setChecking(false);
    }
  };

  return (
    <Box sx={{ width: '100%', maxWidth: 880 }}>
      {/* Identity */}
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 4 }}>
        <Box sx={(theme) => ({ color: ink, '--brandmark-ink': paper, display: 'flex', ...theme.applyStyles('dark', { color: paper, '--brandmark-ink': ink }) })}>
          <BrandMark size={56} />
        </Box>
        <Box>
          <Typography component="h2" sx={{ fontSize: 36, fontWeight: 800, fontStretch: '72%', lineHeight: 1 }}>Uptime Sentry</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            Monitors websites and network devices from this computer and runs recovery scripts when they fail.
          </Typography>
        </Box>
      </Stack>

      {/* Status sheet */}
      <Typography variant="overline" color="text.secondary">Status</Typography>
      <Box sx={{ borderTop: '1px solid', borderColor: 'divider', mb: 4 }}>
        <Row label="Monitoring service">
          {status === null ? <CircularProgress size={14} /> : (
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Tag tone={status.online ? 'ok' : 'down'}>{status.online ? 'ONLINE' : 'UNREACHABLE'}</Tag>
              <Typography sx={{ ...mono, fontSize: 13, color: 'text.secondary' }}>127.0.0.1:8765</Typography>
            </Stack>
          )}
        </Row>
        <Row label="Automatic checks">
          {status === null ? <CircularProgress size={14} /> : !status.online ? (
            <Typography variant="body2" color="text.secondary">Unknown while the service is unreachable</Typography>
          ) : (
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Tag tone={status.running ? 'ok' : 'muted'}>{status.running ? 'RUNNING' : 'PAUSED'}</Tag>
              {status.running && <Typography sx={{ ...mono, fontSize: 13, color: 'text.secondary' }}>every {status.interval} s</Typography>}
            </Stack>
          )}
        </Row>
        <Row label="Version">
          <Typography sx={{ ...mono, fontSize: 13 }}>Desktop app {APP_VERSION} · Monitoring service {APP_VERSION}</Typography>
        </Row>
        <Row label="Updates">
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => { void checkForUpdates(); }}
              disabled={checking}
              startIcon={checking ? <CircularProgress size={14} color="inherit" /> : undefined}
            >
              {checking ? 'Checking…' : 'Check for updates'}
            </Button>
            {update?.url && (
              <Button size="small" variant="contained" startIcon={<OpenInNewIcon />} onClick={() => { window.open(update.url, '_blank'); }}>
                Download update
              </Button>
            )}
            {update && <Typography variant="body2" color="text.secondary" role="status">{update.message}</Typography>}
          </Stack>
        </Row>
      </Box>

      {/* Credits */}
      <Typography variant="overline" color="text.secondary">Credits</Typography>
      <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
        <Typography variant="body2">
          Free and open source, made by <strong>Wlad Ermisch</strong>.
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
          <Button size="small" variant="outlined" startIcon={<OpenInNewIcon />} onClick={() => { window.open(REPO, '_blank'); }}>
            Source on GitHub
          </Button>
          <Button size="small" variant="outlined" startIcon={<OpenInNewIcon />} onClick={() => { window.open('https://ko-fi.com/wladermisch', '_blank'); }}>
            Support on Ko-fi
          </Button>
        </Stack>
      </Box>
    </Box>
  );
}
