import * as React from 'react';
import Stack from '@mui/material/Stack';
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded';
import NavbarBreadcrumbs from './NavbarBreadcrumbs';
import MenuButton from './MenuButton';
import ColorModeIconDropdown from '../../shared-theme/ColorModeIconDropdown';
import Search from './Search';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import ErrorIcon from '@mui/icons-material/Error';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoIcon from '@mui/icons-material/Info';

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
  timestamp: string;
  type: 'error' | 'success' | 'info';
  targetId?: number;
}

export default function Header() {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = React.useState<NotificationItem[]>([]);
  const open = Boolean(anchorEl);

  const loadNotifications = React.useCallback(async () => {
    try {
      const items: NotificationItem[] = [];

      // 1. Check if there's a cached update available
      const latestTag = localStorage.getItem('uptime_sentry_latest_release');
      if (latestTag && latestTag !== 'v0.4.0') {
        items.push({
          id: 'update-notice',
          title: 'Update Available',
          message: `New version (${latestTag}) is ready for download.`,
          timestamp: 'Release Update',
          type: 'info',
        });
      }

      // 2. Fetch history for recent outages or recoveries
      const r = await fetch('http://127.0.0.1:8765/api/history');
      if (r.ok) {
        const historyList = (await r.json()) as CheckResult[];
        
        // Filter for outages or recovery messages in history
        const sortedHistory = [...historyList].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        
        // Collect latest failures or successes
        let count = 0;
        for (const check of sortedHistory) {
          if (count >= 3) break;
          
          if (!check.success) {
            items.push({
              id: `history-${check.timestamp}-${check.targetId}`,
              title: `${check.targetName} Offline`,
              message: check.message || 'Verification check failed.',
              timestamp: check.timestamp.split(' ')[1] || check.timestamp,
              type: 'error',
              targetId: check.targetId,
            });
            count++;
          } else if (check.message && check.message.toLowerCase().includes('recovered')) {
            items.push({
              id: `history-${check.timestamp}-${check.targetId}`,
              title: `${check.targetName} Recovered`,
              message: 'Service returned to online status.',
              timestamp: check.timestamp.split(' ')[1] || check.timestamp,
              type: 'success',
              targetId: check.targetId,
            });
            count++;
          }
        }
      }

      // Fill in fallback message if empty
      if (items.length === 0) {
        items.push({
          id: 'all-clear',
          title: 'All Systems Operational',
          message: 'No service disruptions recorded.',
          timestamp: 'Now',
          type: 'success',
        });
      }

      setNotifications(items);
    } catch (e) {
      console.warn('Could not load notifications history:', e);
    }
  }, []);

  React.useEffect(() => {
    void loadNotifications();
    const interval = setInterval(() => {
      void loadNotifications();
    }, 5000);
    return () => {
      clearInterval(interval);
    };
  }, [loadNotifications]);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleNotificationClick = (item: NotificationItem) => {
    handleClose();
    window.dispatchEvent(new CustomEvent('nav-tab', { detail: 'analytics' }));
    if (item.targetId) {
      window.dispatchEvent(new CustomEvent('select-analytics-incident', { detail: { targetId: item.targetId } }));
    }
  };

  return (
    <Stack
      direction="row"
      sx={{
        display: { xs: 'none', md: 'flex' },
        width: '100%',
        alignItems: { xs: 'flex-start', md: 'center' },
        justifyContent: 'space-between',
        maxWidth: { sm: '100%', md: '1700px' },
        pt: 1.5,
      }}
      spacing={2}
    >
      <NavbarBreadcrumbs />
      <Stack direction="row" sx={{ gap: 1 }}>
        <Search />
        <MenuButton 
          showBadge={notifications.some(n => n.type === 'error')} 
          aria-label="Open notifications"
          onClick={handleClick}
        >
          <NotificationsRoundedIcon />
        </MenuButton>
        <Menu
          anchorEl={anchorEl}
          open={open}
          onClose={handleClose}
          slotProps={{
            paper: {
              sx: {
                width: 320,
                maxHeight: 400,
                mt: 1.5,
                boxShadow: '0px 4px 20px rgba(0,0,0,0.15)',
                borderRadius: 2,
              }
            }
          }}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
              Notifications
            </Typography>
          </Box>
          <Divider />
          {notifications.map((item) => (
            <MenuItem key={item.id} onClick={() => { handleNotificationClick(item); }} sx={{ py: 1.5, px: 2, whiteSpace: 'normal' }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start', width: '100%' }}>
                {item.type === 'error' && <ErrorIcon color="error" sx={{ mt: 0.2 }} />}
                {item.type === 'success' && <CheckCircleIcon color="success" sx={{ mt: 0.2 }} />}
                {item.type === 'info' && <InfoIcon color="info" sx={{ mt: 0.2 }} />}
                
                <Box sx={{ flexGrow: 1 }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      {item.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.timestamp}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {item.message}
                  </Typography>
                </Box>
              </Stack>
            </MenuItem>
          ))}
        </Menu>
        <ColorModeIconDropdown />
      </Stack>
    </Stack>
  );
}
