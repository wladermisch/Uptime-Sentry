import { GridColDef } from '@mui/x-data-grid';

export const columns: GridColDef[] = [
  { field: 'id', headerName: 'ID', width: 70 },
  { field: 'name', headerName: 'Target Name', width: 180 },
  { field: 'type', headerName: 'Type', width: 100 },
  { field: 'host', headerName: 'Host / IP', width: 220 },
  { field: 'status', headerName: 'Status', width: 120 },
  { field: 'responseTime', headerName: 'Resp. Time (ms)', width: 150 },
  { field: 'timestamp', headerName: 'Timestamp', width: 200 },
];

export const rows = [
  { id: 1, name: 'Google DNS', type: 'PING', host: '8.8.8.8', status: 'Online', responseTime: 12, timestamp: '2026-08-09 19:50:00' },
  { id: 2, name: 'GitHub Portal', type: 'HTTP', host: 'https://github.com', status: 'Online', responseTime: 142, timestamp: '2026-08-09 19:50:10' },
  { id: 3, name: 'Local Test Server', type: 'HTTP', host: 'http://localhost:8080', status: 'Offline', responseTime: 0, timestamp: '2026-08-09 19:50:15' },
];
