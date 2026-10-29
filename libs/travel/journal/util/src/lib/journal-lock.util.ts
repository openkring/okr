/**
 * Ephemeral edit locks (spec 1.126 §6.2): an author editing a block or a footprint locks it for the other
 * authors. A lock lives in memory, travels over P2P and through Firestore `journal-locks`, and expires on its
 * own: `until` is a wall-clock ms, renewed by a heartbeat; `until: 0` is a release.
 */
export interface JournalLock {
  journalKey: string;
  entityKey: string;
  personKey: string;
  name: string;
  until: number;
}

export const LOCK_TTL_MS = 120_000;
export const LOCK_HEARTBEAT_MS = 30_000;

/** The lock another person holds on this entity right now, else undefined. */
export function lockedBy(locks: Record<string, JournalLock>, entityKey: string, me: string, now: number): JournalLock | undefined {
  const lock = locks[entityKey];
  return lock && lock.personKey !== me && lock.until > now ? lock : undefined;
}

/** Merges incoming locks: per entity the one with the later `until` wins; until 0 = released. */
export function mergeLocks(current: Record<string, JournalLock>, incoming: JournalLock[]): Record<string, JournalLock> {
  const out = { ...current };
  for (const lock of incoming) {
    const held = out[lock.entityKey];
    // a release only counts from the holder: a stale release must not clear someone else's newer lock
    if (!held || lock.until >= held.until || (lock.until <= 0 && lock.personKey === held.personKey)) out[lock.entityKey] = lock;
  }
  for (const [key, lock] of Object.entries(out)) {
    if (lock.until <= 0) delete out[key];
  }
  return out;
}

export function isJournalLock(l: unknown, journalKey: string): l is JournalLock {
  if (typeof l !== 'object' || l === null) return false;
  const r = l as Record<string, unknown>;
  return r['journalKey'] === journalKey && typeof r['entityKey'] === 'string' && r['entityKey'] !== ''
    && typeof r['personKey'] === 'string' && r['personKey'] !== '' && typeof r['name'] === 'string'
    && typeof r['until'] === 'number' && Number.isFinite(r['until']);
}
