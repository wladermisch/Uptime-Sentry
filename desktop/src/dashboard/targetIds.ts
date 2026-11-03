/**
 * Target ids are shared with the Java backend, which stores them as a 32-bit `int`
 * and keys check history by them. Ids must therefore stay small, positive integers.
 */

const MAX_INT = 2147483647;

interface HasId {
  id?: number;
}

/** Next free id: one above the largest valid id in use. */
export function nextTargetId(targets: HasId[]): number {
  const max = targets.reduce((m, t) => (t.id && t.id > 0 && t.id <= MAX_INT ? Math.max(m, t.id) : m), 0);
  return max + 1;
}

/**
 * Renumbers targets whose id the backend cannot store (e.g. old `Date.now()` ids).
 * Returns the fixed list and whether anything changed.
 */
export function migrateTargetIds<T extends HasId>(targets: T[]): { targets: T[]; changed: boolean } {
  let changed = false;
  const fixed: T[] = [];
  for (const t of targets) {
    if (!t.id || t.id <= 0 || t.id > MAX_INT || !Number.isInteger(t.id)) {
      fixed.push({ ...t, id: nextTargetId([...fixed, ...targets.filter((x) => x.id && x.id <= MAX_INT)]) });
      changed = true;
    } else {
      fixed.push(t);
    }
  }
  return { targets: fixed, changed };
}

interface TargetKey extends HasId {
  profileId?: string;
  type?: string;
  host?: string;
}

/**
 * Drops later copies of a target that check the same host the same way in the same profile
 * (older onboarding versions added a second Google DNS). The first copy is kept.
 */
export function dropDuplicateTargets<T extends TargetKey>(targets: T[]): { targets: T[]; changed: boolean } {
  const seen = new Set<string>();
  const kept = targets.filter((t) => {
    const key = `${t.profileId ?? ''}|${t.type ?? ''}|${(t.host ?? '').trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { targets: kept, changed: kept.length !== targets.length };
}
