/**
 * Data kept by the monitoring service (it acts on it while the window is closed): maintenance
 * windows, webhooks, scheduled reports, outage notes and the status page.
 */
import { API } from './historyStats';

export type Scope = 'ALL' | 'PROFILE' | 'TARGETS';

export interface MaintenanceWindow {
  id?: string;
  title: string;
  note: string;
  enabled: boolean;
  scope: Scope;
  profileId?: string | null;
  targetIds: number[];
  mode: 'ONCE' | 'WEEKLY';
  /** "yyyy-mm-ddThh:mm", local time (ONCE). */
  start?: string | null;
  end?: string | null;
  /** 1 = Monday … 7 = Sunday (WEEKLY). */
  days: number[];
  startTime: string;
  endTime: string;
  /** Filled in by the service. */
  activeNow?: boolean;
  nextStart?: string | null;
}

export type WebhookFormat = 'GENERIC' | 'SLACK' | 'DISCORD' | 'TEAMS' | 'NTFY';
export type AlertEventKind = 'DOWN' | 'UP' | 'SLOW' | 'NORMAL';

export interface Webhook {
  id?: string;
  name: string;
  url: string;
  format: WebhookFormat;
  enabled: boolean;
  events: AlertEventKind[];
  profileIds: string[];
}

export interface ReportSchedule {
  id?: string;
  name: string;
  enabled: boolean;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  dayOfWeek: number;
  dayOfMonth: number;
  time: string;
  scope: Scope;
  profileId?: string | null;
  targetIds: number[];
  recipients: string[];
  sla: number | null;
  includeOutages: boolean;
  lastSent?: string | null;
  lastError?: string | null;
  nextSend?: string | null;
}

export interface OutageNote {
  time: string;
  text: string;
}

/** Outage id → notes. An outage id is "targetId-yyyy-mm-dd hh:mm:ss" (its first failed check). */
export type NotesMap = Record<string, OutageNote[]>;

export interface StatusInfo {
  enabled: boolean;
  localUrl: string;
  networkUrls: string[];
  networkRunning: boolean;
  networkError: string | null;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.text().catch(() => '')) || `Request failed (${r.status})`);
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}

export const getMaintenance = () => call<MaintenanceWindow[]>('GET', '/api/maintenance');
export const putMaintenance = (list: MaintenanceWindow[]) => call<MaintenanceWindow[]>('PUT', '/api/maintenance', list);

export const getWebhooks = () => call<Webhook[]>('GET', '/api/webhooks');
export const putWebhooks = (list: Webhook[]) => call<Webhook[]>('PUT', '/api/webhooks', list);
export const testWebhook = (w: Webhook) => call<{ ok: boolean; message: string }>('POST', '/api/webhooks/test', w);

export const getSchedules = () => call<ReportSchedule[]>('GET', '/api/schedules');
export const putSchedules = (list: ReportSchedule[]) => call<ReportSchedule[]>('PUT', '/api/schedules', list);
export const sendSchedule = (s: ReportSchedule) => call<{ ok: boolean; message: string }>('POST', '/api/schedules/send', s);

export const getNotes = () => call<NotesMap>('GET', '/api/notes');
export const putNotes = (outageId: string, notes: OutageNote[]) => call<NotesMap>('PUT', '/api/notes', { outageId, notes });

export const getStatusInfo = () => call<StatusInfo>('GET', '/api/status/info');

// ── Network discovery ───────────────────────────────────────────────────────

export interface DiscoveryNetwork {
  id: string;
  name: string;
  address: string;
  range: string;
  /** Hyper-V, WSL, Docker or VPN adapters: off by default. */
  virtual: boolean;
}

export interface DiscoveryInfo {
  enabled: boolean;
  networks: DiscoveryNetwork[];
  ports: number[];
}

export interface FoundService {
  port: number;
  name: string;
  confidence: 'IDENTIFIED' | 'LIKELY' | 'UNKNOWN';
  source: 'mDNS' | 'SSDP' | 'port';
  check: 'HTTP' | 'TCP' | 'PING';
  suggestedHost: string;
  detail: string | null;
}

export interface FoundDevice {
  ip: string;
  hostname: string | null;
  services: FoundService[];
}

export interface DiscoveryStatus {
  running: boolean;
  active: boolean;
  phase: 'idle' | 'listening' | 'sweeping' | 'ports' | 'identifying' | 'naming' | 'done' | 'cancelled' | 'failed';
  progress: number;
  message: string | null;
  networks: string[];
  devices: FoundDevice[];
  startedAt: string | null;
  finishedAt: string | null;
  cancelled: boolean;
  error: string | null;
}

export const getDiscoveryInfo = () => call<DiscoveryInfo>('GET', '/api/discovery/networks');
export const startDiscovery = (networks: string[], ports: boolean) => call<DiscoveryStatus>('POST', '/api/discovery/start', { networks, ports });
export const getDiscoveryStatus = () => call<DiscoveryStatus>('GET', '/api/discovery/status');
export const cancelDiscovery = () => call<DiscoveryStatus>('POST', '/api/discovery/cancel');

const LEGACY_NOTES_KEY = 'uptime_sentry_incident_notes';

/**
 * Notes used to live in this window's storage; move them to the service once (so reports and
 * scheduled emails can include them), then forget the local copy.
 */
export async function loadNotes(): Promise<NotesMap> {
  let legacy: NotesMap | null = null;
  try {
    const raw = localStorage.getItem(LEGACY_NOTES_KEY);
    if (raw) legacy = JSON.parse(raw) as NotesMap;
  } catch {
    legacy = null;
  }
  if (legacy && Object.keys(legacy).length > 0) {
    const merged = await call<NotesMap>('POST', '/api/notes/merge', legacy);
    try { localStorage.removeItem(LEGACY_NOTES_KEY); } catch { /* storage unavailable */ }
    return merged;
  }
  return getNotes();
}

/** "Mon", "Tue"… for ISO day numbers. */
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "16 Nov, 22:00" from "yyyy-mm-dd hh:mm" or "yyyy-mm-ddThh:mm". */
export function formatLocal(ts: string | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

/** The app's profiles and targets, as stored by this window. */
export function readProfilesAndTargets(): {
  profiles: { id: string; name: string }[];
  targets: { id: number; name: string; profileId: string; type: string; host: string }[];
} {
  try {
    return {
      profiles: JSON.parse(localStorage.getItem('uptime_sentry_profiles') || '[]') as { id: string; name: string }[],
      targets: (JSON.parse(localStorage.getItem('uptime_sentry_targets') || '[]') as { id?: number; name: string; profileId: string; type: string; host: string }[])
        .filter((t): t is { id: number; name: string; profileId: string; type: string; host: string } => typeof t.id === 'number'),
    };
  } catch {
    return { profiles: [], targets: [] };
  }
}
