import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import type { CheckOutcome } from './useBoard';
import { BoardRow, formatClock, formatDuration, parseTs } from './boardModel';
import { condensed, fonts, signal, green } from '../../shared-theme/themePrimitives';

const mono = { fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' } as const;

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ ...mono, fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'text.secondary' }}>
      {children}
    </Box>
  );
}

function Field({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'down' | 'change' }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Label>{label}</Label>
      <Box
        sx={(theme) => ({
          ...mono,
          mt: 0.5,
          fontSize: 15,
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: tone === 'down' ? signal.downInk : tone === 'change' ? signal.changeInk : (theme.vars || theme).palette.text.primary,
          ...theme.applyStyles('dark', {
            color: tone === 'down' ? signal.downOnDark : tone === 'change' ? signal.change : (theme.vars || theme).palette.text.primary,
          }),
        })}
      >
        {value}
      </Box>
    </Box>
  );
}

/** A pass segment; adjoining segments are joined by a perforated rule. */
function Segment({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <Box
      sx={{
        px: 3,
        py: 2,
        borderTop: first ? 'none' : '1px dashed',
        borderColor: 'divider',
      }}
    >
      {children}
    </Box>
  );
}

/** Recent checks as a strip: bar height is latency on a log scale, a failed check is a full red bar. */
function CheckStrip({ row }: { row: BoardRow }) {
  const slots = 48;
  const checks = row.recent.slice(-slots);
  const max = Math.max(1, ...checks.filter((c) => c.success).map((c) => c.durationMillis));
  const pad = Math.max(0, slots - checks.length);
  return (
    <Box
      role="img"
      aria-label={`Last ${checks.length} checks, ${checks.filter((c) => !c.success).length} failed`}
      sx={{ display: 'grid', gridTemplateColumns: `repeat(${slots}, 1fr)`, gap: '2px', alignItems: 'end', height: 44, mt: 1.25 }}
    >
      {Array.from({ length: pad }).map((_, i) => (
        <Box key={`slot-${i}`} sx={{ height: 2, backgroundColor: 'divider' }} />
      ))}
      {checks.map((c, i) => {
        const h = c.success ? 18 + 82 * (Math.log1p(Math.max(0, c.durationMillis)) / Math.log1p(max)) : 100;
        return (
          // Keyed by slot: several checks can share a timestamp (a manual check in the same second as an
          // automatic one), and duplicate keys made React leave old bars behind.
          <Tooltip
            key={`slot-${pad + i}`}
            title={`${formatClock(c.timestamp)} · ${c.success ? `${c.durationMillis} ms` : c.message || 'failed'}`}
            disableInteractive
          >
            <Box sx={{ height: `${h}%`, backgroundColor: c.success ? 'text.primary' : signal.down, borderRadius: '1px' }} />
          </Tooltip>
        );
      })}
    </Box>
  );
}

/** Allow line breaks after path and argument separators instead of mid-word. */
function Breakable({ text }: { text: string }) {
  const parts = text.split(/(?<=[\\/ ])/);
  return (
    <>
      {parts.map((p, i) => (
        <React.Fragment key={i}>{p}{i < parts.length - 1 && <wbr />}</React.Fragment>
      ))}
    </>
  );
}

interface TargetPassProps {
  row: BoardRow | null;
  now: Date;
  checking: boolean;
  onCheck: () => Promise<CheckOutcome | null>;
  onAcknowledge: () => void;
  onEdit: () => void;
  onHistory: () => void;
}

const OUTCOME_MS = 3000;

/** Runs a manual check and keeps its result on the button for a few seconds. */
function useCheckFeedback(targetId: number | undefined, onCheck: () => Promise<CheckOutcome | null>) {
  const [outcome, setOutcome] = React.useState<CheckOutcome | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setOutcome(null);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [targetId]);

  const run = async () => {
    if (timer.current) clearTimeout(timer.current);
    setOutcome(null);
    const result = await onCheck();
    setOutcome(result);
    timer.current = setTimeout(() => { setOutcome(null); }, OUTCOME_MS);
  };

  return { outcome, run };
}

function outcomeLabel(o: CheckOutcome) {
  if (o.kind === 'up') return `Up · ${o.latency} ms`;
  if (o.kind === 'down') return 'Still down';
  return o.message;
}

