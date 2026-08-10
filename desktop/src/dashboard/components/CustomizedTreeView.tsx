import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Collapse from '@mui/material/Collapse';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import WebIcon from '@mui/icons-material/Web';
import SettingsInputComponentIcon from '@mui/icons-material/SettingsInputComponent';
import StorageIcon from '@mui/icons-material/Storage';
import CircleIcon from '@mui/icons-material/FiberManualRecord';

interface TreeItem {
  id: string;
  label: string;
  color?: 'green' | 'blue';
}

interface TreeGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  children: TreeItem[];
}

export default function CustomizedTreeView() {
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({
    '1': true,
    '2': false,
    '3': true,
  });

  const handleToggle = (id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const groups: TreeGroup[] = [
    {
      id: '1',
      label: 'Websites',
      icon: <WebIcon fontSize="small" />,
      children: [
        { id: '1.1', label: 'Home Page (HTTP)', color: 'green' },
        { id: '1.2', label: 'Pricing Page (HTTP)', color: 'green' },
        { id: '1.3', label: 'Checkout Service (HTTP)', color: 'green' },
      ],
    },
    {
      id: '2',
      label: 'Databases',
      icon: <StorageIcon fontSize="small" />,
      children: [
        { id: '2.1', label: 'Primary DB (PING)', color: 'green' },
        { id: '2.2', label: 'Replica DB (PING)', color: 'green' },
      ],
    },
    {
      id: '3',
      label: 'API Gateways',
      icon: <SettingsInputComponentIcon fontSize="small" />,
      children: [
        { id: '3.1', label: 'Auth Gateway (HTTP)', color: 'green' },
        { id: '3.2', label: 'User Gateway (HTTP)', color: 'blue' },
      ],
    },
  ];

  return (
    <Card variant="outlined" sx={{ display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1 }}>
      <CardContent>
        <Typography component="h2" variant="subtitle2" gutterBottom>
          Product Tree
        </Typography>
        <List sx={{ width: '100%', bgcolor: 'background.paper', p: 0 }} component="nav">
          {groups.map((group) => {
            const isOpen = !!openGroups[group.id];
            return (
              <Box key={group.id} sx={{ mb: 1 }}>
                <ListItemButton onClick={() => { handleToggle(group.id); }} sx={{ py: 0.5, px: 1, borderRadius: 1 }}>
                  <ListItemIcon sx={{ minWidth: 32, color: 'text.secondary' }}>
                    {group.icon}
                  </ListItemIcon>
                  <ListItemText 
                    primary={<Typography variant="body2" sx={{ fontWeight: 'medium' }}>{group.label}</Typography>} 
                  />
                  {isOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                </ListItemButton>
                <Collapse in={isOpen} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding sx={{ pl: 4 }}>
                    {group.children.map((child) => (
                      <ListItemButton key={child.id} sx={{ py: 0.25, px: 1, borderRadius: 1 }}>
                        <ListItemIcon sx={{ minWidth: 20 }}>
                          <CircleIcon 
                            sx={{ 
                              fontSize: 8, 
                              color: child.color === 'green' ? 'success.main' : 'primary.main' 
                            }} 
                          />
                        </ListItemIcon>
                        <ListItemText 
                          primary={<Typography variant="caption" color="text.secondary">{child.label}</Typography>} 
                        />
                      </ListItemButton>
                    ))}
                  </List>
                </Collapse>
              </Box>
            );
          })}
        </List>
      </CardContent>
    </Card>
  );
}
