import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore, Transaction } from 'firebase-admin/firestore';

import { isBexioBackend } from '../bexio/backend-gate';

const ACCOUNTING_CONFIG_COLLECTION = 'accounting-configs';
const ACCOUNT_COLLECTION = 'accounts';

/** A refusal the client can show a friendly text for: `failed-precondition` with `{ reason }`. */
export function refuse(reason: string, message: string, extra: Record<string, unknown> = {}): HttpsError {
  return new HttpsError('failed-precondition', message, { reason, ...extra });
}

/**
 * The accounting config of an invoice's accounting tenant, after the ownership checks every native
 * invoice callable shares: the invoice names a tenant, a config exists, it lists the caller's tenant
 * and it is not booked in bexio.
 */
export async function loadOwnedAccountingConfig(
  db: Firestore, tenantId: string, invoiceKey: string, accountingTenantId: string, action = 'issued',
): Promise<Record<string, unknown>> {
  if (!accountingTenantId) throw refuse('no-accounting-config', `invoice ${invoiceKey} has no accounting tenant`);
  const config = (await db.collection(ACCOUNTING_CONFIG_COLLECTION).doc(accountingTenantId).get()).data();
  if (!config) throw refuse('no-accounting-config', `no accounting config for ${accountingTenantId}`);
  if (!((config['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
    throw refuse('foreign-accounting-tenant', `${accountingTenantId} does not belong to this tenant`);
  }
  if (isBexioBackend(config)) {
    throw refuse('bexio-backend', `${accountingTenantId} is booked in bexio — invoices are not ${action} here`);
  }
  return config;
}

/**
 * The account exists, belongs to this accounting tenant and is a leaf (same rule as postBankImport).
 * Without `tx` it is the cheap pre-check before numbering; with `tx` the authoritative check in the
 * posting transaction (reads only, so it must run before the first write).
 */
export async function assertLeafAccount(db: Firestore, accountingTenantId: string, accountKey: string, tx?: Transaction): Promise<void> {
  const accountRef = db.collection(ACCOUNT_COLLECTION).doc(accountKey);
  const childrenQuery = db.collection(ACCOUNT_COLLECTION).where('parentKey', '==', accountKey).limit(1);
  const account = (tx ? await tx.get(accountRef) : await accountRef.get()).data();
  const children = tx ? await tx.get(childrenQuery) : await childrenQuery.get();
  if (!account || account['accountingTenantId'] !== accountingTenantId || !children.empty) {
    throw refuse('account-invalid', `account ${accountKey} is not a leaf account of ${accountingTenantId}`, { accountKey });
  }
}
