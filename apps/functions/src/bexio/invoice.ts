import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';
import * as admin from 'firebase-admin';
import { convertDateFormatToString, addDuration, getTodayStr, getFullName, addIndexElement, DateFormat } from '@bk2/shared-util-core';

import { bexioApiKey, bexioTenantId, bexioDefaultTaxId, BEXIO_BASE } from './shared';

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

/** A resolved invoice receiver = AvatarInfo of a local Person or Org. */
interface ReceiverInfo {
  key: string;
  name1: string;
  name2: string;
  modelType: 'person' | 'org';
  type: string;
  subType: string;
  label: string;
}

/**
 * Build a map from Bexio contact id → local receiver (AvatarInfo) by reading the
 * persons and orgs collections and keying on their `bexioId` field.
 * PersonModel/OrgModel both carry `bexioId`; we normalize it to a plain numeric
 * string so lookups by `String(inv.contact_id)` match.
 */
async function loadReceiverMap(db: admin.firestore.Firestore): Promise<Map<string, ReceiverInfo>> {
  const map = new Map<string, ReceiverInfo>();

  const normalize = (bexioId: unknown): string | undefined => {
    const raw = (bexioId ?? '').toString().trim();
    if (!raw) return undefined;
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? undefined : String(n);
  };

  const [personSnap, orgSnap] = await Promise.all([
    db.collection('persons').get(),
    db.collection('orgs').get(),
  ]);

  for (const docSnap of personSnap.docs) {
    const d = docSnap.data();
    const key = normalize(d.bexioId);
    if (!key) continue;
    const firstName = d.firstName ?? '';
    const lastName = d.lastName ?? '';
    map.set(key, {
      key: docSnap.id,
      name1: firstName,
      name2: lastName,
      modelType: 'person',
      type: '',
      subType: '',
      label: getFullName(firstName, lastName),
    });
  }

  for (const docSnap of orgSnap.docs) {
    const d = docSnap.data();
    const key = normalize(d.bexioId);
    if (!key) continue;
    const name = d.name ?? '';
    map.set(key, {
      key: docSnap.id,
      name1: '',
      name2: name,
      modelType: 'org',
      type: '',
      subType: '',
      label: name,
    });
  }

  logger.info(`loadReceiverMap: loaded ${map.size} receivers (persons + orgs with bexioId)`);
  return map;
}

interface BexioPayment {
  id: number;
  date: string;   // "YYYY-MM-DD"
  value: string;
}

/**
 * Fetch the payment date for an invoice from Bexio. The kb_invoice object itself
 * carries no payment date; payments live on /kb_invoice/{id}/payment. Returns the
 * latest payment's date as a StoreDate ("YYYYMMDD"), or '' if there are none.
 */
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Run `fn` over `items` with at most `limit` concurrent calls; results stay index-aligned with `items`. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function fetchInvoicePaymentDate(apiKey: string, invoiceId: number): Promise<string> {
  const MAX_RETRIES = 5;
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await axios.get<BexioPayment[]>(
        `${BEXIO_BASE}/kb_invoice/${invoiceId}/payment`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
          },
        }
      );
      const payments = Array.isArray(response.data) ? response.data : [];
      if (payments.length === 0) return '';
      const latest = payments.reduce((a, b) => (a.date >= b.date ? a : b));
      if (!latest.date) return '';
      return convertDateFormatToString(latest.date.substring(0, 10), DateFormat.IsoDate, DateFormat.StoreDate, false);
    } catch (error) {
      // Bexio rate-limits (HTTP 429); back off and retry rather than dropping the payment date.
      if (axios.isAxiosError(error) && error.response?.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = parseInt(String(error.response.headers?.['retry-after'] ?? ''), 10);
        const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(1000 * 2 ** attempt, 16000);
        logger.info(`fetchInvoicePaymentDate: 429 for invoice ${invoiceId}, retry ${attempt + 1}/${MAX_RETRIES} after ${delayMs}ms`);
        await sleep(delayMs);
        continue;
      }
      logger.warn(`fetchInvoicePaymentDate: failed for invoice ${invoiceId}`, error);
      return '';
    }
  }
}

/** Build the searchable index for an invoice (mirrors getInvoiceIndex in @bk2/finance-invoice-util). */
function buildInvoiceIndex(invoiceId: string, totalCents: number, receiver: ReceiverInfo | undefined, title: string): string {
  let index = '';
  index = addIndexElement(index, 'i', invoiceId);
  index = addIndexElement(index, 'a', (totalCents / 100).toFixed(2));
  if (receiver) {
    index = addIndexElement(index, 'n', receiver.label || getFullName(receiver.name1, receiver.name2));
  }
  index = addIndexElement(index, 't', title);
  return index;
}

