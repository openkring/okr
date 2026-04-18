import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';
import * as admin from 'firebase-admin';

import { bexioApiKey, bexioTenantId, BEXIO_BASE_V3, toStoreDate } from './shared';

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

/** Load all AccountModel documents from Firestore and return a map of bkey → account number (id field). */
async function loadAccountNumberMap(db: admin.firestore.Firestore): Promise<Map<string, string>> {
  const snap = await db.collection('accounts').get();
  const map = new Map<string, string>();
  for (const doc of snap.docs) {
    const accountNo = doc.data()?.['id'];
    if (accountNo) map.set(doc.id, String(accountNo));
  }
  logger.info(`loadAccountNumberMap: loaded ${map.size} accounts`);
  return map;
}

/** Write journal entries to Firestore in chunks and update the sync pointer. */
async function persistJournalEntries(entries: BexioJournalEntry[], tenantId: string, nowStr: string): Promise<void> {
  const db = admin.firestore();
  const BATCH_SIZE = 100; // keep well under Firestore's 10 MiB commit limit

  const accountMap = await loadAccountNumberMap(db);

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const chunk = entries.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const entry of chunk) {
      const bkey = String(entry.id);
      const amountCents = Math.round(parseFloat(entry.amount) * 100);
      const debitAccount = entry.debit_account_id != null
        ? (accountMap.get(String(entry.debit_account_id)) ?? String(entry.debit_account_id))
        : '';
      const creditAccount = entry.credit_account_id != null
        ? (accountMap.get(String(entry.credit_account_id)) ?? String(entry.credit_account_id))
        : '';
      const doc: Record<string, unknown> = {
        tenants: [tenantId],
        isArchived: false,
        index: '',
        tags: '',
        notes: '',
        title: entry.description ?? '',
        date: toStoreDate(entry.date),
        debitAccount,
        creditAccount,
        totalAmount: { amount: amountCents, currency: 'CHF', periodicity: 'one-time' },
      };
      doc.index = 'd:' + doc.date + ' a:' + (amountCents / 100).toFixed(2) + ' ' + debitAccount + '/' + creditAccount;

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
