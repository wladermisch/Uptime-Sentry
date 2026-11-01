import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputBase from '@mui/material/InputBase';
import CircularProgress from '@mui/material/CircularProgress';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { useBoard } from '../home/useBoard';
import GateBoard from '../home/GateBoard';
import TargetPass from '../home/TargetPass';
import { BoardSort, DEFAULT_SORT, formatClock, nextSort, parseTs, sortRows } from '../home/boardModel';
import { navigate } from '../nav';
import { condensed, fonts, signal, ink, gray } from '../../shared-theme/themePrimitives';

const mono = { fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' } as const;

function Count({ n, label, tone }: { n: number; label: string; tone?: 'down' | 'change' }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.75 }}>
      <Box
        component="span"
        sx={(theme) => ({
          ...mono,
          fontSize: 20,
          fontWeight: 700,
          color: n > 0 && tone === 'down' ? signal.downInk : n > 0 && tone === 'change' ? signal.changeInk : (theme.vars || theme).palette.text.primary,
          ...theme.applyStyles('dark', {
            color: n > 0 && tone === 'down' ? signal.downOnDark : n > 0 && tone === 'change' ? signal.change : (theme.vars || theme).palette.text.primary,
          }),
        })}
      >
        {n}
      </Box>
      <Box component="span" sx={{ fontSize: 13, color: 'text.secondary' }}>{label}</Box>
    </Box>
  );
}

/** Seconds until the next automatic check cycle, ticking once a second. */
function useCountdown(lastCycle: string | null, intervalSeconds: number | null, running: boolean) {
  const [tick, setTick] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => { setTick(Date.now()); }, 1000);
    return () => { clearInterval(t); };
  }, [running]);
  if (!running || !lastCycle || !intervalSeconds) return null;
  const next = parseTs(lastCycle).getTime() + intervalSeconds * 1000;
  return Math.round((next - tick) / 1000);
}

function formatCountdown(sec: number) {
  if (sec <= 0) return 'next check due';
  const m = Math.floor(sec / 60);
  return `next check in ${m}:${String(sec % 60).padStart(2, '0')}`;
}

function EmptyBoard({ hasProfile, profileName }: { hasProfile: boolean; profileName?: string }) {
  return (
    <Box sx={{ px: 3, py: 6, maxWidth: 520 }}>
      <Box component="h2" sx={{ m: 0, fontSize: 18, fontWeight: 700 }}>
        {hasProfile ? `No targets on ${profileName} yet` : 'No profile selected'}
      </Box>
      <Box sx={{ mt: 1, fontSize: 14, color: 'text.secondary', lineHeight: 1.55 }}>
        {hasProfile
          ? 'Add a website, server or device and it shows up here with its live status, ranked by what needs attention.'
          : 'Pick a profile in the header, or create one to start monitoring.'}
      </Box>
      <Button
        variant="contained"
        size="small"
        sx={{ mt: 2.5 }}
        onClick={() => { navigate(hasProfile ? 'targets' : 'profiles'); }}
      >
        {hasProfile ? 'Add a target' : 'Open profiles'}
      </Button>
    </Box>
  );
}

