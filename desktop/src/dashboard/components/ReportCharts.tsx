import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Theme } from '@mui/material/styles';
import { fonts, gray, signal } from '../../shared-theme/themePrimitives';
import { DayBucket, formatMs } from '../reportModel';
import { formatPct, formatSpan } from '../historyStats';

const mono = { fontFamily: fonts.mono, fontVariantNumeric: 'tabular-nums' } as const;

const dayLabel = (d: Date) => d.toLocaleDateString([], { day: 'numeric', month: 'short' });

type Tone = 'full' | 'met' | 'missed' | 'none';

function toneOf(b: DayBucket, sla: number | null): Tone {
  if (b.availability === null) return 'none';
  if (b.availability >= 100) return 'full';
  if (sla === null) return 'missed';
  return b.availability >= sla ? 'met' : 'missed';
}

const toneSx = (tone: Tone) => (theme: Theme) => {
  switch (tone) {
    case 'full':
      return { backgroundColor: gray[600], ...theme.applyStyles('dark', { backgroundColor: gray[400] }) };
    case 'met':
      return { backgroundColor: signal.change };
    case 'missed':
      return { backgroundColor: signal.down };
    default:
      return { backgroundColor: 'transparent', outline: `1px dashed ${gray[400]}`, outlineOffset: -1 };
  }
};

function LegendItem({ tone, label }: { tone: Tone; label: string }) {
  return (
    <Box component="li" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Box sx={[{ width: 10, height: 10, borderRadius: '2px' }, toneSx(tone)]} />
      <span>{label}</span>
    </Box>
  );
}

/** One row of day bars per target, like a status page: each bar is a day, coloured by its availability. */
export function UptimeStrip({ rows, sla }: { rows: { id: number; name: string; removed: boolean; days: DayBucket[] }[]; sla: number | null }) {
  if (rows.length === 0 || rows[0].days.length === 0) return null;
  const days = rows[0].days;
  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(120px, 200px) 1fr' }, columnGap: 2, rowGap: { xs: 0.5, sm: 1.25 } }}>
        {rows.map((r) => {
          const covered = r.days.filter((d) => d.availability !== null);
          const overall = covered.length
            ? (covered.reduce((a, d) => a + d.checks - d.failed, 0) / covered.reduce((a, d) => a + d.checks, 0)) * 100
            : null;
          return (
            <React.Fragment key={r.id}>
              <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 1, justifyContent: 'space-between', pt: { xs: 1, sm: 0 } }}>
                <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600, color: r.removed ? 'text.secondary' : 'text.primary' }} title={r.name}>
                  {r.name}
                </Typography>
                <Typography sx={{ ...mono, fontSize: 12, color: 'text.secondary', flexShrink: 0 }}>{formatPct(overall)}</Typography>
              </Box>
              <Box
                role="img"
                aria-label={`${r.name}: daily availability, ${covered.length} of ${r.days.length} days with checks, ${formatPct(overall)} overall`}
                sx={{ display: 'flex', gap: days.length > 60 ? '1px' : '2px', height: 28, alignItems: 'stretch' }}
              >
                {r.days.map((d) => (
                  <Box
                    key={d.day.getTime()}
                    title={`${dayLabel(d.day)} · ${d.availability === null ? 'no checks' : `${formatPct(d.availability)} · ${d.checks} checks · downtime ${formatSpan(d.downtimeMs)}`}`}
                    sx={[
                      { flex: 1, minWidth: '1px', borderRadius: days.length > 60 ? '1px' : '2px', transition: 'opacity 120ms', '&:hover': { opacity: 0.6 } },
                      toneSx(toneOf(d, sla)),
                    ]}
                  />
                ))}
              </Box>
            </React.Fragment>
          );
        })}
        <Box sx={{ display: { xs: 'none', sm: 'block' } }} />
        <Box sx={{ ...mono, fontSize: 11, color: 'text.secondary', display: 'flex', justifyContent: 'space-between', mt: -0.5 }}>
          <span>{dayLabel(days[0].day)}</span>
          <span>{dayLabel(days[days.length - 1].day)}</span>
        </Box>
      </Box>
      <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 2, fontSize: 12, color: 'text.secondary' }}>
        <LegendItem tone="full" label="100%" />
        {sla !== null ? (
          <>
            <LegendItem tone="met" label={`Outage, still ≥ ${sla}% SLA`} />
            <LegendItem tone="missed" label={`Below ${sla}% SLA`} />
          </>
        ) : (
          <LegendItem tone="missed" label="Had an outage" />
        )}
        <LegendItem tone="none" label="No checks" />
      </Box>
    </Box>
  );
}

