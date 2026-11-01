import * as React from 'react';
import {
  AckMap, BoardRow, CheckResult, Profile, Target,
  deriveRow, loadAcks, rankRows, saveAcks,
} from './boardModel';

const API = 'http://127.0.0.1:8765';
const POLL_MS = 5000;

export type BoardStatus = 'loading' | 'ready' | 'offline';

/** Outcome of a manual check, shown on the Check now button. */
export type CheckOutcome =
  | { kind: 'up'; latency: number }
  | { kind: 'down'; message: string }
  | { kind: 'error'; message: string };

export interface AutoCheck {
  running: boolean;
  intervalSeconds: number;
}

function readProfileState(): { profile: Profile | null; targets: Target[] } {
  try {
    const activeId = localStorage.getItem('uptime_sentry_active_id');
    const profiles = JSON.parse(localStorage.getItem('uptime_sentry_profiles') || '[]') as Profile[];
    const targets = JSON.parse(localStorage.getItem('uptime_sentry_targets') || '[]') as Target[];
    return {
      profile: profiles.find((p) => p.id === activeId) ?? null,
      targets: targets.filter((t) => t.profileId === activeId),
    };
  } catch {
    return { profile: null, targets: [] };
  }
}

export function useBoard() {
  const [{ profile, targets }, setProfileState] = React.useState(readProfileState);
  const [history, setHistory] = React.useState<CheckResult[]>([]);
  const [autoCheck, setAutoCheck] = React.useState<AutoCheck | null>(null);
  const [status, setStatus] = React.useState<BoardStatus>('loading');
  const [acks, setAcks] = React.useState<AckMap>(loadAcks);
  const [checking, setChecking] = React.useState<Set<number>>(new Set());
  const [now, setNow] = React.useState(() => new Date());

  const wasReachable = React.useRef(false);

  const reload = React.useCallback(async () => {
    setProfileState(readProfileState());
    try {
      const [h, a] = await Promise.all([
        fetch(`${API}/api/history`),
        fetch(`${API}/api/autocheck/status`),
      ]);
      if (h.ok) setHistory((await h.json()) as CheckResult[]);
      if (a.ok) setAutoCheck((await a.json()) as AutoCheck);
      setStatus(h.ok ? 'ready' : 'offline');
      if (h.ok && !wasReachable.current) {
        // Backend just became reachable (it may have started after the window): make sure it has our targets.
        window.dispatchEvent(new CustomEvent('sync-targets'));
      }
      wasReachable.current = h.ok;
    } catch {
      setStatus('offline');
      wasReachable.current = false;
    }
    setNow(new Date());
  }, []);

  React.useEffect(() => {
    void reload();
    const poll = setInterval(() => { void reload(); }, POLL_MS);
    const onProfile = () => { void reload(); };
    window.addEventListener('profile-changed', onProfile);
    window.addEventListener('profiles-updated', onProfile);
    return () => {
      clearInterval(poll);
      window.removeEventListener('profile-changed', onProfile);
      window.removeEventListener('profiles-updated', onProfile);
    };
  }, [reload]);

  const rows: BoardRow[] = React.useMemo(
    () => rankRows(targets.map((t) => deriveRow(t, history, acks))),
    [targets, history, acks],
  );

  const summary = React.useMemo(() => ({
    down: rows.filter((r) => r.state === 'down').length,
    recovered: rows.filter((r) => r.recovered).length,
    pending: rows.filter((r) => r.state === 'pending').length,
    up: rows.filter((r) => r.state === 'up').length,
    unseen: rows.filter((r) => r.unseen).length,
  }), [rows]);

  React.useEffect(() => {
    window.dispatchEvent(new CustomEvent('board-summary', { detail: { down: summary.down } }));
  }, [summary.down]);

  const lastCycle = React.useMemo(() => {
    const ids = new Set(targets.map((t) => t.id));
    let latest = '';
    for (const h of history) if (ids.has(h.targetId) && h.timestamp > latest) latest = h.timestamp;
    return latest || null;
  }, [history, targets]);

  const runCheck = React.useCallback(async (id: number): Promise<CheckOutcome> => {
    setChecking((s) => new Set(s).add(id));
    try {
      const r = await fetch(`${API}/api/targets/${id}/check`, { method: 'POST' });
      if (r.status === 404) {
        // The backend doesn't know this target yet: push the list again so the next check works.
        window.dispatchEvent(new CustomEvent('sync-targets'));
        return { kind: 'error', message: 'Not synced yet, try again' };
      }
      if (!r.ok) return { kind: 'error', message: `Check failed (${r.status})` };
      const result = (await r.json()) as CheckResult;
      return result.success
        ? { kind: 'up', latency: Math.max(0, result.durationMillis) }
        : { kind: 'down', message: result.message || 'Still down' };
    } catch {
      setStatus('offline');
      return { kind: 'error', message: 'Service unreachable' };
    } finally {
      setChecking((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }, []);

  const checkNow = React.useCallback(async (id: number) => {
    const outcome = await runCheck(id);
    await reload();
    return outcome;
  }, [runCheck, reload]);

  const checkAll = React.useCallback(async () => {
    await Promise.all(targets.map((t) => runCheck(t.id)));
    await reload();
  }, [targets, runCheck, reload]);

  const acknowledge = React.useCallback((ids: number[]) => {
    setAcks((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        const row = rows.find((r) => r.target.id === id);
        if (row?.since) next[String(id)] = row.since;
      }
      saveAcks(next);
      return next;
    });
  }, [rows]);

  const setAutoCheckRunning = React.useCallback(async (running: boolean) => {
    try {
      const r = await fetch(`${API}/api/autocheck/${running ? 'start' : 'stop'}`, { method: 'POST' });
      if (r.ok) setAutoCheck((await r.json()) as AutoCheck);
    } catch {
      setStatus('offline');
    }
  }, []);

  return {
    profile, rows, summary, status, autoCheck, lastCycle, now, checking,
    reload, checkNow, checkAll, acknowledge, setAutoCheckRunning,
  };
}
