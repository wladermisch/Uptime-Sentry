import * as React from 'react';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Badge from '@mui/material/Badge';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded';
import ColorModeIconDropdown from '../../shared-theme/ColorModeIconDropdown';
import SelectContent from './SelectContent';
import { navItems, secondaryNavItems, navigate } from '../nav';
import { fonts, signal } from '../../shared-theme/themePrimitives';

interface CheckResult {
  targetId: number;
  targetName: string;
  timestamp: string;
  success: boolean;
  durationMillis: number;
  message: string;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'down' | 'up' | 'info';
  targetId?: number;
}

const titles: Record<string, string> = Object.fromEntries(
  [...navItems, ...secondaryNavItems].map((i) => [i.value, i.text]),
);

export default function Header({ activeTab }: { activeTab: string }) {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = React.useState<NotificationItem[]>([]);
  const open = Boolean(anchorEl);

  const loadNotifications = React.useCallback(async () => {
    try {
      const items: NotificationItem[] = [];
      const latestTag = localStorage.getItem('uptime_sentry_latest_release');
      if (latestTag && latestTag !== 'v0.4.0') {
        items.push({
          id: 'update-notice',
          title: 'Update available',
          message: `Version ${latestTag} is ready to download.`,
          time: 'Release',
          type: 'info',
        });
      }

      const r = await fetch('http://127.0.0.1:8765/api/history');
      if (r.ok) {
        const historyList = (await r.json()) as CheckResult[];
        const sorted = [...historyList].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        let count = 0;
        for (const check of sorted) {
          if (count >= 4) break;
          if (!check.success) {
            items.push({
              id: `h-${check.timestamp}-${check.targetId}`,
              title: `${check.targetName} is down`,
              message: check.message || 'Check failed.',
              time: check.timestamp.split(' ')[1] || check.timestamp,
              type: 'down',
              targetId: check.targetId,
            });
            count++;
          } else if (check.message && check.message.toLowerCase().includes('recovered')) {
            items.push({
              id: `h-${check.timestamp}-${check.targetId}`,
              title: `${check.targetName} recovered`,
              message: 'Back online.',
              time: check.timestamp.split(' ')[1] || check.timestamp,
              type: 'up',
              targetId: check.targetId,
            });
            count++;
          }
        }
      }
      setNotifications(items);
    } catch {
      // Backend unreachable: the board itself reports that state.
    }
  }, []);

  React.useEffect(() => {
    void loadNotifications();
    const interval = setInterval(() => { void loadNotifications(); }, 5000);
    return () => { clearInterval(interval); };
  }, [loadNotifications]);

  const handleNotificationClick = (item: NotificationItem) => {
    setAnchorEl(null);
    navigate('analytics');
    if (item.targetId) {
      const targetId = item.targetId;
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('select-analytics-incident', { detail: { targetId } }));
      }, 50);
    }
  };

  const hasDown = notifications.some((n) => n.type === 'down');

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
      <IconButton
        size="small"
        aria-label={hasDown ? 'Notifications, outages present' : 'Notifications'}
        onClick={(e) => { setAnchorEl(e.currentTarget); }}
      >
        <Badge variant="dot" invisible={!hasDown} sx={{ '& .MuiBadge-dot': { backgroundColor: signal.down } }}>
          <NotificationsRoundedIcon />
        </Badge>
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => { setAnchorEl(null); }}
        slotProps={{ paper: { sx: { width: 340, maxHeight: 420 } } }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="overline" color="text.secondary">Recent changes</Typography>
        </Box>
        {notifications.length === 0 && (
          <Box sx={{ px: 2, pb: 1.5 }}>
            <Typography variant="body2" color="text.secondary">Nothing has changed recently.</Typography>
          </Box>
        )}
        {notifications.map((item) => (
          <MenuItem
            key={item.id}
            onClick={() => { handleNotificationClick(item); }}
            sx={{ py: 1.25, px: 2, whiteSpace: 'normal', alignItems: 'flex-start', gap: 1.5 }}
          >
            <Box
              aria-hidden="true"
              sx={{
                mt: 0.75,
                width: 8,
                height: 8,
                flexShrink: 0,
                borderRadius: '2px',
                backgroundColor: item.type === 'down' ? signal.down : item.type === 'up' ? 'success.main' : 'text.secondary',
              }}
            />
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.title}</Typography>
                <Box component="span" sx={{ fontFamily: fonts.mono, fontSize: 12, color: 'text.secondary' }}>{item.time}</Box>
              </Stack>
              <Typography variant="caption" color="text.secondary">{item.message}</Typography>
            </Box>
          </MenuItem>
        ))}
      </Menu>
      <ColorModeIconDropdown />
    </Stack>
  );
}
