import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { AvatarInfo, BillCollection, OcrResultCollection } from '@okr/shared-models';
import { generateRandomString } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';

import { refuse } from '../invoice/invoice-context';
import { billTotal, cleanBillLines, draftWriteRefusal } from './bill.logic';
import { loadBillConfig } from './bill-context';
import { writeDraftBillTx } from './bill-draft';
import { attachBillScan, billScanRefusal } from './bill-voucher';
import { chfText, writeFinanceHistory } from '../finance-history/finance-history';

const REGION = 'europe-west6';
const CF_NAME = 'writeBill';
const STORE_DATE = /^\d{8}$/;

type WriteMode = 'create' | 'update' | 'delete';

interface BillHeaderInput {
  billId?: string;
  title?: string;
  billDate?: string;
  dueDate?: string;
  vendor?: AvatarInfo | null;
  notes?: string;
  paymentReference?: string;
  creditorIban?: string;
}

interface WriteBillData {
  mode: WriteMode;
  billKey?: string;
  accountingTenantId?: string;   // create only
  bill?: BillHeaderInput;
  lines?: unknown;
  ocrResultKey?: string;         // create only: the uploaded bill scan to keep as voucher
}

function checkStoreDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || (value !== '' && !STORE_DATE.test(value))) {
    throw new HttpsError('invalid-argument', `${field} must be empty or a yyyymmdd date`);
  }
  return value;
}

function cleanVendor(v: unknown): AvatarInfo | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'object') throw new HttpsError('invalid-argument', 'vendor must be an object');
  const o = v as Record<string, unknown>;
  const s = (x: unknown): string => (x === undefined || x === null ? '' : String(x));
  return {
    key: s(o['key']), name1: s(o['name1']), name2: s(o['name2']),
    modelType: s(o['modelType']) as AvatarInfo['modelType'],
    type: s(o['type']), subType: s(o['subType']), label: s(o['label']),
  };
}

/**
 * Create / update / delete a DRAFT bill with its lines (spec 1.85 phase 3).
 *
 * `bills` is CF-write-only (firestore.rules), so this is the only client path that writes a bill. A
 * draft may be incomplete (no lines, empty account); completeness is checked when it is booked
 * (`bookBill`). The total is always Σ lines. A booked bill is not written here: its booking is deleted
 * in the journal first, which returns it to `draft`.
 */
export const writeBill = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<WriteBillData>): Promise<{ billKey: string }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, ['treasurer']);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);

    const d = request.data;
    const mode = d?.mode;
    if (mode !== 'create' && mode !== 'update' && mode !== 'delete') {
      throw new HttpsError('invalid-argument', 'mode (create|update|delete) is required');
    }
    if (mode !== 'create' && !d.billKey) throw new HttpsError('invalid-argument', 'billKey is required for update and delete');
    // update replaces all lines, so a missing array would silently delete them — refuse it instead
    if (mode === 'update' && d.lines === undefined) throw new HttpsError('invalid-argument', 'lines are required for update');
    const lines = mode === 'delete' ? [] : cleanBillLines(d.lines);
    const h = d.bill ?? {};
    const billDate = h.billDate !== undefined ? checkStoreDate(h.billDate, 'billDate') : undefined;
    const dueDate = h.dueDate !== undefined ? checkStoreDate(h.dueDate, 'dueDate') : undefined;
    if (h.notes !== undefined && typeof h.notes !== 'string') throw new HttpsError('invalid-argument', 'notes must be a string');

    const db = getFirestore();
    const billKey = mode === 'create' ? generateRandomString(20) : (d.billKey as string);
    const billRef = db.collection(BillCollection).doc(billKey);

    // the books: from the request on create, from the stored bill otherwise
    let accountingTenantId = mode === 'create' ? String(d.accountingTenantId ?? '') : '';
    if (mode !== 'create') {
      const stored = (await billRef.get()).data();
      if (stored && !((stored['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
        throw new HttpsError('permission-denied', 'bill belongs to another tenant');
      }
      accountingTenantId = String(stored?.['accountingTenantId'] ?? '');
    }
    if (mode === 'create' && !accountingTenantId) throw new HttpsError('invalid-argument', 'accountingTenantId is required');
    if (accountingTenantId) await loadBillConfig(db, tenantId, billKey, accountingTenantId);

    const ocrResultKey = mode === 'create' && typeof d.ocrResultKey === 'string' ? d.ocrResultKey : '';
    if (ocrResultKey) {
      const reason = billScanRefusal((await db.collection(OcrResultCollection).doc(ocrResultKey).get()).data(), tenantId);
      if (reason) throw refuse(reason, `bill scan ${ocrResultKey}: ${reason}`);
    }

    await db.runTransaction(async (tx) => {
      const existing = mode === 'create' ? undefined : (await tx.get(billRef)).data();
      if (existing && !((existing['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
        throw new HttpsError('permission-denied', 'bill belongs to another tenant');
      }
      const reason = draftWriteRefusal(existing as { state?: string; bookingKeys?: string[]; trainerInvoiceKey?: string } | undefined, mode);
      if (reason) throw refuse(reason, `bill ${billKey}: ${reason}`);

      if (mode === 'delete') {
        tx.delete(billRef);
        return;
      }
      writeDraftBillTx(tx, db, {
        billKey, tenantId, accountingTenantId, lines,
        header: {
          billId: h.billId, title: h.title, billDate, dueDate, notes: h.notes,
          paymentReference: h.paymentReference, creditorIban: h.creditorIban,
          vendor: h.vendor === undefined ? undefined : (cleanVendor(h.vendor) ?? null),
        },
      }, existing);
    });

    if (mode === 'create') {
      await writeFinanceHistory(db, { tenantId, uid: request.auth?.uid, parentKey: `bill.${billKey}`, kind: 'billCreated', details: chfText(billTotal(lines)) });
    }
    if (ocrResultKey) {
      // Q6: a failed copy never fails the save - the bill stays without a voucher and the treasurer re-uploads.
      await attachBillScan(db, tenantId, accountingTenantId, billKey, ocrResultKey)
        .catch((e) => logger.error(`${CF_NAME}: attaching scan ${ocrResultKey} to ${billKey} failed`, e));
    }
    logger.info(`${CF_NAME}: ${mode} draft ${billKey} (${lines.length} line(s)) for tenant ${tenantId}`);
    return { billKey };
  },
);
