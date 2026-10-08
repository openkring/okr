import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { BillCollection } from '@okr/shared-models';
import { normalizeQrReference, projectKeyForLine } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';

import { periodKeyFor } from '../bank-import/bank-import.util';
import { assertPeriodsOpen } from '../booking/period-lock';
import { assertExplicitCostCenter, costCenterKeyForLine, loadCostCenterContext } from '../cost-center/cost-center-context';
import { refuse } from '../invoice/invoice-context';
import { withoutUndefined } from '../invoice/invoice.logic';
import { assertProjectKeyShapes, assertProjectsAssignable, assertProjectsOnProfitAndLoss } from '../project/project-context';
import { writeFinanceHistory } from '../finance-history/finance-history';
import { BillLineInput } from './bill.logic';
import { BillDetailsBill, BillDetailsInput, planBillDetailsUpdate } from './bill-details.logic';
import { loadBillConfig, loadOwnBill } from './bill-context';

const REGION = 'europe-west6';
const CF_NAME = 'updateBillDetails';
const BOOKING_COLLECTION = 'bookings';
const BOOKING_LINE_COLLECTION = 'booking-lines';
const MAX_TITLE_LENGTH = 200;
const MAX_NOTES_LENGTH = 2000;
const MAX_IBAN_LENGTH = 34;
const STORE_DATE = /^\d{8}$/;

interface UpdateBillDetailsData extends BillDetailsInput {
  billKey?: string;
}

const optString = (v: unknown, field: string, max: number): string | undefined => {
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw new HttpsError('invalid-argument', `${field} must be a string`);
  return v.trim().slice(0, max);
};

/** The request as the plan expects it: strings trimmed and capped, unknown fields dropped, `lines` positional. */
function cleanInput(d: UpdateBillDetailsData): BillDetailsInput {
  const dueDate = optString(d.dueDate, 'dueDate', 8);
  if (dueDate !== undefined && dueDate !== '' && !STORE_DATE.test(dueDate)) throw new HttpsError('invalid-argument', 'dueDate must be empty or a yyyymmdd date');
  const input: BillDetailsInput = {};
  const set = <K extends keyof BillDetailsInput>(k: K, v: BillDetailsInput[K]) => { if (v !== undefined) input[k] = v; };
  set('title', optString(d.title, 'title', MAX_TITLE_LENGTH));
  // notes keep their inner whitespace; only the length is capped
  if (d.notes !== undefined) {
    if (typeof d.notes !== 'string') throw new HttpsError('invalid-argument', 'notes must be a string');
    input.notes = d.notes.slice(0, MAX_NOTES_LENGTH);
  }
  set('dueDate', dueDate);
  const ref = optString(d.paymentReference, 'paymentReference', 40);
  set('paymentReference', ref === undefined ? undefined : normalizeQrReference(ref));
  const iban = optString(d.creditorIban, 'creditorIban', MAX_IBAN_LENGTH);
  set('creditorIban', iban === undefined ? undefined : iban.replace(/\s+/g, '').toUpperCase());
  if (d.lines !== undefined) {
    if (!Array.isArray(d.lines)) throw new HttpsError('invalid-argument', 'lines must be an array');
    assertProjectKeyShapes(d.lines.filter((l) => !!l && typeof l === 'object') as { projectKey?: unknown }[]);
    input.lines = d.lines.map((l, i) => {
      if (!l || typeof l !== 'object') throw new HttpsError('invalid-argument', `line ${i} must be an object`);
      const o = l as Record<string, unknown>;
      const line: NonNullable<BillDetailsInput['lines']>[number] = {};
      const t = optString(o['title'], `line ${i} title`, MAX_TITLE_LENGTH);
      const cc = optString(o['costCenterKey'], `line ${i} costCenterKey`, 100);
      const pk = optString(o['projectKey'], `line ${i} projectKey`, 100);
      if (t !== undefined) line.title = t;
      if (cc !== undefined) line.costCenterKey = cc;
      if (pk !== undefined) line.projectKey = pk;
      return line;
    });
  }
  return input;
}

/**
 * Edits a BOOKED bill's details (spec 1.92 D3-D7): texts, notes, payment data (until paid) and per
 * line the title, Kostenstelle and Kostenträger. The bill stays the source of truth; in the same
 * transaction the `bill-{key}` booking (title/index) and its lines `bill-{key}-{i}` (description,
 * costCenterKey, projectKey) are updated. Amounts, accounts, VAT, dates and the line count never
 * change. Whatever lands on the booking needs an open period; `notes` and payment data do not.
 * A bill without its own booking (migrated from bexio) is updated on the bill only.
 */
