import * as React from 'react';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';

const columns: GridColDef[] = [
  { field: 'id', headerName: 'ID', width: 80 },
  { field: 'targetName', headerName: 'Target Name', width: 200 },
  { field: 'timestamp', headerName: 'Timestamp', width: 200 },
  { 
    field: 'success', 
    headerName: 'Status', 
    width: 130,
    renderCell: (params) => {
      const isOnline = params.value;
      return (
        <Chip 
          label={isOnline ? 'ONLINE' : 'OFFLINE'} 
          color={isOnline ? 'success' : 'error'} 
          size="small" 
          variant="outlined"
        />
      );
    }
  },
  { 
    field: 'durationMillis', 
    headerName: 'Response (ms)', 
    width: 150,
    renderCell: (params) => `${params.value} ms`
  },
  { field: 'message', headerName: 'Message', width: 250 },
];

export default function CustomizedDataGrid() {
  const [rows, setRows] = React.useState<Record<string, unknown>[]>([]);

  const fetchHistory = React.useCallback(async () => {
    try {
      const r = await fetch('http://127.0.0.1:8765/api/history');
      if (r.ok) {
        const data = await r.json();
        // Add a unique key (id) for each row if not present
        const mapped = data.map((item: Record<string, unknown>, index: number) => ({
          id: item.id || index + 1,
          ...item
        }));
        setRows(mapped);
      }
    } catch (e) {
      console.error('Failed to fetch monitoring history:', e);
    }
  }, []);

  React.useEffect(() => {
    void fetchHistory();
    const timer = setInterval(() => {
      void fetchHistory();
    }, 5000);
    return () => {
      clearInterval(timer);
    };
  }, [fetchHistory]);

  return (
    <Box sx={{ width: '100%', maxHeight: 700, overflow: 'auto' }}>
      <DataGrid
        autoHeight
        rows={rows}
        columns={columns}
        getRowClassName={(params) =>
          params.indexRelativeToCurrentPage % 2 === 0 ? 'even' : 'odd'
        }
        initialState={{
          pagination: { paginationModel: { pageSize: 10 } },
        }}
        pageSizeOptions={[5, 10, 20]}
        disableRowSelectionOnClick
        density="compact"
      />
    </Box>
  );
}
