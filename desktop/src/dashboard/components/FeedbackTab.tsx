import * as React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { fonts, gray, ink, paper } from '../../shared-theme/themePrimitives';
import { API } from '../historyStats';
import { Pass, PassHead, PassSection } from './workspace';

const ISSUES_URL = 'https://github.com/wladermisch/Uptime-Sentry/issues';

/** A log line with its 1-based position, which doubles as a stable React key. */
interface LogLine {
  no: number;
  text: string;
}

type LogState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; lines: LogLine[] };

export default function FeedbackTab() {
  const [logs, setLogs] = React.useState<LogState>({ kind: 'loading' });
  const [copied, setCopied] = React.useState(false);

  const fetchLogs = React.useCallback(async () => {
    setLogs({ kind: 'loading' });
    try {
      const r = await fetch(`${API}/api/logs`);
      if (!r.ok) throw new Error(String(r.status));
      const raw: unknown = await r.json();
      const texts = Array.isArray(raw) ? raw.filter((l): l is string => typeof l === 'string') : [];
      setLogs({ kind: 'ready', lines: texts.map((text, i) => ({ no: i + 1, text })) });
    } catch {
      setLogs({ kind: 'error' });
    }
  }, []);

  React.useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  const handleCopy = React.useCallback(async () => {
    if (logs.kind !== 'ready') return;
    try {
      await navigator.clipboard.writeText(logs.lines.map((l) => l.text).join('\n'));
      setCopied(true);
      setTimeout(() => { setCopied(false); }, 2000);
    } catch {
      // Clipboard unavailable: leave the button as it was.
    }
  }, [logs]);

  const lines = logs.kind === 'ready' ? logs.lines : [];

  return (
    <Pass aria-label="Report a problem" maxWidth={1100}>
      <PassHead
        title="Report a problem"
        description="Copy the recent log below and paste it into a new GitHub issue together with what you were doing. It contains target names and hosts, so remove anything you don't want to share."
      />

      <PassSection label={`Service log${logs.kind === 'ready' ? ` · ${lines.length} lines` : ''}`}>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <Button size="small" variant="outlined" startIcon={<RefreshIcon />} onClick={() => { void fetchLogs(); }}>
          Refresh
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={copied ? <CheckRoundedIcon /> : <ContentCopyIcon />}
          onClick={() => { void handleCopy(); }}
          disabled={lines.length === 0}
        >
          {copied ? 'Copied' : 'Copy log'}
        </Button>
        <Button size="small" variant="contained" startIcon={<OpenInNewIcon />} onClick={() => { window.open(ISSUES_URL, '_blank', 'noopener'); }}>
          Open GitHub issues
        </Button>
      </Stack>

      <Box
        role="log"
        className="selectable"
        aria-label="Service log"
        tabIndex={0}
        sx={{
          backgroundColor: ink,
          color: paper,
          border: '1px solid',
          borderColor: gray[800],
          borderRadius: 1.5,
          p: 2,
          height: 'clamp(240px, calc(100vh - 380px), 640px)',
          overflow: 'auto',
          fontFamily: fonts.mono,
          fontSize: 12.5,
          lineHeight: 1.6,
          '&:focus-visible': { outline: `2px solid ${gray[400]}`, outlineOffset: 2 },
          '& ::selection': { backgroundColor: paper, color: ink },
        }}
      >
        {logs.kind === 'loading' && <Box sx={{ color: gray[400] }}>Loading log…</Box>}
        {logs.kind === 'error' && (
          <Box sx={{ color: gray[300] }}>Can't reach the monitoring service at 127.0.0.1:8765, so the log is unavailable.</Box>
        )}
        {logs.kind === 'ready' && lines.length === 0 && <Box sx={{ color: gray[400] }}>The log is empty.</Box>}
        {lines.map((line) => {
          const level = /\[(ERROR|WARN(?:ING)?)\]/.exec(line.text)?.[1];
          return (
            <Box key={line.no} sx={{ display: 'grid', gridTemplateColumns: '3.5em 1fr', gap: 2 }}>
              <Box component="span" sx={{ color: gray[500], textAlign: 'right', userSelect: 'none' }}>{line.no}</Box>
              <Box component="span" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: level ? (level === 'ERROR' ? '#FF8F89' : '#F7CD6B') : paper }}>
                {line.text}
              </Box>
            </Box>
          );
        })}
      </Box>
      </PassSection>
    </Pass>
  );
}
