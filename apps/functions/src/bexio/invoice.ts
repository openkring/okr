import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';
import * as admin from 'firebase-admin';
import { convertDateFormatToString, addDuration, getTodayStr, DateFormat } from '@bk2/shared-util-core';

import { bexioApiKey, bexioTenantId, bexioDefaultTaxId, BEXIO_BASE, toStoreDate } from './shared';

interface BexioInvoice {
  id: number;
  document_nr: string;
  title: string | null;
  contact_id: number | null;
  contact_sub_id: number | null;
  user_id: number | null;
  header: string | null;
  footer: string | null;
  total_gross: string;
  total_net: string;
  total_taxes: string;
  total: string;
  mwst_type: number;
  mwst_is_net: boolean;
  is_valid_from: string | null;  // "YYYY-MM-DD"
  is_valid_to: string | null;    // "YYYY-MM-DD"
  kb_item_status_id: number;
  network_link: string | null;
  updated_at: string;            // "YYYY-MM-DD HH:mm:ss"
}

/** Map kb_item_status_id to a human-readable state string. */
function mapInvoiceStatus(statusId: number): string {
  switch (statusId) {
    case 7: return 'draft';
    case 8: return 'pending';
    case 9: return 'paid';
    case 19: return 'cancelled';
    default: return String(statusId);
  }
}

function mapVatType(mwst_type: number): string {
  switch (mwst_type) {
    case 0: return 'included';
    case 1: return 'excluded';
    case 2: return 'exempt';
  }
  return '';
}

/** Fetch paginated invoices from Bexio, optionally filtered by updatedAfter ("YYYY-MM-DD HH:mm:ss"). */
async function fetchBexioInvoices(apiKey: string, updatedAfter: string): Promise<BexioInvoice[]> {
  const PAGE_SIZE = 500;
  const all: BexioInvoice[] = [];
  let offset = 0;
  while (true) {
    const response = await axios.post<BexioInvoice[]>(
      `${BEXIO_BASE}/kb_invoice/search`,
      [{ field: 'updated_at', value: updatedAfter, criteria: '>' }],
      {
        params: { limit: PAGE_SIZE, offset, order_by: 'updated_at' },
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      }
    );
    const page = Array.isArray(response.data) ? response.data : [];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

/** Write invoices to Firestore and update the sync pointer. */
async function persistInvoices(invoices: BexioInvoice[], tenantId: string, nowStr: string): Promise<void> {
  const db = admin.firestore();
  const batch = db.batch();

  for (const inv of invoices) {
    const bkey = String(inv.id);
    const totalCents = Math.round(parseFloat(inv.total) * 100);
    const doc: Record<string, unknown> = {
      tenants: [tenantId],
      isArchived: false,
      index: '',
      tags: [],
      notes: inv.contact_id != null ? String(inv.contact_id) : '',
      title: inv.title ?? inv.document_nr,
      invoiceId: inv.document_nr,
      invoiceDate: toStoreDate(inv.is_valid_from),
      dueDate: toStoreDate(inv.is_valid_to),
      totalAmount: { amount: totalCents, currency: 'CHF', periodicity: 'one-time' },
      taxes: parseFloat(inv.total_taxes) || 0,
      vatType: mapVatType(inv.mwst_type),
      state: mapInvoiceStatus(inv.kb_item_status_id),
      paymentDate: ''
    };
    batch.set(db.collection('invoices').doc(bkey), doc, { merge: true });
  }

  // update sync pointer
  batch.set(db.collection('config').doc('bexioSync'), { lastSyncedAt: nowStr }, { merge: true });

  await batch.commit();
}

/** Core sync logic shared by manual and scheduled triggers. */
async function runInvoiceSync(fromDate: string, tenantId: string, label: string): Promise<{ count: number }> {
  logger.info(`${label}: fetching invoices updated after "${fromDate}"`);
  const invoices = await fetchBexioInvoices(bexioApiKey.value(), fromDate);
  logger.info(`${label}: fetched ${invoices.length} invoices`);

  const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19); // "YYYY-MM-DD HH:mm:ss"
  await persistInvoices(invoices, tenantId, nowStr);
  logger.info(`${label}: persisted ${invoices.length} invoices, pointer updated to ${nowStr}`);
  return { count: invoices.length };
}

/**
 * Fetch the PDF for a single invoice from Bexio.
 * Returns the PDF as a base64-encoded string in the `content` field.
 * Input: { invoiceId: string } — the Bexio invoice ID (= invoice.bkey in Firestore)
 */
export const showInvoicePdf = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [bexioApiKey],
  },
  async (request: CallableRequest<{ invoiceId: string }>) => {
    const CF_NAME = 'showInvoicePdf';

    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const { invoiceId } = request.data;
    if (!invoiceId) throw new HttpsError('invalid-argument', 'invoiceId is required');

    logger.info(`${CF_NAME}: fetching PDF for invoice ${invoiceId}`);

    try {
      const response = await axios.get<{ content: string }>(
        `${BEXIO_BASE}/kb_invoice/${invoiceId}/pdf`,
        {
          headers: {
            'Authorization': `Bearer ${bexioApiKey.value()}`,
            'Accept': 'application/json',
          },
        }
      );
      const content = response.data.content;
      logger.info(`${CF_NAME}: fetched PDF for invoice ${invoiceId}, ${content?.length ?? 0} base64 chars`);
      return { content };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const body = JSON.stringify(error.response?.data);
        logger.error(`${CF_NAME}: Bexio API error ${status}: ${body}`);
        throw new HttpsError('internal', `Bexio API error ${status}: ${body}`);
      }
      logger.error(`${CF_NAME}: unexpected error`, error);
      throw new HttpsError('internal', 'Bexio PDF fetch failed');
    }
  }
);