/** Average and 95th-percentile response time per day, one shared millisecond axis. */
export function ResponseChart({ days }: { days: { day: Date; avgMs: number | null; p95Ms: number | null; samples: number }[] }) {
  const [hover, setHover] = React.useState<number | null>(null);
  // Draw at the real pixel width so text keeps its size on narrow windows.
  const wrap = React.useRef<HTMLDivElement>(null);
  const [W, setW] = React.useState(760);
  const values = days.flatMap((d) => [d.avgMs, d.p95Ms]).filter((v): v is number => v !== null);
  const hasData = values.length > 0;
  React.useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => { setW(Math.max(280, Math.round(entry.contentRect.width))); });
    ro.observe(el);
    return () => { ro.disconnect(); };
  }, [hasData]);
  const H = 220;
  const pad = { l: 56, r: 12, t: 12, b: 26 };
  if (!hasData) {
    return <Typography variant="body2" color="text.secondary">No successful checks in this period, so there are no response times.</Typography>;
  }
  const rawMax = Math.max(...values);
  const step = niceStep(rawMax / 4);
  const max = Math.max(step, Math.ceil(rawMax / step) * step);
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (days.length === 1 ? iw / 2 : (i / (days.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const path = (key: 'avgMs' | 'p95Ms') => {
    let d = '';
    let pen = false;
    days.forEach((b, i) => {
      const v = b[key];
      if (v === null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const labelEvery = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(iw / 72))));
  const h = hover !== null ? days[hover] : null;

  return (
    <Box>
      <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mb: 1, display: 'flex', gap: 2.5, fontSize: 12, color: 'text.secondary' }}>
        <Box component="li" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box component="span" sx={{ width: 16, height: 0, borderTop: '2px solid', borderColor: 'text.primary' }} /> Average
        </Box>
        <Box component="li" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box component="span" sx={{ width: 16, height: 0, borderTop: '2px dashed', borderColor: 'text.secondary' }} /> 95th percentile (slowest 5%)
        </Box>
      </Box>
      <Box ref={wrap} sx={{ position: 'relative', color: 'text.primary' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={`Response time per day. Highest daily 95th percentile ${formatMs(rawMax)}.`}
          style={{ display: 'block', overflow: 'visible' }}
          onMouseLeave={() => { setHover(null); }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="currentColor" strokeOpacity={t === 0 ? 0.35 : 0.1} />
              <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="currentColor" fillOpacity={0.6} style={mono}>
                {t >= 1000 ? `${t / 1000} s` : `${t} ms`}
              </text>
            </g>
          ))}
          {days.map((d, i) => ((i % labelEvery === 0 && days.length - 1 - i >= labelEvery * 0.7) || i === days.length - 1) && (
            <text key={d.day.getTime()} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill="currentColor" fillOpacity={0.6} style={mono}>
              {dayLabel(d.day)}
            </text>
          ))}
          <path d={path('p95Ms')} fill="none" stroke="currentColor" strokeOpacity={0.55} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />
          <path d={path('avgMs')} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {days.length <= 45 && days.map((d, i) => d.avgMs !== null && (
            <circle key={d.day.getTime()} cx={x(i)} cy={y(d.avgMs)} r={hover === i ? 4.5 : 2.5} fill="currentColor" />
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="currentColor" strokeOpacity={0.3} />}
          {days.map((d, i) => (
            <rect
              key={`hit-${d.day.getTime()}`}
              x={x(i) - iw / Math.max(1, days.length - 1) / 2}
              y={pad.t}
              width={iw / Math.max(1, days.length - 1)}
              height={ih}
              fill="transparent"
              onMouseEnter={() => { setHover(i); }}
            >
              <title>{`${dayLabel(d.day)}: average ${formatMs(d.avgMs)}, 95th percentile ${formatMs(d.p95Ms)}`}</title>
            </rect>
          ))}
        </svg>
        {h && hover !== null && (
          <Box
            className="no-print"
            sx={(theme) => ({
              position: 'absolute',
              top: 0,
              left: `${(x(hover) / W) * 100}%`,
              transform: hover > days.length / 2 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
              pointerEvents: 'none',
              backgroundColor: '#FFFFFF',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              boxShadow: 'var(--template-palette-baseShadow)',
              px: 1.25,
              py: 0.75,
              ...mono,
              fontSize: 12,
              whiteSpace: 'nowrap',
              ...theme.applyStyles('dark', { backgroundColor: gray[800] }),
            })}
          >
            <Box sx={{ fontWeight: 700 }}>{dayLabel(h.day)}</Box>
            <div>avg {formatMs(h.avgMs)}</div>
            <div>p95 {formatMs(h.p95Ms)}</div>
            <Box sx={{ color: 'text.secondary' }}>{h.samples} checks</Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function niceStep(raw: number): number {
  if (raw <= 0) return 10;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

/** Horizontal bars of downtime per target, longest first, with the value written at the bar end. */
export function DowntimeBars({ rows }: { rows: { id: number; name: string; downtimeMs: number; incidents: number }[] }) {
  const sorted = [...rows].filter((r) => r.downtimeMs > 0).sort((a, b) => b.downtimeMs - a.downtimeMs);
  if (sorted.length === 0) {
    return <Typography variant="body2" color="text.secondary">No downtime recorded in this period.</Typography>;
  }
  const max = sorted[0].downtimeMs;
  return (
    <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(120px, 200px) 1fr' }, columnGap: 2, rowGap: 1 }}>
      {sorted.map((r) => (
        <Box component="li" key={r.id} sx={{ display: 'contents' }}>
          <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600, alignSelf: 'center' }} title={r.name}>{r.name}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Box
              title={`${r.name}: ${formatSpan(r.downtimeMs)} in ${r.incidents} ${r.incidents === 1 ? 'outage' : 'outages'}`}
              sx={{ height: 16, width: `${Math.max(1, (r.downtimeMs / max) * 100)}%`, maxWidth: 'calc(100% - 130px)', backgroundColor: signal.down, borderRadius: '0 4px 4px 0' }}
            />
            <Typography sx={{ ...mono, fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>
              {formatSpan(r.downtimeMs)} · {r.incidents}×
            </Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
