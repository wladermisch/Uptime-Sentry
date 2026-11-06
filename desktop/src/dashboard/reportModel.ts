/**
 * Report figures, computed from recorded checks only. Availability is the share of successful
 * checks; downtime is the time from the first failed check of an outage to the next successful one.
 */
import { CheckResult, parseTs } from './home/boardModel';
import { Incident, WindowStats, checksFor, computeIncidents, startOfDay, windowStats } from './historyStats';

export interface ReportTarget {
  id: number;
  name: string;
  type: string;
  host: string;
  /** True when the target no longer exists and is only known from its recorded checks. */
  removed: boolean;
}

export interface ResponseStats {
  avg: number | null;
  p95: number | null;
  min: number | null;
  max: number | null;
  samples: number;
}

export interface DayBucket {
  day: Date;
  checks: number;
  failed: number;
  availability: number | null;
  downtimeMs: number;
  avgMs: number | null;
  p95Ms: number | null;
}

export interface TargetFigures {
  target: ReportTarget;
  stats: WindowStats;
  incidents: Incident[];
  response: ResponseStats;
  /** Mean time to recovery over outages that ended inside the period. */
  mttrMs: number | null;
  /** Mean time between failures: monitored time without outage per outage. */
  mtbfMs: number | null;
  days: DayBucket[];
  previous: WindowStats | null;
  firstCheck: Date | null;
}

export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function responseStats(checks: CheckResult[]): ResponseStats {
  const ms = checks.filter((c) => c.success && c.durationMillis >= 0).map((c) => c.durationMillis).sort((a, b) => a - b);
  if (ms.length === 0) return { avg: null, p95: null, min: null, max: null, samples: 0 };
  return {
    avg: ms.reduce((a, b) => a + b, 0) / ms.length,
    p95: percentile(ms, 95),
    min: ms[0],
    max: ms[ms.length - 1],
    samples: ms.length,
  };
}

function inRange(checks: CheckResult[], from: Date, to: Date): CheckResult[] {
  const f = from.getTime();
  const t = to.getTime();
  return checks.filter((c) => {
    const ts = parseTs(c.timestamp).getTime();
    return ts >= f && ts <= t;
  });
}

