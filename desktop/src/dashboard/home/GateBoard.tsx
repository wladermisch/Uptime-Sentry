import * as React from 'react';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import { alpha } from '@mui/material/styles';
import ButtonBase from '@mui/material/ButtonBase';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import { BoardRow, BoardSort, SortKey, formatDuration, formatSince } from './boardModel';
import { fonts, signal, ink } from '../../shared-theme/themePrimitives';

const ROW_H = 52;

const mono = { fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' } as const;

function statusLabel(r: BoardRow) {
  if (r.maintenance) return r.state === 'down' ? 'MAINT · DOWN' : 'MAINT';
  if (r.state === 'down') return 'DOWN';
  if (r.recovered) return 'RECOVERED';
  if (r.state === 'pending') return 'PENDING';
  return r.slow ? 'SLOW' : 'UP';
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Keeps each row's identity while the ranking changes: rows glide from their old
 * position to the new one instead of disappearing and reappearing (FLIP).
 */
function useRerankMotion(order: string) {
  const els = React.useRef(new Map<number, HTMLTableRowElement>());
  const tops = React.useRef(new Map<number, number>());

  React.useLayoutEffect(() => {
    const reduce = prefersReducedMotion();
    els.current.forEach((el, id) => {
      const top = el.getBoundingClientRect().top;
      const prev = tops.current.get(id);
      if (!reduce && prev !== undefined && Math.abs(prev - top) > 1) {
        el.animate(
          [{ transform: `translateY(${prev - top}px)` }, { transform: 'translateY(0)' }],
          { duration: 320, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
        );
      }
      tops.current.set(id, top);
    });
  }, [order]);

  return (id: number) => (el: HTMLTableRowElement | null) => {
    if (el) els.current.set(id, el);
    else { els.current.delete(id); tops.current.delete(id); }
  };
}

interface GateBoardProps {
  rows: BoardRow[];
  loading: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
  now: Date;
  empty?: React.ReactNode;
  sort: BoardSort;
  onSort: (key: SortKey) => void;
}

/** A column header that sorts the board; announces its state through aria-sort on the th. */
function SortHeader({ label, sortKey, sort, onSort, align = 'left' }: {
  label: string;
  sortKey: SortKey;
  sort: BoardSort;
  onSort: (key: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = sort.key === sortKey;
  const Arrow = sort.dir === 'asc' ? ArrowUpwardRoundedIcon : ArrowDownwardRoundedIcon;
  return (
    <ButtonBase
      onClick={() => { onSort(sortKey); }}
      aria-label={`Sort by ${label.toLowerCase()}${active ? `, currently ${sort.dir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      sx={{
        font: 'inherit',
        letterSpacing: 'inherit',
        textTransform: 'inherit',
        color: active ? 'var(--board-head-ink)' : 'inherit',
        display: 'inline-flex',
        flexDirection: align === 'right' ? 'row-reverse' : 'row',
        alignItems: 'center',
        gap: 0.5,
        height: 24,
        px: 0.75,
        mx: -0.75,
        borderRadius: '3px',
        '&:hover': { color: 'var(--board-head-ink)', backgroundColor: 'var(--board-head-hover)' },
        '&:focus-visible': { outline: '2px solid var(--board-head-ink)', outlineOffset: 0 },
        '& svg': { fontSize: 14, opacity: active ? 1 : 0, transition: 'opacity 120ms ease-out' },
        '&:hover svg': { opacity: active ? 1 : 0.5 },
      }}
    >
      {label}
      <Arrow aria-hidden="true" />
    </ButtonBase>
  );
}

export default function GateBoard({ rows, loading, selectedId, onSelect, now, empty, sort, onSort }: GateBoardProps) {
  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
  const order = rows.map((r) => r.target.id).join(',');
  const bindRow = useRerankMotion(order);
  const rowRefs = React.useRef(new Map<number, HTMLTableRowElement>());

  const focusRow = (idx: number) => {
    const r = rows[Math.max(0, Math.min(rows.length - 1, idx))];
    if (!r) return;
    onSelect(r.target.id);
    rowRefs.current.get(r.target.id)?.focus();
  };

  const headCell = {
    ...mono,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--board-head-muted)',
    textAlign: 'left',
    height: 36,
    px: 1.5,
    position: 'sticky',
    top: 0,
    zIndex: 1,
    // Light band in light mode, slate in dark mode (see index.css).
    backgroundColor: 'var(--board-head-bg)',
    borderBottom: '1px solid var(--board-head-rule)',
  } as const;

  return (
    <Box
      component="table"
      role="grid"
      aria-label={sort.key === 'rank' ? 'Targets ranked by status' : `Targets sorted by ${sort.key}`}
      aria-rowcount={rows.length}
      sx={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}
    >
      <Box component="colgroup">
        <col style={{ width: 56 }} />
        <col />
        <Box component="col" sx={{ width: '24%', display: { xs: 'none', lg: 'table-column' } }} />
        <col style={{ width: 118 }} />
        <col style={{ width: 176 }} />
        <col style={{ width: 92 }} />
      </Box>
      <Box component="thead">
        <tr>
          <Box component="th" scope="col" sx={{ ...headCell, pl: 3 }}>#</Box>
          <Box component="th" scope="col" aria-sort={ariaSort('name')} sx={{ ...headCell }}>
            <SortHeader label="Target" sortKey="name" sort={sort} onSort={onSort} />
          </Box>
          <Box component="th" scope="col" sx={{ ...headCell, display: { xs: 'none', lg: 'table-cell' } }}>Host</Box>
          <Box component="th" scope="col" aria-sort={ariaSort('status')} sx={{ ...headCell }}>
            <SortHeader label="Status" sortKey="status" sort={sort} onSort={onSort} />
          </Box>
          <Box component="th" scope="col" sx={{ ...headCell }}>Since</Box>
          <Box component="th" scope="col" aria-sort={ariaSort('latency')} sx={{ ...headCell, textAlign: 'right', pr: 3 }}>
            <SortHeader label="Latency" sortKey="latency" sort={sort} onSort={onSort} align="right" />
          </Box>
        </tr>
      </Box>
      <tbody>
        {loading && rows.length === 0 &&
          Array.from({ length: 6 }).map((_, i) => (
            <tr key={`sk-${i}`}>
              <Box component="td" colSpan={6} sx={{ height: ROW_H, px: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Skeleton variant="text" width={`${70 - i * 6}%`} />
              </Box>
            </tr>
          ))}

        {!loading && rows.length === 0 && (
          <tr>
            <Box component="td" colSpan={6} sx={{ p: 0 }}>{empty}</Box>
          </tr>
        )}

        {rows.map((r, idx) => {
          const id = r.target.id;
          const selected = id === selectedId;
          // During maintenance a down target is expected: no red row.
          const down = r.state === 'down' && !r.maintenance;
          const changed = r.recovered;
          return (
            <Box
              component="tr"
              key={id}
              ref={(el: HTMLTableRowElement | null) => {
                bindRow(id)(el);
                if (el) rowRefs.current.set(id, el); else rowRefs.current.delete(id);
              }}
              tabIndex={selected || (selectedId === null && idx === 0) ? 0 : -1}
              aria-selected={selected}
              aria-rowindex={idx + 1}
              onClick={() => { onSelect(id); }}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); focusRow(idx + 1); }
                if (e.key === 'ArrowUp') { e.preventDefault(); focusRow(idx - 1); }
                if (e.key === 'Home') { e.preventDefault(); focusRow(0); }
                if (e.key === 'End') { e.preventDefault(); focusRow(rows.length - 1); }
              }}
              sx={(theme) => ({
                height: ROW_H,
                cursor: 'pointer',
                position: 'relative',
                backgroundColor: down ? alpha(signal.down, 0.07) : 'transparent',
                transition: 'background-color 200ms ease-out',
                outline: selected ? `2px solid ${(theme.vars || theme).palette.text.primary}` : 'none',
                outlineOffset: -2,
                '&:hover': { backgroundColor: down ? alpha(signal.down, 0.11) : (theme.vars || theme).palette.action.hover },
                '&:focus-visible': { outline: `2px solid ${(theme.vars || theme).palette.text.primary}`, outlineOffset: -2 },
                '& > td': { borderBottom: `1px solid ${(theme.vars || theme).palette.divider}`, px: 1.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
                ...theme.applyStyles('dark', {
                  backgroundColor: down ? alpha(signal.down, 0.14) : 'transparent',
                  '&:hover': { backgroundColor: down ? alpha(signal.down, 0.2) : (theme.vars || theme).palette.action.hover },
                }),
              })}
            >
              {/* Rank cell: a filled block carries the row's signal */}
              <Box component="td" sx={{ pl: '24px !important' }}>
                <Box
                  sx={(theme) => ({
                    ...mono,
                    width: 32,
                    height: 24,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: '4px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: down ? '#FFFFFF' : changed ? ink : (theme.vars || theme).palette.text.secondary,
                    backgroundColor: down ? signal.down : changed ? signal.change : 'transparent',
                  })}
                >
                  {String(idx + 1).padStart(2, '0')}
                </Box>
              </Box>
              <Box component="td">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                  <Box component="span" sx={{ fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.target.name}
                  </Box>
                  {down && r.unseen && (
                    <Box component="span" sx={{ ...mono, flexShrink: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', px: 0.75, py: '2px', borderRadius: '3px', backgroundColor: signal.change, color: ink }}>
                      NEW
                    </Box>
                  )}
                </Box>
                <Box sx={{ ...mono, fontSize: 12, color: 'text.secondary', display: { xs: 'block', lg: 'none' }, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.target.host}
                </Box>
              </Box>
              <Box component="td" sx={{ ...mono, fontSize: 13, color: 'text.secondary', display: { xs: 'none', lg: 'table-cell' } }}>
                {r.target.host}
              </Box>
              <Box component="td">
                <Box
                  component="span"
                  sx={(theme) => ({
                    ...mono,
                    display: 'inline-block',
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    lineHeight: '22px',
                    px: down || changed ? 1 : 0,
                    borderRadius: '3px',
                    backgroundColor: down ? signal.down : changed ? signal.change : 'transparent',
                    color: down ? '#FFFFFF' : changed ? ink : r.state === 'pending' ? (theme.vars || theme).palette.text.secondary : (theme.vars || theme).palette.text.primary,
                  })}
                >
                  {statusLabel(r)}
                </Box>
              </Box>
              <Box component="td" sx={{ ...mono, fontSize: 13 }}>
                {r.since ? (
                  <>
                    <Box component="span" sx={{ fontWeight: 600 }}>{formatSince(r.since, now)}</Box>
                    {(down || changed) && (
                      <Box component="span" sx={{ color: 'text.secondary', ml: 1 }}>{formatDuration(r.since, now)}</Box>
                    )}
                  </>
                ) : (
                  <Box component="span" sx={{ color: 'text.secondary' }}>—</Box>
                )}
              </Box>
              <Box component="td" sx={{ ...mono, fontSize: 13, textAlign: 'right', pr: '24px !important', color: r.latency === null ? 'text.secondary' : 'text.primary' }}>
                {r.latency === null ? '—' : `${r.latency} ms`}
              </Box>
            </Box>
          );
        })}
      </tbody>
    </Box>
  );
}
