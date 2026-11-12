import * as React from 'react';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Badge from '@mui/material/Badge';
import Popover from '@mui/material/Popover';
import ButtonBase from '@mui/material/ButtonBase';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ColorModeIconDropdown from '../../shared-theme/ColorModeIconDropdown';
import SelectContent from './SelectContent';
import { navItems, secondaryNavItems, navigate } from '../nav';
import { fonts, signal } from '../../shared-theme/themePrimitives';
import {
  ACKS_CHANGED, AlertEvent, CheckResult, acknowledgeUntil, alertEvents, formatSince, loadAcks,
} from '../home/boardModel';

const CURRENT_RELEASE = 'v0.7.1';
const UPDATE_DISMISSED_KEY = 'uptime_sentry_update_dismissed';
const SHOWN = 15;

const EVENT_TITLE: Record<AlertEvent['kind'], (name: string) => string> = {
  down: (n) => `${n} went down`,
  up: (n) => `${n} recovered`,
  slow: (n) => `${n} is responding slowly`,
  normal: (n) => `${n} is fast again`,
};

const titles: Record<string, string> = Object.fromEntries(
  [...navItems, ...secondaryNavItems].map((i) => [i.value, i.text]),
);

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export default function Header({ activeTab }: { activeTab: string }) {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [events, setEvents] = React.useState<AlertEvent[]>([]);
  const [acks, setAcks] = React.useState(loadAcks);
  const [update, setUpdate] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => new Date());
  const open = Boolean(anchorEl);

  const load = React.useCallback(async () => {
    const latest = readStorage('uptime_sentry_latest_release');
    setUpdate(latest && latest !== CURRENT_RELEASE && readStorage(UPDATE_DISMISSED_KEY) !== latest ? latest : null);
    setNow(new Date());
    try {
      const r = await fetch('http://127.0.0.1:8765/api/history');
      if (r.ok) setEvents(alertEvents((await r.json()) as CheckResult[]));
    } catch {
      // Backend unreachable: the board itself reports that state.
    }
  }, []);

  React.useEffect(() => {
    void load();
    const interval = setInterval(() => { void load(); }, 5000);
    const onAcks = () => { setAcks(loadAcks()); };
    const onCleared = () => { setEvents([]); setAcks(loadAcks()); void load(); };
    window.addEventListener(ACKS_CHANGED, onAcks);
    window.addEventListener('history-cleared', onCleared);
    return () => {
      clearInterval(interval);
      window.removeEventListener(ACKS_CHANGED, onAcks);
      window.removeEventListener('history-cleared', onCleared);
    };
  }, [load]);

  const isNew = (e: AlertEvent) => (acks[String(e.targetId)] ?? '') < e.ts;
  const unread = events.filter(isNew);
  const unreadDown = unread.some((e) => e.kind === 'down');
  const shown = events.slice(0, SHOWN);

  const acknowledgeAll = () => { acknowledgeUntil(unread.map((e) => ({ targetId: e.targetId, ts: e.ts }))); };

  const openEvent = (e: AlertEvent) => {
    setAnchorEl(null);
    navigate('analytics');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('select-analytics-incident', { detail: { targetId: e.targetId } }));
    }, 50);
  };

  const dismissUpdate = () => {
    try { if (update) localStorage.setItem(UPDATE_DISMISSED_KEY, update); } catch { /* storage unavailable */ }
    setUpdate(null);
  };

  const count = unread.length + (update ? 1 : 0);
  const label = count === 0
    ? 'Notifications'
    : `Notifications, ${count} new${unreadDown ? ', outages present' : ''}`;

  return (
    <Stack
      component="header"
      direction="row"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        height: 56,
        flexShrink: 0,
        alignItems: 'center',
        gap: 1.5,
        px: 3,
        backgroundColor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Typography component="h1" sx={{ fontSize: 18, fontWeight: 700, mr: 'auto' }}>
        {titles[activeTab] ?? 'Home'}
      </Typography>
      <SelectContent />
      <IconButton size="small" aria-label={label} onClick={(e) => { setAnchorEl(e.currentTarget); }}>
        <Badge
          badgeContent={count}
          max={99}
          invisible={count === 0}
          sx={{
            '& .MuiBadge-badge': {
              backgroundColor: unreadDown ? signal.down : signal.change,
              color: '#FFFFFF',
              fontFamily: fonts.mono,
              fontSize: 10,
              fontWeight: 700,
              height: 16,
              minWidth: 16,
              px: 0.5,
            },
          }}
        >
          <NotificationsRoundedIcon />
        </Badge>
      </IconButton>
      <Popover
        anchorEl={anchorEl}
        open={open}
        onClose={() => { setAnchorEl(null); }}
        slotProps={{ paper: { sx: { width: 380, maxHeight: 520, display: 'flex', flexDirection: 'column' } } }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
          <Typography variant="overline" color="text.secondary" sx={{ mr: 'auto' }}>
            Notifications{unread.length > 0 ? ` · ${unread.length} new` : ''}
          </Typography>
          <Button size="small" onClick={acknowledgeAll} disabled={unread.length === 0} startIcon={<CheckRoundedIcon />}>
            Acknowledge all
          </Button>
        </Stack>
        <Box sx={{ overflowY: 'auto' }}>
          {update && (
            <NotificationRow
              tone="info"
              fresh
              title="Update available"
              message={`Version ${update} is ready to download.`}
              time="Release"
              onOpen={() => { setAnchorEl(null); navigate('about'); }}
              action={{ label: 'Dismiss', icon: <CloseRoundedIcon />, onClick: dismissUpdate }}
            />
          )}
          {shown.length === 0 && !update && (
            <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 2 }}>
              No outages, recoveries or slow responses in the last 7 days.
            </Typography>
          )}
          {shown.map((e) => {
            const fresh = isNew(e);
            return (
              <NotificationRow
                key={`${e.targetId}-${e.ts}`}
                tone={e.kind}
                fresh={fresh}
                title={EVENT_TITLE[e.kind](e.targetName)}
                message={e.message}
                time={formatSince(e.ts, now)}
                onOpen={() => { openEvent(e); }}
                action={fresh ? { label: 'Acknowledge', icon: <CheckRoundedIcon />, onClick: () => { acknowledgeUntil([{ targetId: e.targetId, ts: e.ts }]); } } : undefined}
              />
            );
          })}
        </Box>
      </Popover>
      <ColorModeIconDropdown />
    </Stack>
  );
}

