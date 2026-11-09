import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { InvoiceCollection, InvoiceModel, InvoicePositionCollection } from '@okr/shared-models';
import { generateRandomString, isRebatePosition } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';

import { assertDraftBooks, cleanReceiver, DraftHeader, writeDraft } from './invoice-issue.core';
import { draftWriteRefusal, PositionInput } from './invoice.logic';

const REGION = 'europe-west6';
const CF_NAME = 'writeInvoice';
const MAX_POSITIONS = 100;
const STORE_DATE = /^\d{8}$/;

type WriteMode = 'create' | 'update' | 'delete';

interface InvoiceHeaderInput {
  title?: string;
  invoiceDate?: string;
  dueDate?: string;
  receiver?: InvoiceModel['receiver'];
  notes?: string;
}

interface WriteInvoiceData {
  mode: WriteMode;
  invoiceKey?: string;
  accountingTenantId?: string;   // create only
  invoice?: InvoiceHeaderInput;
  positions?: PositionInput[];
}

function checkStoreDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || (value !== '' && !STORE_DATE.test(value))) {
    throw new HttpsError('invalid-argument', `${field} must be empty or a yyyymmdd date`);
  }
  return value;
}

function refuse(reason: string, message: string): HttpsError {
  return new HttpsError('failed-precondition', message, { reason });
}

/**
 * Create / update / delete a DRAFT invoice with its positions (spec 1.76, phase 1).
 *
 * `invoices` and `invoice-positions` are CF-write-only (firestore.rules), so this is the only write
 * path. Drafts may be incomplete (no positions, empty account) but never malformed; completeness is
 * checked when the invoice is issued. Refusals carry `details.reason` for the client.
 */
export const writeInvoice = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<WriteInvoiceData>): Promise<{ invoiceKey: string }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    await checkRoles(request as never, CF_NAME, ['treasurer']);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);

    const d = request.data;
    const mode = d?.mode;
    if (mode !== 'create' && mode !== 'update' && mode !== 'delete') {
      throw new HttpsError('invalid-argument', 'mode (create|update|delete) is required');
    }
    if (mode !== 'create' && !d.invoiceKey) {
      throw new HttpsError('invalid-argument', 'invoiceKey is required for update and delete');
    }

    // create may omit positions (an empty draft); update replaces them all, so a missing array there
    // would silently delete every stored position — refuse it instead.
    if (mode === 'update' && d.positions === undefined) {
      throw new HttpsError('invalid-argument', 'positions are required for update');
    }
    const positions = d.positions ?? [];
    if (mode !== 'delete') {
      if (!Array.isArray(positions)) throw new HttpsError('invalid-argument', 'positions must be an array');
      if (positions.length > MAX_POSITIONS) throw new HttpsError('invalid-argument', 'too-many-positions');
      if (positions.some((p) => !p || typeof p.amount !== 'number' || !Number.isFinite(p.amount))) {
        throw new HttpsError('invalid-argument', 'every position needs a finite numeric amount');
      }
      // a discount lowers the total; a draft may still hold 0 while the treasurer fills it in
      if (positions.some((p) => isRebatePosition(p) && p.amount > 0)) {
        throw new HttpsError('invalid-argument', 'a discount must not be positive');
      }
    }
    const h = d.invoice ?? {};
    const invoiceDate = h.invoiceDate !== undefined ? checkStoreDate(h.invoiceDate, 'invoiceDate') : undefined;
    const dueDate = h.dueDate !== undefined ? checkStoreDate(h.dueDate, 'dueDate') : undefined;
    if (h.notes !== undefined && typeof h.notes !== 'string') throw new HttpsError('invalid-argument', 'notes must be a string');
    const receiver = h.receiver !== undefined ? cleanReceiver(h.receiver) : undefined;

    const db = getFirestore();
    const invoiceKey = mode === 'create' ? generateRandomString(20) : (d.invoiceKey as string);
    const invoiceRef = db.collection(InvoiceCollection).doc(invoiceKey);

    await db.runTransaction(async (tx) => {
      // ---- reads (all before any write) ----
      let existing: Record<string, unknown> | undefined;
      if (mode !== 'create') {
        existing = (await tx.get(invoiceRef)).data();
        if (existing && !((existing['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
          throw new HttpsError('permission-denied', 'invoice belongs to another tenant');
        }
      }
      const reason = draftWriteRefusal(existing ? String(existing['state']) : undefined, mode);
      if (reason) throw refuse(reason, `invoice ${invoiceKey}: ${reason}`);

      const accountingTenantId = mode === 'create' ? d.accountingTenantId : (existing?.['accountingTenantId'] as string);
      if (mode !== 'delete') await assertDraftBooks(db, tx, tenantId, accountingTenantId);
      const oldPositions = mode === 'create'
        ? []
        : (await tx.get(db.collection(InvoicePositionCollection).where('invoiceKey', '==', invoiceKey))).docs;

      // ---- writes ----
      for (const p of oldPositions) tx.delete(p.ref);

      if (mode === 'delete') {
        tx.delete(invoiceRef);
        return;
      }
      const header: DraftHeader = {
        ...(h.title !== undefined ? { title: h.title } : {}),
        ...(invoiceDate !== undefined ? { invoiceDate } : {}),
        ...(dueDate !== undefined ? { dueDate } : {}),
        ...(h.receiver !== undefined ? { receiver } : {}),
        ...(h.notes !== undefined ? { notes: h.notes } : {}),
      };
      writeDraft(db, tx, { tenantId, invoiceKey, existing, accountingTenantId: accountingTenantId as string, header, positions });
    });

    logger.info(`${CF_NAME}: ${mode} draft ${invoiceKey} (${positions.length} position(s)) for tenant ${tenantId}`);
    return { invoiceKey };
  },
);
