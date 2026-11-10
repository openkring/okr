// The publish lock and log of a website (design §7.2): every publish, dry run and rollback is one
// `websites/{siteId}/publishes/{autoId}` doc. While it is `running` no second publish starts; a run older
// than LOCK_TTL_MS (the callable's timeout is 300 s) is presumed dead and taken over.
// Written only by the Admin SDK; clients read it (contentAdmin/admin of the site's tenant), never write.
import type { DocumentReference, Firestore, Query, Transaction } from 'firebase-admin/firestore';

export const PUBLISHES_SUBCOLLECTION = 'publishes';
export const LOCK_TTL_MS = 5 * 60 * 1000;

export type PublishState = 'running' | 'done' | 'refused' | 'dryRun' | 'failed' | 'rollback';

export interface PublishLock {
  id: string;
}

function publishes(db: Firestore, siteId: string) {
  return db.collection('websites').doc(siteId).collection(PUBLISHES_SUBCOLLECTION);
}

/** Firestore rejects `undefined` values unless ignoreUndefinedProperties is set; drop them. */
function defined(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
}

function isFresh(startedAt: unknown, now: Date): boolean {
  const started = typeof startedAt === 'string' ? Date.parse(startedAt) : NaN;
  return Number.isFinite(started) && now.getTime() - started < LOCK_TTL_MS;
}

/**
 * Starts a run: undefined when another run of the site is younger than LOCK_TTL_MS (alreadyRunning);
 * older `running` docs are closed as `failed` and the new run proceeds. One transaction, so two callers
 * racing for the lock cannot both win.
 */
export async function acquireLock(
  db: Firestore,
  siteId: string,
  personKey: string,
  tenants: string[],
  now: Date = new Date(),
): Promise<PublishLock | undefined> {
  const col = publishes(db, siteId);
  return db.runTransaction(async (tx: Transaction) => {
    const running = await tx.get(col.where('state', '==', 'running') as Query);
    if (running.docs.some((d) => isFresh(d.data()['startedAt'], now))) return undefined;
    for (const stale of running.docs) {
      tx.update(stale.ref, { state: 'failed', finishedAt: now.toISOString(), detail: 'stale lock taken over' });
    }
    const ref: DocumentReference = col.doc();
    tx.set(ref, { state: 'running', startedAt: now.toISOString(), startedBy: personKey, tenants });
    return { id: ref.id };
  });
}

/** Ends a run: its end state, `finishedAt` and the outcome fields (version, files, problems, detail …). */
export async function closeLock(
  db: Firestore,
  siteId: string,
  lockId: string,
  state: Exclude<PublishState, 'running'>,
  fields: Record<string, unknown>,
  now: Date = new Date(),
): Promise<void> {
  await publishes(db, siteId)
    .doc(lockId)
    .update(defined({ ...fields, state, finishedAt: now.toISOString() }));
}
