// apps/functions/src/bill/bill-approver.load.ts
//
// Firestore loaders shared by billApproverDaily and getBillsForApproval (spec 1.94).

import { Firestore } from 'firebase-admin/firestore';

import { PayingAccount } from './bill-approver.logic';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Name (`id name` of accounts/{key}) and IBAN (first non-archived bank profile of the tenant) of each paying account. */
export async function loadPayingAccounts(db: Firestore, tenantId: string, keys: string[]): Promise<PayingAccount[]> {
  return Promise.all(keys.map(async key => {
    const acc = (await db.collection('accounts').doc(key).get()).data();
    const prof = await db.collection('bank-profiles').where('accountKey', '==', key).where('tenants', 'array-contains', tenantId).get();
    const active = prof.docs.find(p => p.data()['isArchived'] !== true);   // archived profiles are skipped in memory (no new index)
    return { key, name: [str(acc?.['id']), str(acc?.['name'])].filter(Boolean).join(' '), iban: str(active?.data()['iban']) };
  }));
}