export const updateBillDetails = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<UpdateBillDetailsData>): Promise<{ billKey: string; changed: boolean }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, ['treasurer']);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);

    const billKey = request.data?.billKey;
    if (typeof billKey !== 'string' || !billKey.trim()) throw new HttpsError('invalid-argument', 'billKey is required');
    const input = cleanInput(request.data);
    const bookingKey = `bill-${billKey}`;

    const db = getFirestore();
    const billRef = db.collection(BillCollection).doc(billKey);
    const bookingRef = db.collection(BOOKING_COLLECTION).doc(bookingKey);

    // ---- plain reads and validation before the transaction ----
    const pre = await loadOwnBill(db, tenantId, billKey);
    const accountingTenantId = String(pre['accountingTenantId'] ?? '');
    const config = await loadBillConfig(db, tenantId, billKey, accountingTenantId);
    const fiscalYearStart = Number(config['fiscalYearStart'] ?? 1) || 1;
    const preLines = (pre['lines'] as BillLineInput[] | undefined) ?? [];
    const hasBookingOf = (b: Record<string, unknown>): boolean => ((b['bookingKeys'] as string[] | undefined) ?? []).includes(bookingKey);
    const prePlan = planBillDetailsUpdate(pre as BillDetailsBill, input, { hasBooking: hasBookingOf(pre), bookingDate: '', bookingNo: 0 });
    if (prePlan.refusal) throw refuse(prePlan.refusal, `bill ${billKey}: ${prePlan.refusal}`);

    // only the values that CHANGE are validated (a stored value is grandfathered); the transaction re-plans and compares
    const ccCtx = await loadCostCenterContext(db, tenantId, accountingTenantId, preLines.map((l) => l.accountKey));
    const checked = new Set<string>();
    for (const { index, patch } of prePlan.linePatches) {
      if (patch.costCenterKey !== undefined) {
        assertExplicitCostCenter(ccCtx, preLines[index].accountKey, patch.costCenterKey, new Set());
        checked.add(`cc:${index}:${patch.costCenterKey}`);
      }
    }
    const projectLines = prePlan.linePatches.filter((p) => p.patch.projectKey !== undefined).map((p) => ({ projectKey: p.patch.projectKey }));
    await assertProjectsAssignable(db, tenantId, projectLines);
    assertProjectsOnProfitAndLoss(ccCtx.accounts, prePlan.linePatches.filter((p) => !!p.patch.projectKey).map((p) => ({ accountKey: preLines[p.index].accountKey, projectKey: p.patch.projectKey })));
    for (const { index, patch } of prePlan.linePatches) {
      if (patch.projectKey !== undefined) checked.add(`pk:${index}:${patch.projectKey}`);
    }

    const result = await db.runTransaction(async (tx) => {
      // reads (all before any write)
      const bill = (await tx.get(billRef)).data();
      if (!bill) throw new HttpsError('not-found', `bill ${billKey} not found`);
      if (String(bill['accountingTenantId'] ?? '') !== accountingTenantId || !((bill['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
        throw refuse('state-changed', `bill ${billKey} changed while it was edited`);
      }
      const hasBooking = hasBookingOf(bill);
      const booking = hasBooking ? (await tx.get(bookingRef)).data() : undefined;
      if (hasBooking && !booking) throw refuse('inconsistent-state', `booking ${bookingKey} is missing for bill ${billKey}`);

      const plan = planBillDetailsUpdate(bill as BillDetailsBill, input, {
        hasBooking, bookingDate: String(booking?.['date'] ?? ''), bookingNo: Number(booking?.['bookingNo'] ?? 0),
      });
      if (plan.refusal) throw refuse(plan.refusal, `bill ${billKey}: ${plan.refusal}`);
      const lines = (bill['lines'] as BillLineInput[] | undefined) ?? [];
      for (const { index, patch } of plan.linePatches) {
        if (patch.costCenterKey !== undefined && !checked.has(`cc:${index}:${patch.costCenterKey}`)) throw refuse('state-changed', `bill ${billKey} changed while it was edited`);
        if (patch.projectKey !== undefined && !checked.has(`pk:${index}:${patch.projectKey}`)) throw refuse('state-changed', `bill ${billKey} changed while it was edited`);
      }

      assertProjectsOnProfitAndLoss(ccCtx.accounts, plan.linePatches.filter((p) => !!p.patch.projectKey).map((p) => ({ accountKey: lines[p.index].accountKey, projectKey: p.patch.projectKey })));
      if (plan.touchesLedger && booking) {
        const periodKey = String(booking['periodKey'] ?? '') || periodKeyFor(accountingTenantId, String(booking['date'] ?? ''), fiscalYearStart);
        await assertPeriodsOpen(db, [periodKey], tx);
      }
      const lineRefs = plan.touchesLedger
        ? plan.linePatches.map(({ index }) => db.collection(BOOKING_LINE_COLLECTION).doc(`${bookingKey}-${index}`))
        : [];
      const lineSnaps = await Promise.all(lineRefs.map((r) => tx.get(r)));
      lineSnaps.forEach((s, i) => {
        if (!s.exists) throw refuse('inconsistent-state', `booking line ${lineRefs[i].id} is missing for bill ${billKey}`);
      });

      // writes
      const changed = Object.keys(plan.billPatch).length > 0;
      if (changed) tx.update(billRef, withoutUndefined(plan.billPatch));
      if (plan.touchesLedger) {
        if (plan.bookingPatch) tx.update(bookingRef, plan.bookingPatch);
        plan.linePatches.forEach(({ index, patch }, i) => {
          const update: Record<string, unknown> = {};
          if (patch.title !== undefined) update['description'] = patch.title ? patch.title : FieldValue.delete();
          if (patch.costCenterKey !== undefined) {
            const key = costCenterKeyForLine(ccCtx, lines[index].accountKey, { explicit: patch.costCenterKey });
            update['costCenterKey'] = key ? key : FieldValue.delete();
          }
          if (patch.projectKey !== undefined) {
            update['projectKey'] = projectKeyForLine(ccCtx.accounts, { accountKey: lines[index].accountKey, projectKey: patch.projectKey });
          }
          if (Object.keys(update).length > 0) tx.update(lineRefs[i], update);
        });
      }
      return { billKey, changed };
    });
    if (result.changed) {
      await writeFinanceHistory(db, { tenantId, uid: request.auth?.uid, parentKey: `bill.${billKey}`, kind: 'billDetailsUpdated' });
    }
    logger.info(`${CF_NAME}: ${billKey} changed=${result.changed} (tenant=${tenantId})`);
    return result;
  },
);