/** Write invoices to Firestore (chunked) and update the sync pointer. */
async function persistInvoices(invoices: BexioInvoice[], tenantId: string, nowStr: string, apiKey: string): Promise<void> {
  const db = admin.firestore();
  const BATCH_SIZE = 100; // 1 doc per invoice; keeps each batch well under Firestore's 500-write limit

  const receiverMap = await loadReceiverMap(db);

  for (let i = 0; i < invoices.length; i += BATCH_SIZE) {
    const chunk = invoices.slice(i, i + BATCH_SIZE);

    // payment date lives on a separate Bexio endpoint; fetch it only for paid invoices (status 9).
    // Throttle to a low concurrency — firing a whole chunk in parallel trips Bexio's rate limit (HTTP 429).
    const paymentDates = await mapWithConcurrency(chunk, 3, inv =>
      inv.kb_item_status_id === 9 ? fetchInvoicePaymentDate(apiKey, inv.id) : Promise.resolve('')
    );

    const batch = db.batch();
    chunk.forEach((inv, idx) => {
      const bkey = String(inv.id);
      const totalCents = Math.round(parseFloat(inv.total) * 100);
      const receiver = inv.contact_id != null ? receiverMap.get(String(inv.contact_id)) : undefined;
      const title = inv.title ?? inv.document_nr;
      if (inv.contact_id != null && !receiver) {
        logger.warn(`persistInvoices: no local person/org found for Bexio contact ${inv.contact_id} (invoice ${bkey})`);
      }

      const doc: Record<string, unknown> = {
        tenants: [tenantId],
        isArchived: false,
        index: buildInvoiceIndex(inv.document_nr, totalCents, receiver, title),
        tags: [],
        // when resolved, the receiver carries the linkage; keep contact_id in notes only
        // when unresolved, so the "Link receivers" step (or a later re-sync) can still match it
        notes: (inv.contact_id != null && !receiver) ? String(inv.contact_id) : '',
        title,
        invoiceId: inv.document_nr,
        invoiceDate: inv.is_valid_from ? convertDateFormatToString(inv.is_valid_from, DateFormat.IsoDate, DateFormat.StoreDate, false) : '',
        dueDate: inv.is_valid_to ? convertDateFormatToString(inv.is_valid_to, DateFormat.IsoDate, DateFormat.StoreDate, false) : '',
        totalAmount: { amount: totalCents, currency: 'CHF', periodicity: 'one-time' },
        taxes: parseFloat(inv.total_taxes) || 0,
        vatType: mapVatType(inv.mwst_type),
        state: mapInvoiceStatus(inv.kb_item_status_id),
        paymentDate: paymentDates[idx],
        accountingTenantId: tenantId,
      };
      if (receiver) doc.receiver = receiver;

      batch.set(db.collection('invoices').doc(bkey), doc, { merge: true });
    });

    await batch.commit();
    logger.info(`persistInvoices: committed chunk ${Math.floor(i / BATCH_SIZE) + 1}, invoices ${i + 1}-${i + chunk.length}`);
  }

  // update sync pointer after all chunks are written
  await db.collection('config').doc('bexioSync').set({ lastSyncedAt: nowStr }, { merge: true });
}

/** Core sync logic shared by manual and scheduled triggers. */
async function runInvoiceSync(fromDate: string, tenantId: string, label: string): Promise<{ count: number }> {
  const apiKey = bexioApiKey.value();
  logger.info(`${label}: fetching invoices updated after "${fromDate}"`);
  const invoices = await fetchBexioInvoices(apiKey, fromDate);
  logger.info(`${label}: fetched ${invoices.length} invoices`);

  const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19); // "YYYY-MM-DD HH:mm:ss"
  await persistInvoices(invoices, tenantId, nowStr, apiKey);
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
    timeoutSeconds: 540, // per-paid-invoice payment lookups make a full backfill slow
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
    timeoutSeconds: 540, // per-paid-invoice payment lookups make a large sync slow
    secrets: [bexioApiKey, bexioTenantId],
  },
  async () => {
    const db = admin.firestore();
    const configDoc = await db.collection('config').doc('bexioSync').get();
    const fromDate: string = configDoc.data()?.lastSyncedAt ?? '2000-01-01 00:00:00';
    await runInvoiceSync(fromDate, bexioTenantId.value(), 'scheduledBexioInvoiceSync');
  }
);
