import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';
import * as admin from 'firebase-admin';
import { convertDateFormatToString, addDuration, getTodayStr, DateFormat } from '@bk2/shared-util-core';

const bexioApiKey = defineSecret('BEXIO_APIKEY');
const bexioUserId = defineSecret('BEXIO_USER_ID'); // integer user ID from GET /2.0/users/me
const bexioTenantId = defineSecret('BEXIO_TENANT_ID'); // Firestore tenantId for invoice writes

const BEXIO_BASE = 'https://api.bexio.com/2.0';

export interface BexioContact {
  id: number;
  name_1: string;          // last name or company name
  name_2: string | null;   // first name (null for companies)
  street_name: string;
  house_number: string;
  postcode: string;
  city: string;
  mail: string;
  contact_type_id: number; // 1=company, 2=person
}

/**
 * Create a new contact in the Bexio API.
 * Returns the newly assigned Bexio contact ID.
 */
export const createBexioContact = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [bexioApiKey, bexioUserId],
  },
  async (request: CallableRequest<{ name_1: string; name_2: string | null; street_name: string, house_number: string, postcode: string, city: string, mail: string, contact_type_id: number }>) => {
    const CF_NAME = 'createBexioContact';

    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { name_1, name_2, street_name, house_number, postcode, city, mail, contact_type_id } = request.data;
    if (!name_1) {
      throw new HttpsError('invalid-argument', 'name_1 is required');
    }

    const userId = parseInt(bexioUserId.value(), 10);
    logger.info(`${CF_NAME}: creating contact "${name_1}" by bexio user ${userId}`);

    try {
      const response = await axios.post<BexioContact>(
        `${BEXIO_BASE}/contact`,
        { name_1, name_2, street_name, house_number, postcode, city, mail, contact_type_id, user_id: userId, owner_id: userId },
        {
          headers: {
            'Authorization': `Bearer ${bexioApiKey.value()}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(`${CF_NAME}: created contact with id ${response.data.id}`);
      return { id: String(response.data.id) };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const body = JSON.stringify(error.response?.data);
        logger.error(`${CF_NAME}: Bexio API error ${status}: ${body}`);
        throw new HttpsError('internal', `Bexio API error ${status}: ${body}`);
      }
      logger.error(`${CF_NAME}: unexpected error`, error);
      throw new HttpsError('internal', 'Bexio contact creation failed');
    }
  }
);

/**
 * Update an existing contact in the Bexio API.
 */
export const updateBexioContact = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [bexioApiKey, bexioUserId],
  },
  async (request: CallableRequest<{ id: string; name_1: string; name_2: string | null; street_name: string, house_number: string, postcode: string, city: string, mail: string, contact_type_id: number }>) => {
    const CF_NAME = 'updateBexioContact';

    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { id, name_1, name_2, street_name, house_number, postcode, city, mail, contact_type_id } = request.data;
    if (!id || !name_1) {
      throw new HttpsError('invalid-argument', 'id and name_1 are required');
    }

    const userId = parseInt(bexioUserId.value(), 10);
    logger.info(`${CF_NAME}: updating contact ${id} "${name_1}"`);

    try {
      await axios.post<BexioContact>(
        `${BEXIO_BASE}/contact/${id}`,
        { name_1, name_2, street_name, house_number, postcode, city, mail, contact_type_id, user_id: userId, owner_id: userId },
        {
          headers: {
            'Authorization': `Bearer ${bexioApiKey.value()}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(`${CF_NAME}: updated contact ${id}`);
      return { id: String(id) };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const body = JSON.stringify(error.response?.data);
        logger.error(`${CF_NAME}: Bexio API error ${status}: ${body}`);
        throw new HttpsError('internal', `Bexio API error ${status}: ${body}`);
      }
      logger.error(`${CF_NAME}: unexpected error`, error);
      throw new HttpsError('internal', 'Bexio contact update failed');
    }
  }
);

/**
 * Fetch all contacts from the Bexio API using pagination.
 * The API key is stored securely as a GCP secret (BEXIO_APIKEY).
 */
export const getBexioContacts = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [bexioApiKey],
  },
  async (request: CallableRequest) => {
    const CF_NAME = 'getBexioContacts';

    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    logger.info(`${CF_NAME}: fetching all contacts (paginated)`);

    const PAGE_SIZE = 500;
    const allContacts: BexioContact[] = [];

    try {
      let offset = 0;
      while (true) {
        const response = await axios.get<BexioContact[]>(`${BEXIO_BASE}/contact`, {
          params: { limit: PAGE_SIZE, offset },
          headers: {
            'Authorization': `Bearer ${bexioApiKey.value()}`,
            'Accept': 'application/json',
          },
        });

        const page = Array.isArray(response.data) ? response.data : [];
        allContacts.push(...page);
        logger.info(`${CF_NAME}: fetched page offset=${offset}, got ${page.length} contacts`);

        if (page.length < PAGE_SIZE) break; // last page
        offset += PAGE_SIZE;
      }

      logger.info(`${CF_NAME}: total ${allContacts.length} contacts`);

      return allContacts.map(c => ({
        id: c.id,
        name_1: c.name_1,
        name_2: c.name_2,
        street_name: c.street_name,
        house_number: c.house_number,
        postcode: c.postcode,
        city: c.city,
        mail: c.mail,
        contact_type_id: c.contact_type_id
      }));
    } catch (error: unknown) {
      logger.error(`${CF_NAME}: error`, error);
      throw new HttpsError('internal', 'Bexio API request failed');
    }
  }
);

