import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Transaction } from 'firebase-admin/firestore';

import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId, isBalanced, nextBookingNo } from '@okr/shared-util-functions';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { InvoiceCollection } from '@okr/shared-models';

import {
  buildBankBookingHeader, buildBankBookingLines, feeAmountOf, hasFeeLine, invoiceSettlement, isValidSplit, periodKeyFor, ProfileDoc, receivablesCredit, RowDoc,
  splitsOf, withCostCenterKeys,
} from './bank-import.util';
import { InvoiceLike } from '../invoice/invoice-payment.logic';
import { isBexioBackend } from '../bexio/backend-gate';
import { costCenterKeyForLine, loadCostCenterContext } from '../cost-center/cost-center-context';

const REGION = 'europe-west6';
const CF_NAME = 'postBankImport';
const ROW_COLLECTION = 'bank-import-rows';
const PROFILE_COLLECTION = 'bank-profiles';
const ACCOUNT_COLLECTION = 'accounts';
const CONFIG_COLLECTION = 'accounting-configs';
const PERIOD_COLLECTION = 'periods';
const BOOKING_COLLECTION = 'bookings';
const BOOKING_LINE_COLLECTION = 'booking-lines';
const MAX_ROWS = 100;

// splitTitle: base main name of a split booking in the caller's language (e.g. 'Sammelbuchung').
interface PostBankImportData { accountingTenantId: string; rowKeys?: string[]; splitTitle?: string; }
interface Failure { rowKey: string; reason: string; }
/** A posted row whose matched invoice was left untouched; `reason` is the comma-joined skip code. */
interface Unsettled { rowKey: string; invoiceKey: string; reason: string; }

/** The fields the payment rules and the tenant check read, from a raw invoice document; undefined stays undefined. */
function asInvoiceLike(doc: Record<string, unknown> | undefined): (InvoiceLike & { tenants: string[] }) | undefined {
  if (!doc) return undefined;
  // 1.76 Phase 3 adds reminder fees via `reminders`; the payment rules read them from there to compute
  // the open amount. Built in a variable so the field passes while InvoiceLike does not declare it yet.
  const invoice = {
    tenants: (doc['tenants'] as string[] | undefined) ?? [],
    state: String(doc['state'] ?? ''),
    totalAmount: doc['totalAmount'] as InvoiceLike['totalAmount'],
    payments: doc['payments'] as InvoiceLike['payments'],
    reminders: (doc['reminders'] as unknown[] | undefined) ?? [],
    accountingTenantId: String(doc['accountingTenantId'] ?? ''),
  };
  return invoice;
}

/** Thrown inside the per-row transaction; the code lands on the row's `error` field. */
class RowError extends Error {
  constructor(public readonly code: string) { super(code); }
}

/**
 * Posts staged bank-import rows as `posted` bookings (spec 1.60 §7). One transaction per row;
 * the booking id is `bank-{importKey}`, so a replay finds the booking and only flips the row.
 * `bookings`/`booking-lines` are CF-write-only; this is the bank import's only door into the ledger.
 */
