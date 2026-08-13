import * as React from 'react';
import { styled } from '@mui/material/styles';
import Avatar from '@mui/material/Avatar';
import MuiDrawer, { drawerClasses } from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import SelectContent from './SelectContent';
import MenuContent from './MenuContent';
import CardAlert from './CardAlert';
import OptionsMenu from './OptionsMenu';

const drawerWidth = 240;

const Drawer = styled(MuiDrawer)({
  width: drawerWidth,
  flexShrink: 0,
  boxSizing: 'border-box',
  mt: 10,
  [`& .${drawerClasses.paper}`]: {
    width: drawerWidth,
    boxSizing: 'border-box',
  },
});

export default function SideMenu() {
  return (
    <Drawer
      variant="permanent"
      sx={{
        display: { xs: 'none', md: 'block' },
        [`& .${drawerClasses.paper}`]: {
          backgroundColor: 'background.paper',
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          p: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
          mt: 'calc(var(--template-frame-height, 0px) + 4px)',
        }}
      >
        <Avatar
          variant="rounded"
          sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.9rem', fontWeight: 'bold' }}
        >
          US
        </Avatar>
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 'bold', lineHeight: '16px' }}>
            Uptime Sentry
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            v0.3.1
          </Typography>
        </Box>
      </Box>
      <Box
        sx={{
          overflow: 'auto',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <MenuContent />
      </Box>
      <Divider />
      <Stack
        direction="column"
        sx={{
          p: 2,
          gap: 1.5,
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        <SelectContent />
      </Stack>
    </Drawer>
  );
}
