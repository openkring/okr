import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';
import * as admin from 'firebase-admin';

import { addDuration, getTodayStr, DateFormat } from '@okr/shared-util-core';

import { bexioApiKey, bexioTenantId, BEXIO_BASE_V4 } from './shared';
import { BexioBill, billDoc } from './bill.mapper';
import { loadIsBexioBackend } from './backend-gate';
import { readFinanceDocument } from './finance-document';
import { checkRoles, getCallerTenantId } from '@okr/shared-util-functions';

interface BexioBillsResponse {
  data: BexioBill[];
  paging: {
    page: number;
    page_size: number;
    page_count: number;
    item_count: number;
  };
}

/**
 * Fetch paginated bills from Bexio v4. Uses { data, paging } envelope with page-based pagination.
 * @param billDateStart server-side lower bound on bill_date (yyyy-MM-dd) — a rolling lookback
 *   window that limits how far back Bexio pages. Every bill in the window is re-upserted: the v4
 *   list has no `updated_at`, and filtering on it discarded every bill (spec 1.68 §4.1).
 */
async function fetchBexioBills(apiKey: string, billDateStart: string): Promise<BexioBill[]> {
  const PAGE_SIZE = 500;
  const all: BexioBill[] = [];
  let page = 1;
  while (true) {
    const response = await axios.get<BexioBillsResponse>(`${BEXIO_BASE_V4}/purchase/bills`, {
      params: { limit: PAGE_SIZE, page, bill_date_start: billDateStart },
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });
    const items: BexioBill[] = response.data.data ?? [];
    const paging = response.data.paging;
    logger.info(`fetchBexioBills: page ${page}/${paging?.page_count ?? '?'}, got ${items.length} items`);
    all.push(...items);
    if (!paging || page >= paging.page_count) break;
    page++;
  }
  return all;
}

/** Write bills to Firestore in chunks (a full history exceeds the 500-write batch limit) and update the sync pointer. */
async function persistBills(bills: BexioBill[], tenantId: string, nowStr: string): Promise<void> {
  const db = admin.firestore();
  const CHUNK = 400;
  for (let i = 0; i < bills.length; i += CHUNK) {
    const chunk = bills.slice(i, i + CHUNK);
    const refs = chunk.map(bill => db.collection('bills').doc(String(bill.id)));
    const existing = await db.getAll(...refs);
    const batch = db.batch();
    chunk.forEach((bill, idx) => {
      batch.set(refs[idx], billDoc(bill, tenantId, existing[idx].data()), { merge: true });
    });
    await batch.commit();
  }
  await db.collection('config').doc('bexioSync').set({ lastBillSyncedAt: nowStr }, { merge: true });
}

/** Rolling lookback window (months) for the scheduled sync's server-side bill_date_start filter. */
const BILL_DATE_LOOKBACK_MONTHS = 12;
/** Server-side bill_date_start for a full-history backfill (manual sync). */
const BILL_DATE_FULL_HISTORY = '2000-01-01';

/** Lookback window start date (yyyy-MM-dd) used by the scheduled incremental sync. */
function billDateWindowStart(): string {
  return addDuration(getTodayStr(DateFormat.IsoDate), { months: -BILL_DATE_LOOKBACK_MONTHS }, DateFormat.IsoDate);
}

/** Core sync logic shared by manual and scheduled bill triggers. */
async function runBillSync(billDateStart: string, tenantId: string, label: string): Promise<{ count: number }> {
  logger.info(`${label}: fetching bills with bill_date >= "${billDateStart}"`);
  const bills = await fetchBexioBills(bexioApiKey.value(), billDateStart);
  logger.info(`${label}: fetched ${bills.length} bills`);
  const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
  await persistBills(bills, tenantId, nowStr);
  logger.info(`${label}: persisted ${bills.length} bills, pointer updated to ${nowStr}`);
  return { count: bills.length };
}

/**
 * Manual one-shot bill sync (onCall). Full history unless { billDateStart: "yyyy-MM-dd" } is passed.
 */
export const syncBexioBills = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [bexioApiKey, bexioTenantId],
  },
  async (request: CallableRequest<{ billDateStart?: string }>) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    await checkRoles(request as never, 'syncBexioBills', ['treasurer', 'privileged']);
    if (!(await loadIsBexioBackend(admin.firestore(), bexioTenantId.value()))) {
      throw new HttpsError('failed-precondition', 'The accounting backend is no longer bexio (spec 1.68).');
    }
    // Manual sync defaults to full history; pass billDateStart to limit the window.
    const billDateStart = request.data?.billDateStart ?? BILL_DATE_FULL_HISTORY;
    return runBillSync(billDateStart, bexioTenantId.value(), 'syncBexioBills');
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
    const tenantId = bexioTenantId.value();
    if (!(await loadIsBexioBackend(admin.firestore(), tenantId))) {
      logger.info(`scheduleBexioBillSync: accounting backend of ${tenantId} is not bexio — skipped`);
      return;
    }
    // Scheduled sync: only page the recent bill_date window.
    await runBillSync(billDateWindowStart(), tenantId, 'scheduleBexioBillSync');
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
    // bills are treasurer data — before 1.68 any signed-in user could stream an attachment
    await checkRoles(request as never, CF_NAME, ['treasurer', 'privileged']);

    // migrated from bexio (spec 1.68): bill.attachments now hold finance-documents okeys
    if (attachmentId.startsWith('bexio-file-')) {
      const tenantId = await getCallerTenantId(request as never, CF_NAME);
      const local = await readFinanceDocument(admin.firestore(), admin.storage().bucket(), attachmentId, [tenantId]);
      if (!local) throw new HttpsError('not-found', 'Document not found');
      return { content: local };
    }

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
