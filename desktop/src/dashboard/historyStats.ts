/**
 * Availability statistics derived from the backend's recorded checks (GET /api/history).
 * Everything here is computed from real check results; nothing is estimated beyond the
 * recorded data, and callers are told how far back that data actually reaches.
 */
import { CheckResult, parseTs } from './home/boardModel';

export type { CheckResult } from './home/boardModel';

export const API = 'http://127.0.0.1:8765';

/** "yyyy-mm-dd hh:mm:ss" in local time, the format the monitoring service stores. */
export function toTs(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Recorded checks, newest first. Without a range the service returns the last 7 days;
 * pass `since` for longer periods (bounded by the history retention in Settings).
 */
export async function fetchHistory(range?: { since?: Date; until?: Date; targetId?: number }): Promise<CheckResult[]> {
  const q = new URLSearchParams();
  if (range?.since) q.set('since', toTs(range.since));
  if (range?.until) q.set('until', toTs(range.until));
  if (range?.targetId !== undefined) q.set('targetId', String(range.targetId));
  const r = await fetch(`${API}/api/history${q.size ? `?${q.toString()}` : ''}`);
  if (!r.ok) throw new Error(`History request failed (${r.status})`);
  return (await r.json()) as CheckResult[];
}

/** One outage: an unbroken run of failed checks, ended by the next successful check. */
export interface Incident {
  id: string;
  targetId: number;
  targetName: string;
  start: Date;
  /** First successful check after the outage; null while it is still ongoing. */
  end: Date | null;
  durationMs: number;
  failedChecks: CheckResult[];
  /** The successful check that ended the outage, if any. */
  recovery: CheckResult | null;
}

/** One target's checks, oldest first. Checks during maintenance are left out: they don't count for availability. */
export function checksFor(history: CheckResult[], targetId: number): CheckResult[] {
  return history
    .filter((h) => h.targetId === targetId && !h.maintenance)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/** Incidents for one target's checks (sorted oldest first). Newest incident is returned first. */
export function computeIncidents(checks: CheckResult[], now: Date): Incident[] {
  const out: Incident[] = [];
  let run: CheckResult[] = [];
  const close = (recovery: CheckResult | null) => {
    if (run.length === 0) return;
    const start = parseTs(run[0].timestamp);
    const end = recovery ? parseTs(recovery.timestamp) : null;
    out.push({
      id: `${run[0].targetId}-${run[0].timestamp}`,
      targetId: run[0].targetId,
      targetName: run[0].targetName,
      start,
      end,
      durationMs: Math.max(0, (end ?? now).getTime() - start.getTime()),
      failedChecks: run,
      recovery,
    });
    run = [];
  };
  for (const c of checks) {
    if (c.success) close(c);
    else run.push(c);
  }
  close(null);
  return out.reverse();
}

export interface WindowStats {
  checks: number;
  failed: number;
  /** Share of successful checks in the window, or null when nothing was recorded. */
  availability: number | null;
  incidents: number;
  downtimeMs: number;
  longestMs: number;
  averageMs: number;
}

/** Stats for checks and incident time that fall inside [from, to]. */
export function windowStats(checks: CheckResult[], incidents: Incident[], from: Date, to: Date, now: Date): WindowStats {
  const inWindow = checks.filter((c) => {
    const t = parseTs(c.timestamp).getTime();
    return t >= from.getTime() && t <= to.getTime();
  });
  const overlapping = incidents.filter((i) => i.start.getTime() <= to.getTime() && (i.end ?? now).getTime() >= from.getTime());
  const clipped = overlapping.map((i) => {
    const s = Math.max(i.start.getTime(), from.getTime());
    const e = Math.min((i.end ?? now).getTime(), to.getTime());
    return Math.max(0, e - s);
  });
  const failed = inWindow.filter((c) => !c.success).length;
  const downtimeMs = clipped.reduce((a, b) => a + b, 0);
  return {
    checks: inWindow.length,
    failed,
    availability: inWindow.length ? ((inWindow.length - failed) / inWindow.length) * 100 : null,
    incidents: overlapping.length,
    downtimeMs,
    longestMs: clipped.length ? Math.max(...clipped) : 0,
    averageMs: clipped.length ? downtimeMs / clipped.length : 0,
  };
}

/** Earliest recorded check, so screens can say how much history the numbers cover. */
export function coverageStart(checks: CheckResult[]): Date | null {
  if (checks.length === 0) return null;
  let min = checks[0].timestamp;
  for (const c of checks) if (c.timestamp < min) min = c.timestamp;
  return parseTs(min);
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86400000);
}

/** "none", "45 s", "12 min", "2 h 05 min", "3 d 4 h". */
export function formatSpan(ms: number): string {
  if (ms <= 0) return 'none';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${String(m % 60).padStart(2, '0')} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

export function formatPct(p: number | null): string {
  if (p === null) return 'no data';
  return `${p.toFixed(p === 100 ? 0 : 2)}%`;
}

/** "1 Nov 2026, 21:37" in the user's locale. */
export function formatDateTime(d: Date): string {
  return d.toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

/** yyyy-mm-dd for date inputs, in local time. */
export function toDateInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Parses a yyyy-mm-dd date input as local midnight (start) or end of day (end). */
export function fromDateInput(v: string, edge: 'start' | 'end'): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (edge === 'end') d.setHours(23, 59, 59, 999);
  return d;
}


