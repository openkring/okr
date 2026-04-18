import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';
import * as admin from 'firebase-admin';

import { bexioApiKey, bexioTenantId, BEXIO_BASE } from './shared';

interface BexioAccountGroup {
  id: number;
  account_no: string;
  name: string;
  parent_fibu_account_group_id: number | null;
  is_active: boolean;
  is_locked: boolean;
}

interface BexioAccount {
  id: number;
  account_no: string;
  name: string;
  fibu_account_group_id: number | null;
  is_active: boolean;
  is_locked: boolean;
}

const ROOT_BKEY = 'bexio_root';

async function fetchBexioAccountGroups(apiKey: string): Promise<BexioAccountGroup[]> {
  const response = await axios.get<BexioAccountGroup[]>(`${BEXIO_BASE}/account_groups`, {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
  });
  const all = Array.isArray(response.data) ? response.data : [];
  return all.filter(g => g.is_active === true && g.is_locked === false);
}

async function fetchBexioAccounts(apiKey: string): Promise<BexioAccount[]> {
  const response = await axios.get<BexioAccount[]>(`${BEXIO_BASE}/accounts`, {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
  });
  const all = Array.isArray(response.data) ? response.data : [];
  return all.filter(a => a.is_active === true && a.is_locked === false);
}

async function persistAccounts(
  groups: BexioAccountGroup[],
  accounts: BexioAccount[],
  tenantId: string,
): Promise<void> {
  const db = admin.firestore();
  const col = db.collection('accounts');
  const BATCH_SIZE = 100;

  type AccountDoc = Record<string, unknown>;
  const docs: Array<{ bkey: string; data: AccountDoc }> = [];

  // 1) root
  docs.push({
    bkey: ROOT_BKEY,
    data: {
      tenants: [tenantId],
      isArchived: false,
      name: 'bexio',
      index: '',
      tags: [],
      notes: '',
      id: '',
      parentId: '',
      type: 'root',
      label: '',
    },
  });

  // 2) account groups
  for (const g of groups) {
    const parentId = g.parent_fibu_account_group_id === null
      ? ROOT_BKEY
      : String(g.parent_fibu_account_group_id);
    docs.push({
      bkey: String(g.id),
      data: {
        tenants: [tenantId],
        isArchived: false,
        name: g.name,
        index: '',
        tags: [],
        notes: String(g.id),
        id: g.account_no,
        parentId,
        type: 'group',
        label: '',
      },
    });
  }

  // 3) leaf accounts
  for (const a of accounts) {
    const parentId = a.fibu_account_group_id === null
      ? ROOT_BKEY
      : String(a.fibu_account_group_id);
    docs.push({
      bkey: String(a.id),
      data: {
        tenants: [tenantId],
        isArchived: false,
        name: a.name,
        index: '',
        tags: [],
        notes: String(a.id),
        id: a.account_no,
        parentId,
        type: 'leaf',
        label: '',
      },
    });
  }

  // Write in chunks of BATCH_SIZE
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const { bkey, data } of chunk) {
      batch.set(col.doc(bkey), data, { merge: true });
    }
    await batch.commit();
    logger.info(`persistAccounts: committed chunk ${Math.floor(i / BATCH_SIZE) + 1}, docs ${i + 1}-${i + chunk.length}`);
  }
}

async function runAccountSync(tenantId: string, label: string): Promise<{ groups: number; accounts: number }> {
  logger.info(`${label}: fetching account groups and accounts from Bexio`);
  const [groups, accounts] = await Promise.all([
    fetchBexioAccountGroups(bexioApiKey.value()),
    fetchBexioAccounts(bexioApiKey.value()),
  ]);
  logger.info(`${label}: fetched ${groups.length} groups and ${accounts.length} accounts`);
  await persistAccounts(groups, accounts, tenantId);
  logger.info(`${label}: persisted root + ${groups.length} groups + ${accounts.length} accounts`);
  return { groups: groups.length, accounts: accounts.length };
}

/**
 * Manual one-shot account sync (onCall).
 * Downloads account_groups and accounts from Bexio and writes them into
 * the Firestore 'accounts' collection as a hierarchical AccountModel tree.
 * Root: bkey='bexio_root'. Groups and accounts use the Bexio integer id as bkey.
 */
export const syncBexioAccounts = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: [bexioApiKey, bexioTenantId],
  },
  async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    return runAccountSync(bexioTenantId.value(), 'syncBexioAccounts');
  }
);
