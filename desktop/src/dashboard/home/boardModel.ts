/** Board model: derives each target's live state, onset and rank from check history. */

export interface Profile {
  id: string;
  name: string;
  defaultTimeout: number;
  checkInterval: number;
  consecutiveFailuresLimit: number;
  backgroundRunning: boolean;
}

export interface Target {
  id: number;
  profileId: string;
  name: string;
  type: string;
  host: string;
  timeout: number;
  recoveryAction: string;
  acceptableStatusCodes: number[];
  consecutiveFailuresLimit: number;
  profileName: string;
}

export interface CheckResult {
  targetId: number;
  targetName: string;
  timestamp: string;
  success: boolean;
  durationMillis: number;
  message: string;
}

export type TargetState = 'down' | 'up' | 'pending';

export interface BoardRow {
  target: Target;
  state: TargetState;
  /** Timestamp of the first check in the current unbroken state. */
  since: string | null;
  /** True when the state started with a transition (a prior check had the other state). */
  transitioned: boolean;
  /** A down state, or a transition, the user hasn't acknowledged yet. */
  unseen: boolean;
  /** Recovered and not yet acknowledged. */
  recovered: boolean;
  consecutiveFails: number;
  latency: number | null;
  message: string;
  lastChecked: string | null;
  uptime: number | null;
  recent: CheckResult[];
}

export type AckMap = Record<string, string>;

const ACK_KEY = 'uptime_sentry_board_ack';

export function loadAcks(): AckMap {
  try {
    return JSON.parse(localStorage.getItem(ACK_KEY) || '{}') as AckMap;
  } catch {
    return {};
  }
}

export function saveAcks(acks: AckMap) {
  try {
    localStorage.setItem(ACK_KEY, JSON.stringify(acks));
  } catch {
    // Storage unavailable: acknowledgements last for this session only.
  }
}

export function parseTs(ts: string): Date {
  return new Date(ts.replace(' ', 'T'));
}

export function deriveRow(target: Target, history: CheckResult[], acks: AckMap): BoardRow {
  const checks = history
    .filter((h) => h.targetId === target.id)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const latest = checks.length ? checks[checks.length - 1] : null;

  if (!latest) {
    return {
      target, state: 'pending', since: null, transitioned: false, unseen: false, recovered: false,
      consecutiveFails: 0, latency: null, message: 'Waiting for the first check.',
      lastChecked: null, uptime: null, recent: [],
    };
  }

  const state: TargetState = latest.success ? 'up' : 'down';
  let i = checks.length - 1;
  while (i > 0 && checks[i - 1].success === latest.success) i--;
  const since = checks[i].timestamp;
  const transitioned = i > 0;

  let consecutiveFails = 0;
  for (let j = checks.length - 1; j >= 0 && !checks[j].success; j--) consecutiveFails++;

  const ack = acks[String(target.id)] ?? '';
  const unseen = (state === 'down' || transitioned) && ack < since;
  const online = checks.filter((c) => c.success).length;

  return {
    target,
    state,
    since,
    transitioned,
    unseen,
    recovered: state === 'up' && transitioned && unseen,
    consecutiveFails,
    latency: latest.success ? Math.max(0, latest.durationMillis) : null,
    message: latest.message || (latest.success ? 'Check succeeded.' : 'Check failed.'),
    lastChecked: latest.timestamp,
    uptime: (online / checks.length) * 100,
    recent: checks.slice(-48),
  };
}

function severity(r: BoardRow) {
  if (r.state === 'down') return 0;
  if (r.recovered) return 1;
  if (r.state === 'pending') return 2;
  return 3;
}

/** Down first (newest outage on top), then unacknowledged recoveries, then pending, then up by name. */
export function rankRows(rows: BoardRow[]): BoardRow[] {
  return [...rows].sort((a, b) => {
    const s = severity(a) - severity(b);
    if (s !== 0) return s;
    if (a.state === 'down' || a.recovered) return (b.since ?? '').localeCompare(a.since ?? '');
    return a.target.name.localeCompare(b.target.name);
  });
}

export type SortKey = 'rank' | 'name' | 'status' | 'latency';
export type SortDir = 'asc' | 'desc';
export interface BoardSort { key: SortKey; dir: SortDir }

export const DEFAULT_SORT: BoardSort = { key: 'rank', dir: 'asc' };

/**
 * Orders already-ranked rows by the chosen column. 'rank' keeps the severity ranking.
 * Status sorts by severity (down first when ascending); latency puts targets without a reading last.
 */
export function sortRows(ranked: BoardRow[], sort: BoardSort): BoardRow[] {
  if (sort.key === 'rank') return ranked;
  const sign = sort.dir === 'asc' ? 1 : -1;
  const byName = (a: BoardRow, b: BoardRow) => a.target.name.localeCompare(b.target.name, undefined, { sensitivity: 'base', numeric: true });
  return [...ranked].sort((a, b) => {
    if (sort.key === 'name') return sign * byName(a, b);
    if (sort.key === 'status') return sign * (severity(a) - severity(b)) || byName(a, b);
    // latency: missing readings always sink to the bottom
    if (a.latency === null && b.latency === null) return byName(a, b);
    if (a.latency === null) return 1;
    if (b.latency === null) return -1;
    return sign * (a.latency - b.latency) || byName(a, b);
  });
}

/** Next sort after clicking a column: ascending, then descending, then back to the severity ranking. */
export function nextSort(current: BoardSort, key: SortKey): BoardSort {
  if (current.key !== key) return { key, dir: 'asc' };
  if (current.dir === 'asc') return { key, dir: 'desc' };
  return DEFAULT_SORT;
}

export function formatDuration(fromTs: string, now: Date): string {
  const mins = Math.max(0, Math.floor((now.getTime() - parseTs(fromTs).getTime()) / 60000));
  if (mins < 1) return 'under 1 min';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h ${String(mins % 60).padStart(2, '0')} min`;
  const d = Math.floor(h / 24);
  return `${d} d ${h % 24} h`;
}

/** "14:02" today, "Mon 14:02" this week, "12 Oct 14:02" otherwise. */
export function formatSince(ts: string, now: Date): string {
  const d = parseTs(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return time;
  const days = (now.getTime() - d.getTime()) / 86400000;
  if (days < 6) return `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
}

export function formatClock(ts: string): string {
  return ts.split(' ')[1] ?? ts;
}
