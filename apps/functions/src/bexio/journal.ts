import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';
import * as admin from 'firebase-admin';
import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';

import { bexioApiKey, bexioTenantId, BEXIO_BASE_V3 } from './shared';

interface BexioJournalEntry {
  id: number;
  date: string | null;            // YYYY-MM-DDTyy:mm:ss+hh:mm
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

/**
 * Load all AccountModel documents from Firestore and return a map of bexio account id → AccountModel bkey.
 * AccountModel bkeys are stored as `tenantId + String(bexio_id).padStart(4, '0')`.
 * We strip the tenantId prefix to recover the padded bexio id, then use String(parseInt(...)) as the key
 * so that lookups by raw numeric ids (e.g. String(entry.debit_account_id)) work correctly.
 */
async function loadAccountNumberMap(db: admin.firestore.Firestore, tenantId: string): Promise<Map<string, string>> {
  const snap = await db.collection('accounts').get();
  const map = new Map<string, string>();
  for (const doc of snap.docs) {
    const bkey = doc.id;
    if (!bkey.startsWith(tenantId)) continue;
    const paddedBexioId = bkey.slice(tenantId.length); // e.g. "0123"
    if (!paddedBexioId) continue;                       // skip root doc (bkey === tenantId)
    const bexioIdStr = String(parseInt(paddedBexioId, 10)); // e.g. "123"
    map.set(bexioIdStr, bkey);
  }
  logger.info(`loadAccountNumberMap: loaded ${map.size} accounts`);
  return map;
}

/** Convert a Bexio date string (ISO datetime or ISO date) to StoreDate "YYYYMMDD". Returns '' for null/empty. */
function bexioDateToStoreDate(bexioDate: string | null | undefined): string {
  if (!bexioDate) return '';
  const isoDate = bexioDate.length > 10 ? bexioDate.substring(0, 10) : bexioDate;
  return convertDateFormatToString(isoDate, DateFormat.IsoDate, DateFormat.StoreDate, false);
}

/**
 * Write journal entries to Firestore bookings + booking-lines collections in chunks.
 * Uses accountMap (bexio account id → AccountModel bkey) to resolve account references.
 * Each entry creates 3 documents (1 booking + 2 booking-lines), so we keep
 * batch size to max 50 entries (150 docs) to stay under Firestore's 500-write limit.
 */
async function persistJournalEntries(entries: BexioJournalEntry[], tenantId: string, nowStr: string): Promise<void> {
  const db = admin.firestore();
  const BATCH_SIZE = 50; // 50 entries × 3 docs = 150 docs per batch

  const accountMap = await loadAccountNumberMap(db, tenantId);

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const chunk = entries.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const entry of chunk) {
      const bkey = String(entry.id);
      const amountCents = Math.round(parseFloat(entry.amount) * 100);
      const dateStr = bexioDateToStoreDate(entry.date);

      const debitAccount = entry.debit_account_id != null
        ? (accountMap.get(String(entry.debit_account_id)) ?? String(entry.debit_account_id))
        : '';
      const creditAccount = entry.credit_account_id != null
        ? (accountMap.get(String(entry.credit_account_id)) ?? String(entry.credit_account_id))
        : '';

      // booking document
      const bookingDoc: Record<string, unknown> = {
        tenants: [tenantId],
        isArchived: false,
        index: `d:${dateStr} no:${bkey}`,
        tags: '',
        notes: '',
        title: entry.description ?? '',
        date: dateStr,
        bookingNo: entry.id,
        periodKey: '',
        documentKey: '',
        status: 'posted',
        accountingTenantId: tenantId,
      };
      batch.set(db.collection('bookings').doc(bkey), bookingDoc, { merge: true });

      // booking-line debit document
      const debitDoc: Record<string, unknown> = {
        tenants: [tenantId],
        isArchived: false,
        bookingKey: bkey,
        accountKey: debitAccount,
        debitAmount: { amount: amountCents, currency: 'CHF', periodicity: 'one-time' },
        creditAmount: null,
        amountFx: null,
        exchangeRateKey: '',
        vatCodeKey: '',
        accountingTenantId: tenantId,
      };
      batch.set(db.collection('booking-lines').doc(`${entry.id}-dr`), debitDoc, { merge: true });

      // booking-line credit document
      const creditDoc: Record<string, unknown> = {
        tenants: [tenantId],
        isArchived: false,
        bookingKey: bkey,
        accountKey: creditAccount,
        debitAmount: null,
        creditAmount: { amount: amountCents, currency: 'CHF', periodicity: 'one-time' },
        amountFx: null,
        exchangeRateKey: '',
        vatCodeKey: '',
        accountingTenantId: tenantId,
      };
      batch.set(db.collection('booking-lines').doc(`${entry.id}-cr`), creditDoc, { merge: true });
    }

    await batch.commit();
    logger.info(`persistJournalEntries: committed chunk ${Math.floor(i / BATCH_SIZE) + 1}, entries ${i + 1}-${i + chunk.length}`);
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
 * Fetches all journal entries from Bexio and stores them in Firestore collections
 * 'bookings' (one doc per entry) and 'booking-lines' (two docs per entry: debit + credit).
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
