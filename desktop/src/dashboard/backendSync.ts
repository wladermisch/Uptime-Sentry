/**
 * Pushes the targets that should be monitored right now (the active profile plus profiles set to
 * run in the background) to the monitoring service, with sounds and email rules already resolved.
 */
import { API } from './historyStats';
import { EmailRule, readAppEmailSettings, resolveEmail } from './emailAlerts';

interface StoredProfile {
  id: string;
  name: string;
  backgroundRunning?: boolean;
  upSound?: string;
  downSound?: string;
  email?: EmailRule;
}

interface StoredTarget {
  id?: number;
  profileId: string;
  name: string;
  type: string;
  host: string;
  timeout: number;
  recoveryAction?: string;
  acceptableStatusCodes?: number[];
  degradedStatusCodes?: number[];
  degradedLatencyThreshold?: number;
  consecutiveFailuresLimit?: number;
  upSound?: string;
  downSound?: string;
  keyword?: string;
  keywordRule?: string;
  paused?: boolean;
  email?: EmailRule;
  port?: number;
  dnsExpected?: string;
  sslWarnDays?: number;
  slowAlertAfter?: number;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Sound names: target choice → profile choice → app default. */
function resolveSound(targetSound: string | undefined, profileSound: string | undefined, appDefault: string): string {
  const pick = (v: string | undefined) => v && v !== 'default-profile' && v !== 'default-app' ? v : undefined;
  return pick(targetSound) ?? pick(profileSound) ?? appDefault;
}

export function buildBackendTargets() {
  const profiles = read<StoredProfile[]>('uptime_sentry_profiles', []);
  const targets = read<StoredTarget[]>('uptime_sentry_targets', []);
  const activeId = localStorage.getItem('uptime_sentry_active_id');
  const settings = read<{ defaultUpSound?: string; defaultDownSound?: string }>('uptime_sentry_settings', {});
  const appEmail = readAppEmailSettings();

  const live = targets.filter((t) => t.id && (t.profileId === activeId || profiles.find((p) => p.id === t.profileId)?.backgroundRunning));
  return live.map((t) => {
    const profile = profiles.find((p) => p.id === t.profileId);
    const email = resolveEmail(t.email, profile?.email, appEmail);
    return {
      id: t.id,
      name: t.name,
      type: t.type,
      host: t.host,
      timeout: t.timeout,
      recoveryAction: t.recoveryAction ?? '',
      acceptableStatusCodes: t.acceptableStatusCodes ?? [],
      degradedStatusCodes: t.degradedStatusCodes,
      degradedLatencyThreshold: t.degradedLatencyThreshold,
      consecutiveFailuresLimit: t.consecutiveFailuresLimit ?? 1,
      profileName: profile?.name ?? '',
      profileId: t.profileId,
      port: t.port ?? 0,
      dnsExpected: t.dnsExpected ?? '',
      sslWarnDays: t.sslWarnDays ?? 14,
      slowAlertAfter: t.slowAlertAfter ?? 0,
      upSound: t.upSound === 'no-sound' ? 'no-sound' : resolveSound(t.upSound, profile?.upSound, settings.defaultUpSound || 'Up-Default.wav'),
      downSound: t.downSound === 'no-sound' ? 'no-sound' : resolveSound(t.downSound, profile?.downSound, settings.defaultDownSound || 'Down-Default.wav'),
      keyword: t.keyword,
      keywordRule: t.keywordRule,
      paused: t.paused ?? false,
      emailRecipients: email?.recipients ?? [],
      emailDownSubject: email?.downSubject ?? '',
      emailDownBody: email?.downBody ?? '',
      emailOnRecovery: email?.onRecovery ?? false,
      emailUpSubject: email?.upSubject ?? '',
      emailUpBody: email?.upBody ?? '',
    };
  });
}

export async function syncTargetsToBackend(): Promise<void> {
  try {
    await fetch(`${API}/api/targets`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildBackendTargets()),
    });
  } catch (e) {
    console.error('Failed to sync targets to the monitoring service:', e);
  }
}

/** Asks the dashboard to sync (it listens for this event). */
export function requestSync(): void {
  window.dispatchEvent(new CustomEvent('sync-targets'));
}
