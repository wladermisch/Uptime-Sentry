/**
 * Named templates kept in this window's storage (so they travel with backups).
 * One list per kind: maintenance windows, report setups.
 */
export interface Template<T> {
  name: string;
  savedAt: string;
  data: T;
}

const storageKey = (kind: string) => `uptime_sentry_templates_${kind}`;

export function loadTemplates<T>(kind: string): Template<T>[] {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(kind)) || '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((t): t is Template<T> => !!t && typeof (t as Template<T>).name === 'string' && typeof (t as Template<T>).data === 'object');
  } catch {
    return [];
  }
}

function store<T>(kind: string, list: Template<T>[]): Template<T>[] {
  try { localStorage.setItem(storageKey(kind), JSON.stringify(list)); } catch { /* storage unavailable */ }
  return list;
}

/** Adds a template, or replaces the one with the same name (ignoring case). Sorted by name. */
export function saveTemplate<T>(kind: string, name: string, data: T): Template<T>[] {
  const clean = name.trim();
  const rest = loadTemplates<T>(kind).filter((t) => t.name.toLowerCase() !== clean.toLowerCase());
  const list = [...rest, { name: clean, savedAt: new Date().toISOString(), data }]
    .sort((a, b) => a.name.localeCompare(b.name));
  return store(kind, list);
}

export function deleteTemplate<T>(kind: string, name: string): Template<T>[] {
  return store(kind, loadTemplates<T>(kind).filter((t) => t.name !== name));
}
