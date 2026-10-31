import { getApp } from 'firebase/app';
import { doc, getFirestore, setDoc } from 'firebase/firestore';

import { badgeCountsPath } from '@okr/shared-models';
import { BadgeParts, DateFormat, getTodayStr, ledgerPartsFromApp } from '@okr/shared-util-core';

/**
 * The app's half of the server badge ledger `users/{uid}/badge/counts` (spec 1.127 N1, §3.7 B):
 * merge the parts the open app has loaded, and `fromApp: true`. Only allowed keys are written
 * (firestore.rules): chat / tasks / invitations (clamped to 0..9999), fromApp, updatedAt.
 *
 * Pass only parts whose source has loaded (readyBadgeParts): a lower sum triggers a badge-only
 * push to the member's iOS devices. Best effort: a failed write is logged, never thrown.
 */
export async function writeServerBadgeLedger(uid: string, parts: Partial<BadgeParts>): Promise<void> {
  if (!uid) return;
  try {
    const db = getFirestore(getApp());
    await setDoc(
      doc(db, badgeCountsPath(uid)),
      { ...ledgerPartsFromApp(parts), updatedAt: getTodayStr(DateFormat.StoreDateTime) },
      { merge: true },
    );
  } catch (error) {
    console.warn('writeServerBadgeLedger: ledger not written:', error);
  }
}
