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

// by default, the tenant id is used as the id of the root as well as the prefix on each id (bkey, parentId)
// this is to ensure different namespaces per account chart (Kontoplan)
// also, we pad every id with leading 0 to make the ids sortable

async function fetchBexioAccountGroups(apiKey: string): Promise<BexioAccountGroup[]> {
  const response = await axios.get<BexioAccountGroup[]>(`${BEXIO_BASE}/account_groups`, {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
  });
  const all = Array.isArray(response.data) ? response.data : [];
  return all.filter(g => g.is_active === true);
}

async function fetchBexioAccounts(apiKey: string): Promise<BexioAccount[]> {
  const response = await axios.get<BexioAccount[]>(`${BEXIO_BASE}/accounts`, {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
  });
  const all = Array.isArray(response.data) ? response.data : [];
  return all.filter(a => a.is_active === true);
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
    bkey: tenantId,
    data: {
      tenants: [tenantId],
      isArchived: false,
      name: tenantId,
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
    let parentId = tenantId; 
    if (g.parent_fibu_account_group_id) parentId = parentId + String(g.parent_fibu_account_group_id).padStart(4, '0');
    docs.push({
      bkey: tenantId + String(g.id).padStart(4, '0'),
      data: {
        tenants: [tenantId],
        isArchived: false,
        name: g.name,
        index: '',
        tags: [],
        notes: '',
        id: g.account_no.padStart(4, '0'),
        parentId,
        type: 'group',
        label: '',
      },
    });
  }

  // 3) leaf accounts
  for (const a of accounts) {
    let parentId = tenantId;
    if (a.fibu_account_group_id) parentId = parentId + String(a.fibu_account_group_id).padStart(4, '0');
    docs.push({
      bkey: tenantId + String(a.id).padStart(4, '0'),
      data: {
        tenants: [tenantId],
        isArchived: false,
        name: a.name,
        index: '',
        tags: [],
        notes: '',
        id: a.account_no.padStart(4, '0'),
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