/**
 * Manual one-shot invoice sync (onCall).
 * Pass { fromDate: "YYYY-MM-DD HH:mm:ss" } to start from a specific date,
 * or omit fromDate to download the full history.
 */
export const syncBexioInvoices = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [bexioApiKey, bexioTenantId],
  },
  async (request: CallableRequest<{ fromDate?: string }>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const fromDate = request.data?.fromDate ?? '2000-01-01 00:00:00';
    return runInvoiceSync(fromDate, bexioTenantId.value(), 'syncBexioInvoices');
  }
);

export interface InvoicePositionInput {
  text: string;
  unit_price: string;
  account_id: number;
  amount?: string;
}

interface BexioKbPosition {
  type: 'KbPositionCustom';
  amount: string;
  unit_price: string;
  account_id: number;
  tax_id: number;
  text: string;
  discount_in_percent: string;
}

/**
 * Create a new invoice in Bexio (POST /2.0/kb_invoice).
 * Returns the newly assigned Bexio invoice ID.
 */
export const createBexioInvoice = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [bexioApiKey, bexioDefaultTaxId],
  },
  async (request: CallableRequest<{
    title: string;
    bexioId: string;
    header?: string;
    footer?: string;
    validFrom?: string;
    validTo?: string;
    positions?: InvoicePositionInput[];
    template_slug?: string;
  }>) => {
    const CF_NAME = 'createBexioInvoice';

    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { title, bexioId, header = '', footer = '', positions = [], template_slug = '' } = request.data;

    if (!title) throw new HttpsError('invalid-argument', 'title is required');
    if (!bexioId) throw new HttpsError('invalid-argument', 'bexioId is required');

    const resolvedFrom = request.data.validFrom || getTodayStr();
    const resolvedTo = request.data.validTo || addDuration(resolvedFrom, { days: 30 });
    const isoFrom = convertDateFormatToString(resolvedFrom, DateFormat.StoreDate, DateFormat.IsoDate);
    const isoTo = convertDateFormatToString(resolvedTo, DateFormat.StoreDate, DateFormat.IsoDate);

    const defaultTaxId = parseInt(bexioDefaultTaxId.value(), 10);
    const bexioPositions: BexioKbPosition[] = positions.map(p => ({
      type: 'KbPositionCustom',
      amount: String(p.amount ?? 1),
      unit_price: String(p.unit_price),
      account_id: p.account_id,
      tax_id: defaultTaxId,
      text: p.text,
      discount_in_percent: '0',
    }));
    logger.info(`${CF_NAME}: positions: ${JSON.stringify(bexioPositions)}`);

    logger.info(`${CF_NAME}: creating invoice "${title}" for contact ${bexioId}`);

    try {
      const response = await axios.post<{ id: number }>(
        `${BEXIO_BASE}/kb_invoice`,
        {
          title,
          contact_id: parseInt(bexioId, 10),
          user_id: 1,
          header,
          footer,
          is_valid_from: isoFrom,
          is_valid_to: isoTo,
          mwst_type: 2,
          mwst_is_net: false,
          show_position_taxes: false,
          language_id: 1,
          bank_account_id: 1,
          currency_id: 1,
          payment_type_id: 4,
          template_slug,
          positions: bexioPositions,
        },
        {
          headers: {
            'Authorization': `Bearer ${bexioApiKey.value()}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(`${CF_NAME}: created invoice with id ${response.data.id}`);
      return { id: String(response.data.id) };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const body = JSON.stringify(error.response?.data);
        logger.error(`${CF_NAME}: Bexio API error ${status}: ${body}`);
        throw new HttpsError('internal', `Bexio API error ${status}: ${body}`);
      }
      logger.error(`${CF_NAME}: unexpected error`, error);
      throw new HttpsError('internal', 'Bexio invoice creation failed');
    }
  }
);

/**
 * Scheduled daily invoice sync at 06:00 Europe/Zurich.
 * Reads the last sync pointer from config/bexioSync.lastSyncedAt and fetches only new/updated invoices.
 */
export const scheduledBexioInvoiceSync = onSchedule(
  {
    schedule: '0 6 * * *',
    timeZone: 'Europe/Zurich',
    region: 'europe-west6',
    secrets: [bexioApiKey, bexioTenantId],
  },
  async () => {
    const db = admin.firestore();
    const configDoc = await db.collection('config').doc('bexioSync').get();
    const fromDate: string = configDoc.data()?.lastSyncedAt ?? '2000-01-01 00:00:00';
    await runInvoiceSync(fromDate, bexioTenantId.value(), 'scheduledBexioInvoiceSync');
  }
);
