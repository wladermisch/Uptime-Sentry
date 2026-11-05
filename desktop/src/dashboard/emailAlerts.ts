/**
 * Outage email rules. The app settings hold the default recipients and message; a profile can
 * replace them for its targets, and a target can replace its profile's. The resolved rule is
 * sent to the monitoring service with each target (see backendSync.ts).
 */

export interface EmailTemplate {
  downSubject: string;
  downBody: string;
  onRecovery: boolean;
  upSubject: string;
  upBody: string;
}

/** inherit: use the level above (profile → app settings). custom: own recipients and message. off: never email. */
export type EmailMode = 'inherit' | 'custom' | 'off';

export interface EmailRule extends EmailTemplate {
  mode: EmailMode;
  recipients: string[];
}

export const DEFAULT_TEMPLATE: EmailTemplate = {
  downSubject: '[Uptime Sentry] {target} is DOWN',
  downBody: [
    '{target} stopped responding.',
    '',
    'Target:         {target} ({type})',
    'Address:        {host}',
    'Profile:        {profile}',
    'Down since:     {downSince}',
    'Failed checks:  {failures}',
    'Reason:         {reason}',
    '',
    'Checked from {computer} by Uptime Sentry.',
  ].join('\n'),
  onRecovery: true,
  upSubject: '[Uptime Sentry] {target} is back UP',
  upBody: [
    '{target} is responding again.',
    '',
    'Target:         {target} ({type})',
    'Address:        {host}',
    'Profile:        {profile}',
    'Down since:     {downSince}',
    'Recovered at:   {time}',
    'Downtime:       {duration}',
    'Response time:  {responseTime}',
    '',
    'Checked from {computer} by Uptime Sentry.',
  ].join('\n'),
};

export const INHERIT_RULE: EmailRule = { mode: 'inherit', recipients: [], ...DEFAULT_TEMPLATE };

export const PLACEHOLDERS: { key: string; label: string; sample: string }[] = [
  { key: 'target', label: 'Target name', sample: 'Example website' },
  { key: 'host', label: 'URL or host', sample: 'https://example.com' },
  { key: 'type', label: 'Check type', sample: 'HTTP' },
  { key: 'profile', label: 'Profile', sample: 'Standard Profile' },
  { key: 'status', label: 'DOWN or UP', sample: 'DOWN' },
  { key: 'reason', label: 'Why the check failed', sample: 'HTTP 503 (not an accepted status)' },
  { key: 'downSince', label: 'First failed check', sample: '2026-11-05 14:02:11' },
  { key: 'time', label: 'Time of this check', sample: '2026-11-05 14:09:11' },
  { key: 'duration', label: 'How long it was down', sample: '7 min' },
  { key: 'failures', label: 'Failed checks in a row', sample: '3' },
  { key: 'responseTime', label: 'Response time', sample: '184 ms' },
  { key: 'computer', label: 'This computer', sample: 'OFFICE-PC' },
];

const SAMPLE = new Map(PLACEHOLDERS.map((p) => [p.key, p.sample]));

/** Fills {placeholders} with example values, for previews. Unknown placeholders stay as typed. */
export function renderSample(template: string, status: 'DOWN' | 'UP'): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (m, key: string) => (key === 'status' ? status : SAMPLE.get(key) ?? m));
}

const ADDRESS = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

export function isEmail(v: string): boolean {
  return ADDRESS.test(v.trim());
}

/** Splits pasted text like "a@x.com; b@y.com, c@z.com" into separate addresses. */
export function splitAddresses(text: string): string[] {
  return text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
}

/** Email part of the app settings (localStorage uptime_sentry_settings). */
export interface AppEmailSettings {
  emailAlertsEnabled: boolean;
  emailRecipients: string[];
  emailTemplate: EmailTemplate;
}

export function readAppEmailSettings(): AppEmailSettings {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(localStorage.getItem('uptime_sentry_settings') || '{}') as Record<string, unknown>;
  } catch {
    // Fall back to defaults.
  }
  return normalizeAppEmail(raw);
}

/** Reads the stored settings, including the single "emailRecipient" field older versions saved. */
export function normalizeAppEmail(raw: Record<string, unknown>): AppEmailSettings {
  const list = Array.isArray(raw.emailRecipients) ? (raw.emailRecipients as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  const legacy = typeof raw.emailRecipient === 'string' && raw.emailRecipient.trim() ? [raw.emailRecipient.trim()] : [];
  const tpl = (raw.emailTemplate ?? {}) as Partial<EmailTemplate>;
  return {
    emailAlertsEnabled: raw.emailAlertsEnabled === true,
    emailRecipients: list.length ? list : legacy,
    emailTemplate: { ...DEFAULT_TEMPLATE, ...tpl },
  };
}

export interface ResolvedEmail extends EmailTemplate {
  recipients: string[];
  /** Where the rule came from, for summaries in the UI. */
  source: 'app' | 'profile' | 'target';
}

/** Which rule applies to a target. Null means no email (switched off, or nobody to send to). */
export function resolveEmail(targetRule: EmailRule | undefined, profileRule: EmailRule | undefined, app: AppEmailSettings): ResolvedEmail | null {
  if (!app.emailAlertsEnabled) return null;
  let resolved: ResolvedEmail;
  if (targetRule?.mode === 'off') return null;
  if (targetRule?.mode === 'custom') {
    resolved = { ...pickTemplate(targetRule), recipients: targetRule.recipients, source: 'target' };
  } else if (profileRule?.mode === 'off') {
    return null;
  } else if (profileRule?.mode === 'custom') {
    resolved = { ...pickTemplate(profileRule), recipients: profileRule.recipients, source: 'profile' };
  } else {
    resolved = { ...app.emailTemplate, recipients: app.emailRecipients, source: 'app' };
  }
  const recipients = resolved.recipients.filter(isEmail);
  return recipients.length ? { ...resolved, recipients } : null;
}

function pickTemplate(r: EmailTemplate): EmailTemplate {
  return { downSubject: r.downSubject, downBody: r.downBody, onRecovery: r.onRecovery, upSubject: r.upSubject, upBody: r.upBody };
}

/** One line describing who gets emailed, e.g. "Emails ops@x.com and 1 more · app default". */
export function describeEmail(resolved: ResolvedEmail | null, app: AppEmailSettings): string {
  if (!app.emailAlertsEnabled) return 'Outage emails are switched off in Settings.';
  if (!resolved) return 'No email is sent.';
  const [first, ...rest] = resolved.recipients;
  const who = rest.length ? `${first} and ${rest.length} more` : first;
  const from = resolved.source === 'app' ? 'app default' : resolved.source === 'profile' ? 'profile setting' : 'this target';
  return `Emails ${who} · ${from}${resolved.onRecovery ? ' · also on recovery' : ''}`;
}
