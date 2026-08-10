/**
 * Typed API client for the Uptime-Sentry Java REST backend (port 8765).
 */

const BASE = "http://127.0.0.1:8765";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface MonitoredTarget {
  id: number;
  name: string;
  type: "HTTP" | "PING";
  host: string;
  timeout: number;
  recoveryAction?: string;
  acceptableStatusCodes?: number[];
  consecutiveFailuresLimit?: number;
}

export interface CheckResult {
  targetId: number;
  targetName: string;
  timestamp: string;
  online: boolean;
  responseTime: number;
  message?: string;
}

export interface AutoCheckStatus {
  running: boolean;
  intervalSeconds: number;
}

// ── Targets ─────────────────────────────────────────────────────────────────

export const api = {
  targets: {
    list: () => request<MonitoredTarget[]>("/api/targets"),
    add: (t: Omit<MonitoredTarget, "id">) =>
      request<MonitoredTarget>("/api/targets", { method: "POST", body: JSON.stringify(t) }),
    edit: (id: number, patch: Partial<MonitoredTarget>) =>
      request<MonitoredTarget>(`/api/targets/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
    remove: (id: number) =>
      request<void>(`/api/targets/${id}`, { method: "DELETE" }),
    check: (id: number) =>
      request<CheckResult>(`/api/targets/${id}/check`, { method: "POST" }),
  },

  history: {
    list: () => request<CheckResult[]>("/api/history"),
    clear: () => request<void>("/api/history", { method: "DELETE" }),
  },

  autocheck: {
    status: () => request<AutoCheckStatus>("/api/autocheck/status"),
    start: () => request<AutoCheckStatus>("/api/autocheck/start", { method: "POST" }),
    stop: () => request<AutoCheckStatus>("/api/autocheck/stop", { method: "POST" }),
    setInterval: (intervalSeconds: number) =>
      request<AutoCheckStatus>("/api/autocheck/interval", {
        method: "PUT",
        body: JSON.stringify({ intervalSeconds }),
      }),
  },

  logs: {
    list: () => request<string[]>("/api/logs"),
  },

  shutdown: () => request<void>("/api/runtime/shutdown", { method: "POST" }),
};