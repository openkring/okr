// apps/functions/src/badge/ledger.ts
//
// Server badge ledger I/O: `users/{uid}/badge/counts` (spec 1.127 §3.7, option B). The pure
// rules live in `@okr/shared-util-core` (server-badge-ledger.util); this file only reads and
// writes. The admin SDK bypasses the rules, which let only the member touch their own doc.

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { badgeCountsPath } from '@okr/shared-models';
import { addChatToLedger, serverBadgeSum, setLedgerPart, type ServerBadgeLedger } from '@okr/shared-util-core';

/** Counts one chat event once (transaction, de-duplicated by `eventId`); returns the new sum. */
export async function addChatBadge(uid: string, eventId: string): Promise<number | undefined> {
  const db = getFirestore();
  const ref = db.doc(badgeCountsPath(uid));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? (snap.data() as Partial<ServerBadgeLedger>) : undefined;
    const { next, changed } = addChatToLedger(prev, eventId);
    if (changed) tx.set(ref, { ...next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return serverBadgeSum(next);
  });
}

/** Sets one absolute part (tasks or invitations) the server can compute itself. */
export async function setBadgePart(uid: string, part: 'tasks' | 'invitations', n: number): Promise<void> {
  const db = getFirestore();
  const ref = db.doc(badgeCountsPath(uid));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = setLedgerPart(snap.exists ? (snap.data() as Partial<ServerBadgeLedger>) : undefined, part, n);
    tx.set(ref, { ...next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

/** The badge sum per uid, `undefined` where the app has not written the ledger yet. */
export async function readBadgeSums(uids: string[]): Promise<Map<string, number | undefined>> {
  const out = new Map<string, number | undefined>();
  const unique = [...new Set(uids)];
  if (unique.length === 0) return out;
  const db = getFirestore();
  const snaps = await db.getAll(...unique.map((uid) => db.doc(badgeCountsPath(uid))));
  snaps.forEach((snap, i) => out.set(unique[i], snap.exists ? serverBadgeSum(snap.data() as Partial<ServerBadgeLedger>) : undefined));
  return out;
}
