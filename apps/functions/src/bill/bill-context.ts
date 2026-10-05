import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';

import { BillCollection } from '@okr/shared-models';

import { isBexioBackend } from '../bexio/backend-gate';
import { refuse } from '../invoice/invoice-context';

const ACCOUNTING_CONFIG_COLLECTION = 'accounting-configs';

/** A bill document as the callables read it, with its okey. */
export type BillDoc = Record<string, unknown>;

/**
 * The bill, after the tenant check every bill callable shares (a bill of another okr tenant is
 * `permission-denied`, a missing one `not-found`).
 */
export async function loadOwnBill(db: Firestore, tenantId: string, billKey: string): Promise<BillDoc> {
  const bill = (await db.collection(BillCollection).doc(billKey).get()).data();
  if (!bill) throw new HttpsError('not-found', `bill ${billKey} not found`);
  if (!((bill['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
    throw new HttpsError('permission-denied', 'bill belongs to another tenant');
  }
  return bill;
}

/**
 * The accounting config of a bill's books, after the ownership checks every native bill callable
 * shares: the bill names its books, a config exists, it lists the caller's tenant, it is not booked in
 * bexio (spec 1.85: never write native ledger data into bexio books).
 */
export async function loadBillConfig(db: Firestore, tenantId: string, billKey: string, accountingTenantId: string): Promise<Record<string, unknown>> {
  if (!accountingTenantId) throw refuse('no-accounting-config', `bill ${billKey} has no accounting tenant`);
  const config = (await db.collection(ACCOUNTING_CONFIG_COLLECTION).doc(accountingTenantId).get()).data();
  if (!config) throw refuse('no-accounting-config', `no accounting config for ${accountingTenantId}`);
  if (!((config['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
    throw refuse('foreign-accounting-tenant', `${accountingTenantId} does not belong to this tenant`);
  }
  if (isBexioBackend(config)) {
    throw refuse('bexio-backend', `${accountingTenantId} is booked in bexio — bills are not changed here`);
  }
  return config;
}

/** The payables account (Kreditoren) of the books; refuses `no-payables-account` when it is not set. */
export function payablesKeyOf(config: Record<string, unknown>, accountingTenantId: string): string {
  const key = String(config['payablesAccountKey'] ?? '');
  if (!key) throw refuse('no-payables-account', `${accountingTenantId} has no payables account`);
  return key;
}
