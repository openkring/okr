import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore, Transaction } from 'firebase-admin/firestore';

import { periodKeyFor } from '../bank-import/bank-import.util';

const PERIOD_COLLECTION = 'periods';
const CONFIG_COLLECTION = 'accounting-configs';

/** The distinct annual period okeys touched by these StoreDates (empty/invalid dates are skipped). */
export function touchedPeriodKeys(accountingTenantId: string, dates: (string | undefined)[], fiscalYearStart: number): string[] {
  const keys = dates
    .filter((d): d is string => typeof d === 'string' && /^\d{8}$/.test(d))
    .map(d => periodKeyFor(accountingTenantId, d, fiscalYearStart));
  return [...new Set(keys)];
}

/** `fiscalYearStart` of the accounting tenant (1 = calendar year). */
export async function loadFiscalYearStart(db: Firestore, accountingTenantId: string): Promise<number> {
  const snap = await db.collection(CONFIG_COLLECTION).doc(accountingTenantId).get();
  return Number(snap.data()?.['fiscalYearStart'] ?? 1) || 1;
}

/**
 * Refuses a ledger change in a locked period (spec 1.60 §7.3, 1.68 D12). A booking moved between
 * years touches both — the old and the new date must lie in open periods. Reads only, so inside a
 * transaction it must run before the first write.
 */
export async function assertPeriodsOpen(db: Firestore, keys: string[], tx?: Transaction): Promise<void> {
  for (const key of keys) {
    const ref = db.collection(PERIOD_COLLECTION).doc(key);
    const snap = tx ? await tx.get(ref) : await ref.get();
    if (snap.exists && snap.data()?.['isLocked'] === true) {
      throw new HttpsError('failed-precondition', `period-locked: ${key}`, { reason: 'period-locked', periodKey: key });
    }
  }
}
