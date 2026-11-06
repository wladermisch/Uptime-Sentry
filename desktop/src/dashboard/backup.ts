/**
 * Backups: one JSON file with everything needed to set Uptime Sentry up again on this or another
 * computer. The mail password is never included (it stays in the system's credential store).
 */
import { API } from './historyStats';
import { CheckResult } from './home/boardModel';

export const BACKUP_FORMAT = 'uptime-sentry-backup';

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  /** This window's own storage: profiles, targets, app settings, report options… */
  local: Record<string, string>;
  /** What the monitoring service keeps: settings, maintenance, webhooks, scheduled reports, notes. */
  server: {
    settings?: Record<string, unknown>;
    maintenance?: unknown[];
    webhooks?: unknown[];
    schedules?: unknown[];
    notes?: Record<string, unknown>;
  };
  history?: CheckResult[];
}

export interface BackupSummary {
  profiles: number;
  targets: number;
  maintenance: number;
  webhooks: number;
  schedules: number;
  notes: number;
  checks: number;
  exportedAt: string;
}

const LOCAL_PREFIX = 'uptime_sentry';
/** Kept per computer: which release was seen, what the bell dismissed. */
const LOCAL_SKIP = new Set(['uptime_sentry_latest_release', 'uptime_sentry_update_dismissed']);

export async function createBackup(includeHistory: boolean): Promise<Backup> {
  const local: Record<string, string> = {};
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(LOCAL_PREFIX) && !LOCAL_SKIP.has(key)) local[key] = localStorage.getItem(key) ?? '';
  }
  const r = await fetch(`${API}/api/backup`);
  if (!r.ok) throw new Error('The monitoring service did not answer.');
  const server = (await r.json()) as Backup['server'];
  const backup: Backup = { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), local, server };
  if (includeHistory) {
    const h = await fetch(`${API}/api/history?since=${encodeURIComponent('2000-01-01 00:00:00')}`);
    if (!h.ok) throw new Error("Couldn't read the check history.");
    backup.history = (await h.json()) as CheckResult[];
  }
  return backup;
}

function count(json: string | undefined): number {
  try {
    const v = JSON.parse(json ?? '[]') as unknown;
    return Array.isArray(v) ? v.length : 0;
  } catch {
    return 0;
  }
}

export function summarize(b: Backup): BackupSummary {
  return {
    profiles: count(b.local.uptime_sentry_profiles),
    targets: count(b.local.uptime_sentry_targets),
    maintenance: b.server.maintenance?.length ?? 0,
    webhooks: b.server.webhooks?.length ?? 0,
    schedules: b.server.schedules?.length ?? 0,
    notes: Object.keys(b.server.notes ?? {}).length,
    checks: b.history?.length ?? 0,
    exportedAt: b.exportedAt,
  };
}

/** Parses and checks a backup file; throws with a readable reason. */
export async function readBackup(file: File): Promise<Backup> {
  if (file.size > 400 * 1024 * 1024) throw new Error('This file is too large to be a backup.');
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('This file is not a backup: it is not valid JSON.');
  }
  const b = data as Partial<Backup>;
  if (!b || b.format !== BACKUP_FORMAT) throw new Error('This file is not an Uptime Sentry backup.');
  if (b.version !== 1) throw new Error('This backup was made by a newer version of Uptime Sentry. Update the app first.');
  if (typeof b.local !== 'object' || b.local === null || typeof b.server !== 'object' || b.server === null) {
    throw new Error('This backup is incomplete.');
  }
  return b as Backup;
}

/** Replaces the current setup with the backup's. The page must reload afterwards. */
export async function restoreBackup(b: Backup, withHistory: boolean): Promise<void> {
  const r = await fetch(`${API}/api/backup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(b.server),
  });
  if (!r.ok) throw new Error("The monitoring service couldn't restore the backup.");
  if (withHistory && b.history) {
    const h = await fetch(`${API}/api/history/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b.history),
    });
    if (!h.ok) throw new Error("The check history couldn't be imported.");
  }
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(LOCAL_PREFIX) && !LOCAL_SKIP.has(key)) localStorage.removeItem(key);
  }
  for (const [key, value] of Object.entries(b.local)) {
    if (key.startsWith(LOCAL_PREFIX) && typeof value === 'string') localStorage.setItem(key, value);
  }
  // A restored setup has been through the setup assistant already.
  localStorage.setItem('uptime_sentry_onboarded', 'true');
}

/** Offers a file to save: the system Save dialog where available, else a download. */
export async function saveFile(name: string, content: string, mime = 'application/json'): Promise<boolean> {
  const picker = (window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<{ createWritable(): Promise<{ write(c: string): Promise<void>; close(): Promise<void> }> }> }).showSaveFilePicker;
  if (typeof picker === 'function') {
    try {
      const handle = await picker({ suggestedName: name, types: [{ description: 'Uptime Sentry backup', accept: { [mime]: ['.json'] } }] });
      const w = await handle.createWritable();
      await w.write(content);
      await w.close();
      return true;
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); }, 1000);
  return true;
}