/** Home: the live gate board with the selected target's pass beside it. */
export default function MainGrid() {
  const board = useBoard();
  const { rows, summary, status, autoCheck, lastCycle, now, checking, profile } = board;
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState<BoardSort>(DEFAULT_SORT);
  const [checkingAll, setCheckingAll] = React.useState(false);
  const countdown = useCountdown(lastCycle, autoCheck?.intervalSeconds ?? null, !!autoCheck?.running);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => r.target.name.toLowerCase().includes(q) || r.target.host.toLowerCase().includes(q))
      : rows;
    return sortRows(filtered, sort);
  }, [rows, query, sort]);

  const selected = visible.find((r) => r.target.id === selectedId) ?? visible[0] ?? null;

  const handleCheckAll = async () => {
    setCheckingAll(true);
    await board.checkAll();
    setCheckingAll(false);
  };

  const unseenIds = rows.filter((r) => r.unseen).map((r) => r.target.id);
  const verdict =
    rows.length === 0 ? '' :
    summary.down > 0 ? `${summary.down} ${summary.down === 1 ? 'target is' : 'targets are'} down` :
    summary.recovered > 0 ? 'Everything is back up' :
    summary.pending === rows.length ? 'Waiting for the first check' :
    'All targets are up';

  return (
    <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
      {/* Board column */}
      <Box
        sx={(theme) => ({
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#FFFFFF',
          ...theme.applyStyles('dark', { backgroundColor: ink }),
        })}
      >
        {/* Board strip: verdict, cycle, board-wide actions */}
        <Box sx={{ px: 3, pt: 2.5, pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
            <Box sx={{ mr: 'auto', minWidth: 0 }}>
              <Box component="h2" sx={{ m: 0, ...condensed, fontSize: 30, letterSpacing: '-0.005em', lineHeight: 1.1 }}>
                {verdict || (profile ? profile.name : 'Home')}
              </Box>
              <Box sx={{ ...mono, fontSize: 12, color: 'text.secondary', mt: 0.5, display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 2 }}>
                <span>{lastCycle ? `last check ${formatClock(lastCycle)}` : 'no checks yet'}</span>
                {autoCheck && (
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', columnGap: 1, whiteSpace: 'nowrap' }}>
                    <span>
                      {autoCheck.running
                        ? `${countdown === null ? 'auto-check' : formatCountdown(countdown)} · every ${autoCheck.intervalSeconds} s`
                        : 'auto-check paused'}
                    </span>
                    <Button
                      variant="text"
                      size="small"
                      onClick={() => { void board.setAutoCheckRunning(!autoCheck.running); }}
                      sx={{ height: 24, px: 0.75, minWidth: 0, fontSize: 12, textDecoration: 'underline', textUnderlineOffset: 3 }}
                    >
                      {autoCheck.running ? 'Pause' : 'Resume'}
                    </Button>
                  </Box>
                )}
              </Box>
            </Box>
            <Button
              variant="outlined"
              size="small"
              disabled={unseenIds.length === 0}
              onClick={() => { board.acknowledge(unseenIds); }}
              sx={{ flexShrink: 0 }}
            >
              Acknowledge all
            </Button>
            <Button
              sx={{ flexShrink: 0 }}
              variant="contained"
              size="small"
              disabled={rows.length === 0 || checkingAll || status === 'offline'}
              onClick={() => { void handleCheckAll(); }}
              startIcon={checkingAll ? <CircularProgress size={14} color="inherit" /> : undefined}
            >
              {checkingAll ? 'Checking…' : 'Check all now'}
            </Button>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', columnGap: 3, rowGap: 1, mt: 2, flexWrap: 'wrap' }}>
            <Count n={summary.down} label="down" tone="down" />
            <Count n={summary.recovered} label="recovered" tone="change" />
            <Count n={summary.up} label="up" />
            {summary.pending > 0 && <Count n={summary.pending} label="pending" />}
            <Box
              sx={{
                ml: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                height: 32,
                px: 1.25,
                width: 220,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1.5,
                color: 'text.secondary',
                '&:focus-within': { borderColor: 'text.primary' },
              }}
            >
              <SearchRoundedIcon sx={{ fontSize: 18 }} />
              <InputBase
                value={query}
                onChange={(e) => { setQuery(e.target.value); }}
                placeholder="Filter by name or host"
                inputProps={{ 'aria-label': 'Filter targets by name or host' }}
                sx={{ fontSize: 13, flex: 1, color: 'text.primary', '& input::placeholder': { color: 'text.secondary', opacity: 1 } }}
              />
            </Box>
          </Box>
        </Box>

        {status === 'offline' && (
          <Box
            role="alert"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              px: 3,
              py: 1.25,
              fontSize: 13,
              backgroundColor: 'action.selected',
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Box sx={{ flex: 1 }}>
              <strong>Can't reach the monitoring service</strong> at 127.0.0.1:8765. The board shows the last data it received.
            </Box>
            <Button size="small" variant="outlined" onClick={() => { void board.reload(); }}>Retry</Button>
          </Box>
        )}

        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <GateBoard
            rows={visible}
            loading={status === 'loading'}
            selectedId={selected ? selected.target.id : null}
            onSelect={setSelectedId}
            sort={sort}
            onSort={(key) => { setSort((s) => nextSort(s, key)); }}
            now={now}
            empty={
              query && rows.length > 0 ? (
                <Box sx={{ px: 3, py: 4, fontSize: 14, color: 'text.secondary' }}>
                  No target matches “{query}”.{' '}
                  <Button size="small" variant="text" onClick={() => { setQuery(''); }}>Clear filter</Button>
                </Box>
              ) : (
                <EmptyBoard hasProfile={!!profile} profileName={profile?.name} />
              )
            }
          />
        </Box>
      </Box>

      {/* Pass column */}
      <Box
        component="aside"
        sx={(theme) => ({
          width: { xs: 340, lg: 380 },
          flexShrink: 0,
          overflow: 'auto',
          p: 2,
          backgroundColor: gray[200],
          borderLeft: `1px solid ${(theme.vars || theme).palette.divider}`,
          ...theme.applyStyles('dark', { backgroundColor: gray[900] }),
        })}
      >
        <Box
          sx={(theme) => ({
            backgroundColor: '#FFFFFF',
            border: `1px solid ${(theme.vars || theme).palette.divider}`,
            borderRadius: 2.5,
            boxShadow: 'var(--template-palette-baseShadow)',
            ...theme.applyStyles('dark', { backgroundColor: ink }),
          })}
        >
          <TargetPass
            row={selected}
            now={now}
            checking={selected ? checking.has(selected.target.id) : false}
            onCheck={() => (selected ? board.checkNow(selected.target.id) : Promise.resolve(null))}
            onAcknowledge={() => { if (selected) board.acknowledge([selected.target.id]); }}
            onEdit={() => { navigate('targets'); }}
            onHistory={() => {
              navigate('analytics');
              if (selected) {
                const targetId = selected.target.id;
                // Let the Analytics view mount before it receives the selection.
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('select-analytics-incident', { detail: { targetId } }));
                }, 50);
              }
            }}
          />
        </Box>
      </Box>
    </Box>
  );
}