/** Calendar days from `from` to `to` (local time), at most `max` of them. */
export function daysBetween(from: Date, to: Date, max = 400): Date[] {
  const out: Date[] = [];
  const d = startOfDay(from);
  while (d <= to && out.length < max) {
    out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/**
 * Every target the report covers: the profile's current targets, plus (optionally) targets that
 * were deleted but still have checks recorded for this profile.
 */
export function reportTargets(
  current: { id: number; name: string; type: string; host: string }[],
  allCurrentIds: Set<number>,
  history: CheckResult[],
  profileName: string | undefined,
  includeRemoved: boolean,
): ReportTarget[] {
  const out: ReportTarget[] = current.map((t) => ({ id: t.id, name: t.name, type: t.type, host: t.host, removed: false }));
  if (!includeRemoved) return out;
  const removed = new Map<number, ReportTarget>();
  // History is newest first, so the first entry seen per id carries the latest name.
  for (const c of history) {
    if (allCurrentIds.has(c.targetId) || removed.has(c.targetId)) continue;
    if (c.profileName && profileName && c.profileName !== profileName) continue;
    removed.set(c.targetId, { id: c.targetId, name: c.targetName, type: c.targetType ?? '', host: c.host ?? '', removed: true });
  }
  // Fill type/host from older entries when the newest one predates those fields.
  for (const t of removed.values()) {
    if (t.type && t.host) continue;
    const withInfo = history.find((c) => c.targetId === t.id && c.targetType);
    if (withInfo) {
      t.type = t.type || withInfo.targetType || '';
      t.host = t.host || withInfo.host || '';
    }
  }
  return [...out, ...[...removed.values()].sort((a, b) => a.name.localeCompare(b.name))];
}

export function figuresFor(target: ReportTarget, history: CheckResult[], from: Date, to: Date, now: Date): TargetFigures {
  const checks = checksFor(history, target.id);
  const incidents = computeIncidents(checks, now);
  const periodEnd = to < now ? to : now;
  const windowChecks = inRange(checks, from, to);
  const stats = windowStats(checks, incidents, from, to, now);
  const inPeriod = incidents.filter((i) => i.start <= to && (i.end ?? now) >= from);

  const resolved = inPeriod.filter((i) => i.end && i.end <= to);
  const mttrMs = resolved.length ? resolved.reduce((a, i) => a + i.durationMs, 0) / resolved.length : null;

  const firstCheck = checks.length ? parseTs(checks[0].timestamp) : null;
  const monitoredFrom = firstCheck && firstCheck > from ? firstCheck : from;
  const monitoredMs = Math.max(0, periodEnd.getTime() - monitoredFrom.getTime());
  const mtbfMs = inPeriod.length && windowChecks.length ? Math.max(0, monitoredMs - stats.downtimeMs) / inPeriod.length : null;

  const days = daysBetween(from, periodEnd).map((day) => {
    const dayEnd = endOfDay(day);
    const dayChecks = inRange(checks, day, dayEnd);
    const s = windowStats(checks, incidents, day, dayEnd, now);
    const r = responseStats(dayChecks);
    return { day, checks: s.checks, failed: s.failed, availability: s.availability, downtimeMs: s.downtimeMs, avgMs: r.avg, p95Ms: r.p95 };
  });

  const span = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - span - 1);
  const prevTo = new Date(from.getTime() - 1);
  const previous = windowStats(checks, incidents, prevFrom, prevTo, now);

  return {
    target,
    stats,
    incidents: inPeriod,
    response: responseStats(windowChecks),
    mttrMs,
    mtbfMs,
    days,
    previous: previous.checks ? previous : null,
    firstCheck,
  };
}

/** Scope totals: sums of checks, downtime and outages; response percentiles over all checks. */
export function totals(rows: TargetFigures[], history: CheckResult[], from: Date, to: Date) {
  const checks = rows.reduce((a, r) => a + r.stats.checks, 0);
  const failed = rows.reduce((a, r) => a + r.stats.failed, 0);
  const downtimeMs = rows.reduce((a, r) => a + r.stats.downtimeMs, 0);
  const incidents = rows.flatMap((r) => r.incidents);
  const resolved = rows.filter((r) => r.mttrMs !== null);
  const resolvedCount = rows.reduce((a, r) => a + r.incidents.filter((i) => i.end && i.end <= to).length, 0);
  const mttrMs = resolvedCount
    ? resolved.reduce((a, r) => a + (r.mttrMs ?? 0) * r.incidents.filter((i) => i.end && i.end <= to).length, 0) / resolvedCount
    : null;
  const ids = new Set(rows.map((r) => r.target.id));
  const response = responseStats(inRange(history.filter((h) => ids.has(h.targetId) && !h.maintenance), from, to));
  const prevChecks = rows.reduce((a, r) => a + (r.previous?.checks ?? 0), 0);
  const prevFailed = rows.reduce((a, r) => a + (r.previous?.failed ?? 0), 0);
  return {
    checks,
    failed,
    availability: checks ? ((checks - failed) / checks) * 100 : null,
    downtimeMs,
    incidents: incidents.length,
    longestMs: incidents.reduce((a, i) => Math.max(a, i.durationMs), 0),
    mttrMs,
    response,
    previousAvailability: prevChecks ? ((prevChecks - prevFailed) / prevChecks) * 100 : null,
    previousDowntimeMs: rows.reduce((a, r) => a + (r.previous?.downtimeMs ?? 0), 0),
    previousIncidents: rows.reduce((a, r) => a + (r.previous?.incidents ?? 0), 0),
  };
}

/** Downtime the SLA allows over a span: (1 - target) × span. */
export function allowedDowntimeMs(slaPct: number, spanMs: number): number {
  return Math.max(0, (1 - slaPct / 100) * spanMs);
}

export function formatMs(ms: number | null): string {
  if (ms === null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
}

/** "+0.12 pts", "−1.40 pts", or "" when either side is missing. */
export function formatDelta(now: number | null, before: number | null): string {
  if (now === null || before === null) return '';
  const d = now - before;
  if (Math.abs(d) < 0.005) return 'no change';
  return `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(2)} pts`;
}

/** Average and p95 response time per day across a set of targets. */
export function responseByDay(history: CheckResult[], ids: Set<number>, days: Date[]): { day: Date; avgMs: number | null; p95Ms: number | null; samples: number }[] {
  const scoped = history.filter((h) => ids.has(h.targetId) && !h.maintenance);
  return days.map((day) => {
    const r = responseStats(inRange(scoped, day, endOfDay(day)));
    return { day, avgMs: r.avg, p95Ms: r.p95, samples: r.samples };
  });
}
