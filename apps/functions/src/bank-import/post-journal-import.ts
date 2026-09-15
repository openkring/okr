import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Transaction } from 'firebase-admin/firestore';

import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId, nextBookingNo } from '@okr/shared-util-functions';

import { buildJournalBookingHeader, buildJournalBookingLines, JournalEntry, periodKeyFor } from './bank-import.util';

const REGION = 'europe-west6';
const CF_NAME = 'postJournalImport';
const ACCOUNT_COLLECTION = 'accounts';
const CONFIG_COLLECTION = 'accounting-configs';
const PERIOD_COLLECTION = 'periods';
const BOOKING_COLLECTION = 'bookings';
const BOOKING_LINE_COLLECTION = 'booking-lines';
const MAX_ENTRIES = 100;

interface PostJournalImportData { accountingTenantId: string; entries?: JournalEntry[]; }
interface Failure { id: string; reason: string; }
interface Result { posted: number; replayed: number; failed: Failure[]; sums: Record<string, number>; }

class EntryError extends Error {
  constructor(public readonly code: string) { super(code); }
}

/**
 * Posts bexio journal entries as `posted` bookings (spec 1.60 §12). The client has already mapped
 * the bexio account numbers onto account okeys; the accounts are re-validated here. One
 * transaction per entry; the booking id is `journal-{accountingTenantId}-{id}`, so a re-import of
 * the same or an overlapping export finds the booking and counts it as replayed. `sums` returns
 * debit − credit per account over posted + replayed entries for the client's post-check.
 */
export const postJournalImport = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, timeoutSeconds: 540, memory: '512MiB' },
  async (request: CallableRequest<PostJournalImportData>): Promise<Result> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, ['treasurer']);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);

    const accountingTenantId = request.data?.accountingTenantId ?? '';
    if (!accountingTenantId) throw new HttpsError('invalid-argument', 'accountingTenantId is required');
    const entries = request.data?.entries ?? [];
    if (!Array.isArray(entries) || entries.length === 0) throw new HttpsError('invalid-argument', 'entries are required');
    if (entries.length > MAX_ENTRIES) throw new HttpsError('invalid-argument', `at most ${MAX_ENTRIES} entries per call`);

    const db = getFirestore();
    const configSnap = await db.collection(CONFIG_COLLECTION).doc(accountingTenantId).get();
    const fiscalYearStart = Number(configSnap.data()?.['fiscalYearStart'] ?? 1) || 1;

    // account validation is cached per call: the same handful of accounts recurs in every entry
    const leafCache = new Map<string, boolean>();
    const isLeafOfTenant = async (tx: Transaction, key: string): Promise<boolean> => {
      const cached = leafCache.get(key);
      if (cached !== undefined) return cached;
      const snap = await tx.get(db.collection(ACCOUNT_COLLECTION).doc(key));
      const data = snap.data();
      let ok = !!data && data['accountingTenantId'] === accountingTenantId && data['isArchived'] !== true && data['type'] !== 'group' && data['type'] !== 'root';
      if (ok) {
        const children = await tx.get(db.collection(ACCOUNT_COLLECTION).where('parentKey', '==', key).limit(1));
        ok = children.empty;
      }
      leafCache.set(key, ok);
      return ok;
    };

    const result: Result = { posted: 0, replayed: 0, failed: [], sums: {} };
    const addSum = (key: string, delta: number): void => { result.sums[key] = (result.sums[key] ?? 0) + delta; };

    for (const entry of entries) {
      const id = String(entry?.id ?? '');
      try {
        const outcome = await db.runTransaction(async (tx: Transaction) => {
          if (!id) throw new EntryError('date-invalid');
          if (!/^\d{8}$/.test(entry.date ?? '')) throw new EntryError('date-invalid');
          const amountBase = Math.round(Number(entry.amountBase));
          if (!Number.isFinite(amountBase) || amountBase <= 0) throw new EntryError('zero-amount');
          if (!entry.debitAccountKey || !entry.creditAccountKey || entry.debitAccountKey === entry.creditAccountKey) throw new EntryError('account-invalid');
          if (!(await isLeafOfTenant(tx, entry.debitAccountKey)) || !(await isLeafOfTenant(tx, entry.creditAccountKey))) throw new EntryError('account-invalid');

          const periodKey = periodKeyFor(accountingTenantId, entry.date, fiscalYearStart);
          const periodRef = db.collection(PERIOD_COLLECTION).doc(periodKey);
          const periodSnap = await tx.get(periodRef);
          if (periodSnap.exists && periodSnap.data()?.['isLocked'] === true) throw new EntryError('period-locked');

          const bookingKey = `journal-${accountingTenantId}-${id}`;
          const bookingRef = db.collection(BOOKING_COLLECTION).doc(bookingKey);
          const bookingSnap = await tx.get(bookingRef);
          if (bookingSnap.exists) return 'replayed';

          const year = Number(entry.date.substring(0, 4));
          // same full-ledger read as postBankImport; MAX_ENTRIES=100 is the mitigation (see the note there)
          const ledger = await tx.get(db.collection(BOOKING_COLLECTION).where('accountingTenantId', '==', accountingTenantId));
          const bookingNo = nextBookingNo(ledger.docs.map(s => s.data() as { date?: string; bookingNo?: number }), year);

          if (!periodSnap.exists) {
            tx.set(periodRef, { tenants: [tenantId], isArchived: false, accountingTenantId, year: Number(periodKey.slice(-4)), month: 0, isLocked: false, lockedBy: '', lockedAt: '' });
          }
          tx.set(bookingRef, { ...buildJournalBookingHeader(entry, tenantId, accountingTenantId, periodKey, bookingKey), bookingNo });
          const lines = buildJournalBookingLines(entry, tenantId, accountingTenantId, bookingKey);
          tx.set(db.collection(BOOKING_LINE_COLLECTION).doc(`${bookingKey}-dr`), lines[0]);
          tx.set(db.collection(BOOKING_LINE_COLLECTION).doc(`${bookingKey}-cr`), lines[1]);
          return 'posted';
        });
        if (outcome === 'posted') result.posted += 1; else result.replayed += 1;
        const amountBase = Math.round(Number(entry.amountBase));
        addSum(entry.debitAccountKey, amountBase);
        addSum(entry.creditAccountKey, -amountBase);
      } catch (e) {
        const code = e instanceof EntryError ? e.code : 'unknown';
        result.failed.push({ id, reason: code });
        logger.warn(`${CF_NAME}: ${id} failed: ${code}`, e instanceof EntryError ? undefined : e);
      }
    }
    logger.info(`${CF_NAME}: posted=${result.posted} replayed=${result.replayed} failed=${result.failed.length} (accountingTenant=${accountingTenantId})`);
    return result;
  },
);