function NotificationRow({ tone, fresh, title, message, time, onOpen, action }: {
  tone: AlertEvent['kind'] | 'info';
  fresh: boolean;
  title: string;
  message: string;
  time: string;
  onOpen: () => void;
  action?: { label: string; icon: React.ReactNode; onClick: () => void };
}) {
  return (
    <Stack
      direction="row"
      sx={{
        alignItems: 'flex-start',
        borderBottom: '1px solid',
        borderColor: 'divider',
        '&:last-of-type': { borderBottom: 0 },
        backgroundColor: fresh ? 'action.hover' : 'transparent',
      }}
    >
      <ButtonBase
        onClick={onOpen}
        sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 1.5, textAlign: 'left', py: 1.25, pl: 2, pr: 1, '&:hover': { backgroundColor: 'action.hover' } }}
      >
        <Box
          aria-hidden="true"
          sx={{
            mt: 0.75,
            width: 8,
            height: 8,
            flexShrink: 0,
            borderRadius: '2px',
            backgroundColor: tone === 'down' ? signal.down : tone === 'up' || tone === 'normal' ? 'success.main' : tone === 'slow' ? 'warning.main' : 'text.secondary',
            opacity: fresh ? 1 : 0.45,
          }}
        />
        <Box sx={{ flexGrow: 1, minWidth: 0, opacity: fresh ? 1 : 0.7 }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: fresh ? 700 : 500 }}>{title}</Typography>
            <Box component="span" sx={{ fontFamily: fonts.mono, fontSize: 12, color: 'text.secondary', flexShrink: 0 }}>{time}</Box>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflowWrap: 'anywhere' }}>{message}</Typography>
        </Box>
      </ButtonBase>
      <Box sx={{ width: 40, flexShrink: 0, display: 'grid', placeItems: 'center', pt: 1 }}>
        {action ? (
          <Tooltip title={action.label}>
            <IconButton size="small" aria-label={`${action.label}: ${title}`} onClick={action.onClick} sx={{ '& svg': { fontSize: 18 } }}>
              {action.icon}
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title="Acknowledged">
            <CheckRoundedIcon aria-label="Acknowledged" sx={{ fontSize: 16, color: 'text.disabled', mt: 0.75 }} />
          </Tooltip>
        )}
      </Box>
    </Stack>
  );
}
