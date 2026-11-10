/**
 * Masks target names and addresses in the service log with asterisks before it is shared.
 * Dots, colons and spaces stay, so "192.168.178.5" reads as "***.***.***.*".
 */
export interface MaskOptions {
  names: boolean;
  addresses: boolean;
}

export interface MaskSource {
  /** Names of the targets this window knows (removed ones are caught by the log patterns). */
  names: string[];
  /** Hosts as entered on targets: URLs, host names, IPs. */
  hosts: string[];
}

const stars = (s: string) => s.replace(/[^\s.:/@[\]-]/g, '*');
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Where the service writes a target's name (see the Logger calls in the Java service). */
const NAME_PATTERNS: RegExp[] = [
  /(\bTarget )(.+?)( (?:is still offline|check failed|initial (?:state|check)|is slow|is responding normally))/g,
  /(\bTarget (?:added|edited)(?: via API)?: (?:ID \d+ - )?)(.+?)(?= \(ID:|$)/g,
  /(\bTarget went offline: )(.+?)( \(alert)/g,
  /(\bTarget recovered: )(.+?)( is back online)/g,
  /(\bMaintenance (?:started|ended) for )(.+?)(?=: |$)/g,
  /(\b(?:Outage|Response time) email (?:sent )?for )(.+?)( to | failed:|: )/g,
];

const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
// Four or more groups, or a "::" with hex around it, so clock times like 13:15:28 are left alone.
const IPV6 = /\b(?:[0-9a-f]{1,4}:){4,7}[0-9a-f]{1,4}\b|\b[0-9a-f]{0,4}(?::[0-9a-f]{1,4})*::(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?\b/gi;
const URL_HOST = /(\b[a-z][a-z0-9+.-]*:\/\/)([^\s/:?#]+)/gi;
const EMAIL = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g;
/** The service's own address is not private and helps reading the log. */
const KEEP = new Set(['127.0.0.1', 'localhost', '0.0.0.0']);

/** "https://nas.local:5001/x" → "nas.local". */
export function hostOf(host: string): string {
  const h = host.trim();
  if (!h) return '';
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(h)) return new URL(h).hostname.replace(/^\[|\]$/g, '');
  } catch { /* not a URL */ }
  return h.replace(/\/.*$/, '').replace(/:\d+$/, '');
}

export function makeMasker(source: MaskSource, opts: MaskOptions): (line: string) => string {
  const names = [...new Set(source.names.map((n) => n.trim()).filter((n) => n.length >= 2))].sort((a, b) => b.length - a.length);
  const hosts = [...new Set(source.hosts.map(hostOf).filter((h) => h.length >= 2 && !KEEP.has(h)))].sort((a, b) => b.length - a.length);
  const nameRe = names.length ? new RegExp(names.map(escape).join('|'), 'g') : null;
  const hostRe = hosts.length ? new RegExp(hosts.map(escape).join('|'), 'gi') : null;
  const keep = (m: string) => (KEEP.has(m) ? m : stars(m));

  return (line: string) => {
    let s = line;
    if (opts.names) {
      for (const re of NAME_PATTERNS) s = s.replace(re, (_m, pre: string, name: string, post?: string) => `${pre}${stars(name)}${typeof post === 'string' ? post : ''}`);
      if (nameRe) s = s.replace(nameRe, stars);
    }
    if (opts.addresses) {
      if (hostRe) s = s.replace(hostRe, stars);
      s = s.replace(URL_HOST, (_m, scheme: string, host: string) => scheme + keep(host));
      s = s.replace(EMAIL, stars);
      s = s.replace(IPV4, keep);
      s = s.replace(IPV6, (m) => (m.includes(':') && m.replace(/:/g, '').length > 0 ? stars(m) : m));
    }
    return s;
  };
}