export default function TargetPass({ row, now, checking, onCheck, onAcknowledge, onEdit, onHistory }: TargetPassProps) {
  const { outcome, run } = useCheckFeedback(row?.target.id, onCheck);

  if (!row) {
    return (
      <Box sx={{ p: 3, color: 'text.secondary', fontSize: 14 }}>
        Select a target on the board to see its details.
      </Box>
    );
  }

  const { target } = row;
  const down = row.state === 'down';
  const tone = down ? 'down' : row.recovered ? 'change' : undefined;
  const sinceLabel = down ? 'Down since' : row.state === 'up' ? 'Up since' : 'Since';
  const sinceDate = row.since ? parseTs(row.since) : null;
  const failed = row.recent.filter((c) => !c.success).length;
  const limit = target.consecutiveFailuresLimit || 1;

  return (
    <Box component="section" aria-label={`${target.name} details`} sx={{ display: 'flex', flexDirection: 'column' }}>
      <Segment first>
        <Box component="h2" sx={{ m: 0, ...condensed, fontSize: 32, lineHeight: 1.05, letterSpacing: '-0.005em', overflowWrap: 'anywhere' }}>
          {target.name}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75, minWidth: 0 }}>
          <Box sx={{ ...mono, flexShrink: 0, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', px: 0.75, py: '1px', border: '1px solid', borderColor: 'divider', borderRadius: '3px', color: 'text.secondary' }}>
            {target.type}
          </Box>
          <Box sx={{ ...mono, fontSize: 13, color: 'text.secondary', overflowWrap: 'anywhere' }}>
            <Breakable text={target.host} />
          </Box>
        </Box>
      </Segment>

      <Segment>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <Field
            label={sinceLabel}
            tone={tone}
            value={sinceDate && row.since ? (sinceDate.toDateString() === now.toDateString() ? formatClock(row.since) : row.since.slice(5, 16)) : '—'}
          />
          <Field label="Duration" tone={tone} value={row.since ? formatDuration(row.since, now) : '—'} />
          <Field
            label="Failed in a row"
            tone={row.consecutiveFails > 0 ? 'down' : undefined}
            value={
              <>
                {row.consecutiveFails}
                <Box component="span" sx={{ fontSize: 12, fontWeight: 400, color: 'text.secondary', ml: 1 }}>
                  · threshold {limit}
                </Box>
              </>
            }
          />
          <Field label={down ? 'Timeout' : 'Latency'} value={down ? `${target.timeout} s` : row.latency === null ? '—' : `${row.latency} ms`} />
        </Box>
      </Segment>

      <Segment>
        <Label>Last result</Label>
        <Box sx={{ ...mono, mt: 0.75, fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word' }}>{row.message}</Box>
        {row.lastChecked && (
          <Box sx={{ ...mono, mt: 0.5, fontSize: 12, color: 'text.secondary' }}>checked {formatClock(row.lastChecked)}</Box>
        )}
      </Segment>

      <Segment>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Label>Recent checks</Label>
          <Box sx={{ ...mono, fontSize: 12, color: 'text.secondary' }}>
            {row.recent.length === 0 ? 'none yet' : `${row.recent.length} checks · ${failed} failed`}
          </Box>
        </Box>
        <CheckStrip row={row} />
      </Segment>

      <Segment>
        <Label>On failure</Label>
        <Box sx={{ ...mono, mt: 0.75, fontSize: 13, lineHeight: 1.5, color: target.recoveryAction ? 'text.primary' : 'text.secondary', overflowWrap: 'anywhere' }}>
          {target.recoveryAction ? <Breakable text={target.recoveryAction} /> : 'No recovery action set'}
        </Box>
        {target.recoveryAction && (
          <Box sx={{ mt: 0.5, fontSize: 12, color: 'text.secondary' }}>
            Runs automatically after {limit} failed {limit === 1 ? 'check' : 'checks'} in a row.
          </Box>
        )}
      </Segment>

      <Box
        sx={(theme) => ({
          position: 'sticky',
          bottom: 0,
          px: 3,
          pt: 1.5,
          pb: 2,
          borderTop: '1px dashed',
          borderColor: 'divider',
          borderRadius: '0 0 10px 10px',
          backgroundColor: '#FFFFFF',
          // A short fade above the footer: content scrolling behind it reads as scrolled, not clipped.
          '&::before': {
            content: '""',
            position: 'absolute',
            left: 0,
            right: 0,
            top: -28,
            height: 28,
            pointerEvents: 'none',
            background: 'linear-gradient(to bottom, rgba(255, 255, 255, 0), #FFFFFF)',
          },
          ...theme.applyStyles('dark', {
            backgroundColor: '#0B0D10',
            '&::before': { background: 'linear-gradient(to bottom, rgba(11, 13, 16, 0), #0B0D10)' },
          }),
        })}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          <Button
            variant="contained"
            size="small"
            onClick={() => { void run(); }}
            disabled={checking}
            startIcon={
              checking ? <CircularProgress size={14} color="inherit" />
              : outcome?.kind === 'up' ? <CheckRoundedIcon />
              : outcome?.kind === 'down' ? <CloseRoundedIcon />
              : outcome?.kind === 'error' ? <ErrorOutlineRoundedIcon />
              : undefined
            }
            sx={{
              whiteSpace: 'nowrap',
              transition: 'background-color 160ms ease-out, border-color 160ms ease-out',
              ...(outcome?.kind === 'up' && {
                backgroundColor: `${green[500]} !important`,
                borderColor: `${green[500]} !important`,
                color: '#FFFFFF !important',
              }),
              ...(outcome?.kind === 'down' && {
                backgroundColor: `${signal.down} !important`,
                borderColor: `${signal.down} !important`,
                color: '#FFFFFF !important',
              }),
            }}
          >
            {checking ? 'Checking…' : outcome ? outcomeLabel(outcome) : 'Check now'}
          </Button>
          <Button variant="outlined" size="small" onClick={onAcknowledge} disabled={!row.unseen}>
            {row.unseen ? 'Acknowledge' : 'Acknowledged'}
          </Button>
        </Box>
        <Box role="status" aria-live="polite" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {outcome ? `${target.name}: ${outcomeLabel(outcome)}` : ''}
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, mx: -1 }}>
          <Button variant="text" size="small" onClick={onHistory}>View history</Button>
          <Button variant="text" size="small" onClick={onEdit}>Edit target</Button>
        </Box>
      </Box>
    </Box>
  );
}
