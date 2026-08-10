import * as React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';

interface CheckResult {
  targetId: number;
  targetName: string;
  timestamp: string;
  success: boolean;
  durationMillis: number;
  message: string;
}

interface UptimeDotsProps {
  history: CheckResult[];
  limit?: number;
}

export default function UptimeDots({ history, limit = 80 }: UptimeDotsProps) {
  // Sort history ascending by timestamp
  const sorted = React.useMemo(() => {
    return [...history].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [history]);

  // Take the most recent 'limit' records
  const recent = React.useMemo(() => {
    return sorted.slice(-limit);
  }, [sorted, limit]);

  // Compute uptime percentage over these records
  const uptimePercentage = React.useMemo(() => {
    if (recent.length === 0) return '100.0';
    const online = recent.filter((r) => r.success).length;
    return ((online / recent.length) * 100).toFixed(1);
  }, [recent]);

  // Pad the array with empty records if it's less than limit
  const paddedList = React.useMemo(() => {
    const list = [...recent];
    const missingCount = limit - list.length;
    
    // Add null elements at the beginning for missing data
    const padding = Array(missingCount).fill(null);
    return [...padding, ...list];
  }, [recent, limit]);

  return (
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 2, py: 1 }}>
      {/* Bars Grid */}
      <Stack direction="row" spacing={0.5} sx={{ flexGrow: 1, alignItems: 'center', height: '32px', width: '100%' }}>
        {paddedList.map((item, index) => {
          if (item === null) {
            return (
              <Tooltip key={`missing-${80 - index}`} title="No data recorded for this interval">
                <Box
                  sx={{
                    flexGrow: 1,
                    minWidth: '2px',
                    maxWidth: '8px',
                    height: '100%',
                    borderRadius: '2px',
                    bgcolor: 'action.disabledBackground',
                    cursor: 'default',
                    opacity: 0.3
                  }}
                />
              </Tooltip>
            );
          }

          const tooltipText = `${item.timestamp} - ${item.success ? 'Online' : 'Offline'} (${item.durationMillis}ms) - ${item.message}`;
          return (
            <Tooltip key={`check-${item.timestamp}-${item.targetName}-${index}`} title={tooltipText}>
              <Box
                sx={{
                  flexGrow: 1,
                  minWidth: '2px',
                  maxWidth: '8px',
                  height: '100%',
                  borderRadius: '2px',
                  bgcolor: item.success ? 'success.main' : 'error.main',
                  cursor: 'pointer',
                  '&:hover': {
                    transform: 'scaleY(1.1)',
                  },
                  transition: 'transform 0.1s ease',
                }}
              />
            </Tooltip>
          );
        })}
      </Stack>

      {/* Percentage */}
      <Box sx={{ minWidth: '60px', textAlign: 'right' }}>
        <Typography variant="body2" sx={{ fontWeight: 'bold', color: Number(uptimePercentage) < 95 ? 'warning.main' : 'success.main' }}>
          {uptimePercentage}%
        </Typography>
      </Box>
    </Stack>
  );
}
