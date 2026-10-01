import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { InvoiceCollection, InvoiceModel, InvoicePositionCollection, InvoicePositionModel } from '@okr/shared-models';
import { getInvoiceIndex } from '@okr/finance-invoice-util';
import { generateRandomString, removeKeyFromOkrModel } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';

import { isBexioBackend } from '../bexio/backend-gate';
import { draftWriteRefusal, PositionInput, totalRappen } from './invoice.logic';

const REGION = 'europe-west6';
const CF_NAME = 'writeInvoice';
const ACCOUNTING_CONFIG_COLLECTION = 'accounting-configs';
const MAX_TITLE_LENGTH = 200;

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

    const positions = d.positions ?? [];
    if (mode !== 'delete') {
      if (!Array.isArray(positions)) throw new HttpsError('invalid-argument', 'positions must be an array');
      if (positions.some((p) => !p || typeof p.amount !== 'number' || !Number.isFinite(p.amount))) {
        throw new HttpsError('invalid-argument', 'every position needs a finite numeric amount');
      }
    }

    const db = getFirestore();
    const invoiceKey = mode === 'create' ? generateRandomString(20) : (d.invoiceKey as string);
    const invoiceRef = db.collection(InvoiceCollection).doc(invoiceKey);

    let existing: Record<string, unknown> | undefined;
    if (mode !== 'create') {
      const snap = await invoiceRef.get();
      existing = snap.data();
      if (existing && !((existing['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
        throw new HttpsError('permission-denied', 'invoice belongs to another tenant');
      }
    }
    const reason = draftWriteRefusal(existing ? String(existing['state']) : undefined, mode);
    if (reason) throw refuse(reason, `invoice ${invoiceKey}: ${reason}`);

    const accountingTenantId = mode === 'create' ? d.accountingTenantId : (existing?.['accountingTenantId'] as string);
    if (mode !== 'delete') {
      if (!accountingTenantId) throw new HttpsError('invalid-argument', 'accountingTenantId is required');
      const configSnap = await db.collection(ACCOUNTING_CONFIG_COLLECTION).doc(accountingTenantId).get();
      if (!configSnap.exists) throw refuse('no-accounting-config', `no accounting config for ${accountingTenantId}`);
      if (isBexioBackend(configSnap.data())) {
        throw refuse('bexio-backend', `${accountingTenantId} is booked in bexio — invoices are not written here`);
      }
    }

    const oldPositions = (await db.collection(InvoicePositionCollection).where('invoiceKey', '==', invoiceKey).get()).docs;
    const batch = db.batch();
    for (const p of oldPositions) batch.delete(p.ref);

    if (mode === 'delete') {
      batch.delete(invoiceRef);
    } else {
      const h = d.invoice ?? {};
      const invoice = new InvoiceModel(tenantId);
      if (existing) Object.assign(invoice, existing);
      invoice.tenants = (existing?.['tenants'] as string[] | undefined) ?? [tenantId];
      invoice.accountingTenantId = accountingTenantId as string;
      if (h.title !== undefined) invoice.title = String(h.title).slice(0, MAX_TITLE_LENGTH);
      if (h.invoiceDate !== undefined) invoice.invoiceDate = h.invoiceDate;
      if (h.dueDate !== undefined) invoice.dueDate = h.dueDate;
      if (h.receiver !== undefined) invoice.receiver = h.receiver;
      if (h.notes !== undefined) invoice.notes = h.notes;
      invoice.state = 'draft';
      invoice.invoiceNo = 0;
      invoice.invoiceId = '';
      invoice.totalAmount = { amount: totalRappen(positions), currency: 'CHF', periodicity: 'one-time' };
      invoice.index = getInvoiceIndex(invoice);
      batch.set(invoiceRef, removeKeyFromOkrModel(invoice));

      for (const p of positions) {
        const position = new InvoicePositionModel(tenantId);
        position.tenants = invoice.tenants;
        position.invoiceKey = invoiceKey;
        position.name = p.name ?? '';
        position.description = p.description ?? '';
        position.amount = p.amount;
        position.currency = 'CHF';
        position.accountKey = p.accountKey ?? '';
        position.isBillable = true;
        batch.set(db.collection(InvoicePositionCollection).doc(generateRandomString(20)), removeKeyFromOkrModel(position));
      }
    }

    await batch.commit();
    logger.info(`${CF_NAME}: ${mode} draft ${invoiceKey} (${positions.length} position(s)) for tenant ${tenantId}`);
    return { invoiceKey };
  },
);
