import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';
import * as admin from 'firebase-admin';

import { bexioApiKey, bexioTenantId, BEXIO_BASE_V4, toStoreDate } from './shared';

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