export const postBankImport = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, timeoutSeconds: 540, memory: '512MiB' },
  async (request: CallableRequest<PostBankImportData>): Promise<{ posted: number; failed: Failure[]; unsettled: Unsettled[] }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, ['treasurer']);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);

    const accountingTenantId = request.data?.accountingTenantId ?? '';
    const splitTitle = typeof request.data?.splitTitle === 'string' ? request.data.splitTitle.slice(0, 60) : undefined;
    if (!accountingTenantId) throw new HttpsError('invalid-argument', 'accountingTenantId is required');
    const requested = request.data?.rowKeys;
    if (requested && requested.length > MAX_ROWS) throw new HttpsError('invalid-argument', `at most ${MAX_ROWS} rows per call`);

    const db = getFirestore();
    const configSnap = await db.collection(CONFIG_COLLECTION).doc(accountingTenantId).get();
    const fiscalYearStart = Number(configSnap.data()?.['fiscalYearStart'] ?? 1) || 1;
    const receivablesKey = String(configSnap.data()?.['receivablesAccountKey'] ?? '');
    const settlementBooks = { accountingTenantId, tenantId, bexioBackend: isBexioBackend(configSnap.data() as { accountingBackend?: string } | undefined) };

    // ---- candidate rows (mapped, this tenant + accounting tenant), file order = importedAt asc, date asc ----
    let rowRefs;
    if (requested?.length) {
      rowRefs = requested.map(k => db.collection(ROW_COLLECTION).doc(k));
    } else {
      const q = await db.collection(ROW_COLLECTION)
        .where('accountingTenantId', '==', accountingTenantId).where('status', '==', 'mapped')
        .orderBy('importedAt').orderBy('date').limit(MAX_ROWS).get();
      rowRefs = q.docs.map(d => d.ref);
    }

    // Kostenstellen: all reads happen once, before the per-row transactions (spec 1.65 §6.2)
    const ccCtx = await loadCostCenterContext(db, tenantId, accountingTenantId);
    const ruleSnap = await db.collection('bank-rules').where('accountingTenantId', '==', accountingTenantId).get();
    const ruleCostCenter = new Map(ruleSnap.docs
      .filter(s => ((s.data()['tenants'] as string[] | undefined) ?? []).includes(tenantId))
      .map(s => [s.id, (s.data()['costCenterKey'] as string | undefined) ?? '']));

    let posted = 0;
    const failed: Failure[] = [];
    const unsettled: Unsettled[] = [];
    for (const rowRef of rowRefs) {
      try {
        const outcome = await db.runTransaction(async (tx: Transaction): Promise<{ outcome: string; unsettled?: Omit<Unsettled, 'rowKey'> }> => {
          const rowSnap = await tx.get(rowRef);
          const row = rowSnap.data() as RowDoc | undefined;
          if (!row) throw new RowError('not-mapped');
          if (!(row.tenants ?? []).includes(tenantId) || row.accountingTenantId !== accountingTenantId) throw new RowError('not-mapped');
          if (row.status === 'posted') return { outcome: 'replayed' };
          if (row.status !== 'mapped' || !row.title || !row.accountKey) throw new RowError('not-mapped');

          const profileSnap = await tx.get(db.collection(PROFILE_COLLECTION).doc(row.bankProfileKey));
          const profile = profileSnap.data() as ProfileDoc | undefined;
          if (!profile || profile.accountingTenantId !== accountingTenantId || !profile.accountKey || profile.isArchived === true) throw new RowError('profile-missing');

          // Every counter-account — the main one and each split part's — must be a leaf of this
          // accounting tenant and must not be the bank account itself.
          if (!isValidSplit(row)) throw new RowError('split-invalid');
          const counterKeys = [...new Set([row.accountKey, ...splitsOf(row).map(s => s.accountKey)])];
          for (const counterKey of counterKeys) {
            const accountSnap = await tx.get(db.collection(ACCOUNT_COLLECTION).doc(counterKey));
            const account = accountSnap.data();
            if (!account || account['accountingTenantId'] !== accountingTenantId || counterKey === profile.accountKey) throw new RowError('account-invalid');
            const children = await tx.get(db.collection(ACCOUNT_COLLECTION).where('parentKey', '==', counterKey).limit(1));
            if (!children.empty) throw new RowError('account-invalid');
          }

          // Processor fee (spec 1.62 §5): its account is validated like the counter-account, and the
          // fee can never swallow the whole transaction — that would be a silent mis-booking.
          if (hasFeeLine(row, profile)) {
            if (feeAmountOf(row) >= Math.abs(row.amount.amount)) throw new RowError('fee-exceeds-amount');
            const feeAccountKey = profile.feeAccountKey as string;
            if (feeAccountKey === profile.accountKey || counterKeys.includes(feeAccountKey)) throw new RowError('account-invalid');
            const feeSnap = await tx.get(db.collection(ACCOUNT_COLLECTION).doc(feeAccountKey));
            const feeAccount = feeSnap.data();
            if (!feeAccount || feeAccount['accountingTenantId'] !== accountingTenantId) throw new RowError('account-invalid');
            const feeChildren = await tx.get(db.collection(ACCOUNT_COLLECTION).where('parentKey', '==', feeAccountKey).limit(1));
            if (!feeChildren.empty) throw new RowError('account-invalid');
          }

          const periodKey = periodKeyFor(accountingTenantId, row.date, fiscalYearStart);
          const periodRef = db.collection(PERIOD_COLLECTION).doc(periodKey);
          const periodSnap = await tx.get(periodRef);
          if (periodSnap.exists && periodSnap.data()?.['isLocked'] === true) throw new RowError('period-locked');

          const bookingKey = `bank-${row.importKey}`;
          const bookingRef = db.collection(BOOKING_COLLECTION).doc(bookingKey);
          const bookingSnap = await tx.get(bookingRef);
          const now = getTodayStr(DateFormat.StoreDateTime);
          if (bookingSnap.exists) {
            tx.update(rowRef, { status: 'posted', bookingKey, postedAt: now, error: '' });
            return { outcome: 'replayed' };
          }

          const lines = withCostCenterKeys(buildBankBookingLines(row, profile, tenantId, bookingKey), row,
            ruleCostCenter.get(row.ruleKey ?? '') ?? '', (accountKey, rule) => costCenterKeyForLine(ccCtx, accountKey, { rule }));
          if (!isBalanced(lines as { debitAmount?: { amount: number } | null; creditAmount?: { amount: number } | null }[])) {
            throw new RowError('unbalanced');
          }

          // spec 1.2 §4.3 / 1.76 D6 link rule: a credit matched to an invoice and booked against the
          // receivables account settles it in the same transaction. Never blocks the booking. The
          // amount is the receivables credit (gross), not the bank net: a processor fee is ours.
          // bexio books are never read: invoiceSettlement refuses them before it looks at the invoice.
          let invoicePatch: Record<string, unknown> | undefined;
          let skip: string | undefined;
          const invoiceRef = row.invoiceKey ? db.collection(InvoiceCollection).doc(row.invoiceKey) : undefined;
          if (invoiceRef) {
            if (row.amount.amount > 0 && row.amount.currency === 'CHF' && receivablesKey) {
              const amount = receivablesCredit(lines as { accountKey: string; creditAmount?: { amount: number } | null }[], receivablesKey);
              const invoice = settlementBooks.bexioBackend ? undefined : asInvoiceLike((await tx.get(invoiceRef)).data());
              const settlement = invoiceSettlement(invoice, settlementBooks, amount, row.date, bookingKey, profile.accountKey);
              if ('patch' in settlement) invoicePatch = settlement.patch;
              else skip = settlement.skip;
            } else {
              skip = receivablesKey ? 'not-a-chf-credit' : 'no-receivables-account';
            }
          }
          const year = Number(row.date.substring(0, 4));
          // Follow-up: this reads the whole ledger of the accounting tenant per row to compute
          // nextBookingNo. MAX_ROWS=100 is the mitigation for now; the real fix is a narrow read
          // (`orderBy bookingNo desc limit 1`, backed by an index) instead of the full scan.
          const ledger = await tx.get(db.collection(BOOKING_COLLECTION).where('accountingTenantId', '==', accountingTenantId));
          const bookingNo = nextBookingNo(ledger.docs.map(s => s.data() as { date?: string; bookingNo?: number }), year);

          if (!periodSnap.exists) {
            tx.set(periodRef, { tenants: [tenantId], isArchived: false, accountingTenantId, year: Number(periodKey.slice(-4)), month: 0, isLocked: false, lockedBy: '', lockedAt: '' });
          }
          tx.set(bookingRef, { ...buildBankBookingHeader(row, tenantId, periodKey, splitTitle), bookingNo });
          for (const line of lines) tx.set(db.collection(BOOKING_LINE_COLLECTION).doc(), line);
          tx.update(rowRef, { status: 'posted', bookingKey, postedAt: now, error: '' });
          if (invoiceRef && invoicePatch) tx.update(invoiceRef, invoicePatch);
          return { outcome: 'posted', unsettled: skip && row.invoiceKey ? { invoiceKey: row.invoiceKey, reason: skip } : undefined };
        });
        posted += 1;
        logger.info(`${CF_NAME}: ${rowRef.id} ${outcome.outcome} (tenant=${tenantId})`);
        // reported only once the transaction committed: a retried attempt must not be counted twice
        if (outcome.unsettled) {
          unsettled.push({ rowKey: rowRef.id, ...outcome.unsettled });
          logger.warn(`${CF_NAME}: ${rowRef.id} invoice ${outcome.unsettled.invoiceKey} not settled (${outcome.unsettled.reason})`);
        }
      } catch (e) {
        const code = e instanceof RowError ? e.code : 'unknown';
        failed.push({ rowKey: rowRef.id, reason: code });
        logger.warn(`${CF_NAME}: ${rowRef.id} failed: ${code}`, e instanceof RowError ? undefined : e);
        if (code !== 'not-mapped') {
          await rowRef.set({ status: 'error', error: code }, { merge: true }).catch(() => undefined);
        }
      }
    }
    logger.info(`${CF_NAME}: posted=${posted} failed=${failed.length} (accountingTenant=${accountingTenantId})`);
    return { posted, failed, unsettled };
  },
);

export { postJournalImport } from './post-journal-import';
