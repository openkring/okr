import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { AvatarInfo, InvoiceCollection, InvoiceModel, InvoicePositionCollection, InvoicePositionModel } from '@okr/shared-models';
import { getInvoiceIndex } from '@okr/finance-invoice-util';
import { generateRandomString, removeKeyFromOkrModel } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, checkRoles, getCallerTenantId } from '@okr/shared-util-functions';

import { isBexioBackend } from '../bexio/backend-gate';
import { draftWriteRefusal, PositionInput, totalRappen, withoutUndefined } from './invoice.logic';

const REGION = 'europe-west6';
const CF_NAME = 'writeInvoice';
const ACCOUNTING_CONFIG_COLLECTION = 'accounting-configs';
const MAX_TITLE_LENGTH = 200;
const MAX_POSITIONS = 100;
const MAX_NOTES_LENGTH = 2000;
const MAX_POSITION_NAME_LENGTH = 200;
const MAX_POSITION_DESCRIPTION_LENGTH = 500;
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

function cleanReceiver(r: unknown): InvoiceModel['receiver'] {
  if (r === undefined || r === null) return undefined;
  if (typeof r !== 'object') throw new HttpsError('invalid-argument', 'receiver must be an object');
  const o = r as Record<string, unknown>;
  const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));
  return {
    key: str(o['key']), name1: str(o['name1']), name2: str(o['name2']),
    modelType: str(o['modelType']) as AvatarInfo['modelType'],
    type: str(o['type']), subType: str(o['subType']), label: str(o['label']),
  };
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
      if (mode !== 'delete') {
        if (!accountingTenantId) throw new HttpsError('invalid-argument', 'accountingTenantId is required');
        const configSnap = await tx.get(db.collection(ACCOUNTING_CONFIG_COLLECTION).doc(accountingTenantId));
        if (!configSnap.exists) throw refuse('no-accounting-config', `no accounting config for ${accountingTenantId}`);
        const config = configSnap.data();
        if (!((config?.['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
          throw refuse('foreign-accounting-tenant', `${accountingTenantId} does not belong to this tenant`);
        }
        if (isBexioBackend(config)) {
          throw refuse('bexio-backend', `${accountingTenantId} is booked in bexio — invoices are not written here`);
        }
      }
      const oldPositions = mode === 'create'
        ? []
        : (await tx.get(db.collection(InvoicePositionCollection).where('invoiceKey', '==', invoiceKey))).docs;

      // ---- writes ----
      for (const p of oldPositions) tx.delete(p.ref);

      if (mode === 'delete') {
        tx.delete(invoiceRef);
        return;
      }
      const invoice = new InvoiceModel(tenantId);
      if (existing) Object.assign(invoice, existing);
      invoice.tenants = (existing?.['tenants'] as string[] | undefined) ?? [tenantId];
      invoice.accountingTenantId = accountingTenantId as string;
      if (h.title !== undefined) invoice.title = String(h.title).slice(0, MAX_TITLE_LENGTH);
      if (invoiceDate !== undefined) invoice.invoiceDate = invoiceDate;
      if (dueDate !== undefined) invoice.dueDate = dueDate;
      if (h.receiver !== undefined) invoice.receiver = receiver;
      if (h.notes !== undefined) invoice.notes = h.notes.slice(0, MAX_NOTES_LENGTH);
      invoice.state = 'draft';
      invoice.invoiceNo = 0;
      invoice.invoiceId = '';
      invoice.totalAmount = { amount: totalRappen(positions), currency: 'CHF', periodicity: 'one-time' };
      invoice.index = getInvoiceIndex(invoice);
      tx.set(invoiceRef, withoutUndefined(removeKeyFromOkrModel(invoice)));

      for (const p of positions) {
        const position = new InvoicePositionModel(tenantId);
        position.tenants = invoice.tenants;
        position.invoiceKey = invoiceKey;
        position.name = String(p.name ?? '').slice(0, MAX_POSITION_NAME_LENGTH);
        position.description = String(p.description ?? '').slice(0, MAX_POSITION_DESCRIPTION_LENGTH);
        position.amount = p.amount;
        position.currency = 'CHF';
        position.accountKey = String(p.accountKey ?? '');
        position.isBillable = true;
        tx.set(db.collection(InvoicePositionCollection).doc(generateRandomString(20)), withoutUndefined(removeKeyFromOkrModel(position)));
      }
    });

    logger.info(`${CF_NAME}: ${mode} draft ${invoiceKey} (${positions.length} position(s)) for tenant ${tenantId}`);
    return { invoiceKey };
  },
);