// --------------------------------- Invoice sync ---------------------------------

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

/** Convert Bexio date "YYYY-MM-DD" to StoreDate "YYYYMMDD". Returns '' for null/empty. */
function toStoreDate(bexioDate: string | null | undefined): string {
  if (!bexioDate) return '';
  return bexioDate.replace(/-/g, '');
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

// --------------------------------- Invoice create ---------------------------------

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
  tax_id: null;
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
    secrets: [bexioApiKey],
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

    const bexioPositions: BexioKbPosition[] = positions.map(p => ({
      type: 'KbPositionCustom',
      amount: p.amount ?? '1',
      unit_price: p.unit_price,
      account_id: p.account_id,
      tax_id: null,
      text: p.text,
      discount_in_percent: '0',
    }));

    logger.info(`${CF_NAME}: creating invoice "${title}" for contact ${bexioId}`);

    try {
      const response = await axios.post<{ id: number }>(
        `${BEXIO_BASE}/kb_invoice`,
        {
          title,
          contact_id: parseInt(bexioId, 10),
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

// --------------------------------- Bill sync ---------------------------------

const BEXIO_BASE_V4 = 'https://api.bexio.com/4.0';

interface BexioBill {
  id: number;
  document_no: string;
  title: string | null;
  status: string;
  vendor: { name?: string } | string | null;
  bill_date: string | null;
  due_date: string | null;
  gross: string;
  attachment_ids: string[];   // UUID strings
  booking_account_ids: number[];
  created_at: string;
}

interface BexioBillsResponse {
  data: BexioBill[];
  paging: {
    page: number;
    page_size: number;
    page_count: number;
    item_count: number;
  };
}

/** Fetch paginated bills from Bexio v4. Uses { data, paging } envelope with page-based pagination. */
async function fetchBexioBills(apiKey: string, updatedAfter: string): Promise<BexioBill[]> {
  const PAGE_SIZE = 500;
  const all: BexioBill[] = [];
  let page = 1;
  while (true) {
    const response = await axios.get<BexioBillsResponse>(`${BEXIO_BASE_V4}/purchase/bills`, {
      params: { limit: PAGE_SIZE, page },
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });
    const items: BexioBill[] = response.data.data ?? [];
    const paging = response.data.paging;
    logger.info(`fetchBexioBills: page ${page}/${paging?.page_count ?? '?'}, got ${items.length} items`);
    const filtered = items.filter(b => !updatedAfter || b.created_at > updatedAfter);
    all.push(...filtered);
    if (!paging || page >= paging.page_count) break;
    page++;
  }
  return all;
}

/** Write bills to Firestore and update the sync pointer. */
async function persistBills(bills: BexioBill[], tenantId: string, nowStr: string): Promise<void> {
  const db = admin.firestore();
  const batch = db.batch();

  for (const bill of bills) {
    const bkey = String(bill.id);
    const gross = parseFloat(bill.gross) || 0;
    const doc: Record<string, unknown> = {
      tenants: [tenantId],
      isArchived: false,
      index: '',
      tags: [],
      notes: '',
      title: bill.title ?? bill.document_no,
      billId: bill.document_no,
      billDate: toStoreDate(bill.bill_date),
      dueDate: toStoreDate(bill.due_date),
      totalAmount: { amount: Math.round(gross * 100), currency: 'CHF', periodicity: 'one-time' },
      state: bill.status.toLowerCase(),
      bexioVender: bill.vendor,
      paymentDate: '',
      bookingAccount: bill.booking_account_ids.map(String).join(','),
      attachments: bill.attachment_ids.map(String),
    };
    batch.set(db.collection('bills').doc(bkey), doc, { merge: true });
  }

  batch.set(db.collection('config').doc('bexioSync'), { lastBillSyncedAt: nowStr }, { merge: true });
  await batch.commit();
}

/** Core sync logic shared by manual and scheduled bill triggers. */
async function runBillSync(fromDate: string, tenantId: string, label: string): Promise<{ count: number }> {
  logger.info(`${label}: fetching bills updated after "${fromDate}"`);
  const bills = await fetchBexioBills(bexioApiKey.value(), fromDate);
  logger.info(`${label}: fetched ${bills.length} bills`);
  const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
  await persistBills(bills, tenantId, nowStr);
  logger.info(`${label}: persisted ${bills.length} bills, pointer updated to ${nowStr}`);
  return { count: bills.length };
}

/**
 * Manual one-shot bill sync (onCall).
 * Pass { fromDate: "YYYY-MM-DD HH:mm:ss" } or omit for full history.
 */
export const syncBexioBills = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [bexioApiKey, bexioTenantId],
  },
  async (request: CallableRequest<{ fromDate?: string }>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const fromDate = request.data?.fromDate ?? '2000-01-01 00:00:00';
    return runBillSync(fromDate, bexioTenantId.value(), 'syncBexioBills');
  }
);

/**
 * Scheduled daily bill sync at 06:00 Europe/Zurich.
 */
export const scheduleBexioBillSync = onSchedule(
  {
    schedule: '0 6 * * *',
    timeZone: 'Europe/Zurich',
    region: 'europe-west6',
    secrets: [bexioApiKey, bexioTenantId],
  },
  async () => {
    const db = admin.firestore();
    const configDoc = await db.collection('config').doc('bexioSync').get();
    const fromDate: string = configDoc.data()?.lastBillSyncedAt ?? '2000-01-01 00:00:00';
    await runBillSync(fromDate, bexioTenantId.value(), 'scheduleBexioBillSync');
  }
);

/**
 * Fetch the PDF for a bill attachment from Bexio.
 * Input: { attachmentId: string } — Bexio file ID from bill.attachments[]
 * Returns { content: string } as base64-encoded PDF.
 */
export const showBillPdf = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [bexioApiKey],
  },
  async (request: CallableRequest<{ attachmentId: string }>) => {
    const CF_NAME = 'showBillPdf';
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const { attachmentId } = request.data;
    if (!attachmentId) throw new HttpsError('invalid-argument', 'attachmentId is required');

    logger.info(`${CF_NAME}: fetching PDF for attachment ${attachmentId}`);
    try {
      const response = await axios.get(
        `https://api.bexio.com/3.0/files/${attachmentId}/download`,
        {
          headers: { 'Authorization': `Bearer ${bexioApiKey.value()}` },
          responseType: 'arraybuffer',
        }
      );
      const content = Buffer.from(response.data as ArrayBuffer).toString('base64');
      logger.info(`${CF_NAME}: fetched PDF for attachment ${attachmentId}, ${content.length} base64 chars`);
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

// --------------------------------- Journal sync ---------------------------------

const BEXIO_BASE_V3 = 'https://api.bexio.com/3.0';

interface BexioJournalEntry {
  id: number;
  date: string | null;            // "YYYY-MM-DD"
  description: string | null;
  debit_account_id: number | null;
  credit_account_id: number | null;
  amount: string;                 // decimal string e.g. "1234.56"
}

/** Fetch paginated journal entries from Bexio v3 (flat array, offset-based pagination). */
async function fetchBexioJournalEntries(apiKey: string): Promise<BexioJournalEntry[]> {
  const PAGE_SIZE = 500;
  const all: BexioJournalEntry[] = [];
  let offset = 0;
  while (true) {
    const response = await axios.get<BexioJournalEntry[]>(`${BEXIO_BASE_V3}/accounting/journal`, {
      params: { limit: PAGE_SIZE, offset },
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });
    const page = Array.isArray(response.data) ? response.data : [];
    logger.info(`fetchBexioJournalEntries: offset=${offset}, got ${page.length} items`);
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

/** Write journal entries to Firestore in chunks and update the sync pointer. */
async function persistJournalEntries(entries: BexioJournalEntry[], tenantId: string, nowStr: string): Promise<void> {
  const db = admin.firestore();
  const BATCH_SIZE = 100; // keep well under Firestore's 10 MiB commit limit

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const chunk = entries.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const entry of chunk) {
      const bkey = String(entry.id);
      const amountCents = Math.round(parseFloat(entry.amount) * 100);
      const doc: Record<string, unknown> = {
        tenants: [tenantId],
        isArchived: false,
        index: '',
        tags: '',
        notes: '',
        title: entry.description ?? '',
        date: entry.date?.substring(0, 8),
        debitAccount: entry.debit_account_id != null ? String(entry.debit_account_id) : '',
        creditAccount: entry.credit_account_id != null ? String(entry.credit_account_id) : '',
        totalAmount: { amount: amountCents, currency: 'CHF', periodicity: 'one-time' },
      };
      doc.index = 'd:' + doc.date + ' a:' + (amountCents / 100).toFixed(2) + ' ' + doc.debitAccount + '/' + doc.creditAccount;

      batch.set(db.collection('journallogs').doc(bkey), doc, { merge: true });
    }
    await batch.commit();
    logger.info(`persistJournalEntries: committed chunk ${i / BATCH_SIZE + 1}, entries ${i + 1}-${i + chunk.length}`);
  }

  // update sync pointer after all chunks are written
  await db.collection('config').doc('bexioSync').set({ lastJournalSyncedAt: nowStr }, { merge: true });
}

/** Core sync logic shared by manual and scheduled journal triggers. */
async function runJournalSync(tenantId: string, label: string): Promise<{ count: number }> {
  logger.info(`${label}: fetching all journal entries`);
  const entries = await fetchBexioJournalEntries(bexioApiKey.value());
  logger.info(`${label}: fetched ${entries.length} journal entries`);
  const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
  await persistJournalEntries(entries, tenantId, nowStr);
  logger.info(`${label}: persisted ${entries.length} journal entries, pointer updated to ${nowStr}`);
  return { count: entries.length };
}

/**
 * Manual one-shot journal sync (onCall).
 * Fetches all journal entries from Bexio and stores them in Firestore collection 'journallogs'.
 */
export const syncBexioJournal = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    memory: '1GiB',
    secrets: [bexioApiKey, bexioTenantId],
  },
  async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    return runJournalSync(bexioTenantId.value(), 'syncBexioJournal');
  }
);

/**
 * Scheduled daily journal sync at 06:15 Europe/Zurich.
 */
export const scheduleBexioJournalSync = onSchedule(
  {
    schedule: '15 6 * * *',
    timeZone: 'Europe/Zurich',
    region: 'europe-west6',
    memory: '1GiB',
    secrets: [bexioApiKey, bexioTenantId],
  },
  async () => {
    await runJournalSync(bexioTenantId.value(), 'scheduleBexioJournalSync');
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
