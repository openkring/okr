/**
 * Trainer-Abrechnung (spec 1.167 §7.5): who may act on a trainer invoice as the books' keeper. Treasurer or admin of
 * the invoice's tenant — read from users/{uid}, never from the request — and the invoice's books must list that tenant.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { AccountingConfigCollection, AvatarInfo, TrainerInvoiceCollection } from '@okr/shared-models';

import { isDocKey } from './trainer-invoice-context';

export interface TreasurerCaller {
  tenantId: string;
  personKey: string;
  avatar: AvatarInfo;
}

export interface BooksInvoice {
  invoice: Record<string, unknown>;
  /** the books' accounting-config */
  config: Record<string, unknown>;
}

/** Pure: treasurer or admin role of the caller's own tenant, and that tenant owns the invoice. */
export function mayManageTrainerInvoices(
  caller: { tenantId: string; roles: Record<string, unknown> },
  invoice: { tenants?: unknown },
): boolean {
  const tenants = Array.isArray(invoice.tenants) ? invoice.tenants : [];
  if (!caller.tenantId || !tenants.includes(caller.tenantId)) return false;
  return caller.roles['treasurer'] === true || caller.roles['admin'] === true;
}

/** Loads the caller and the invoice and refuses unless the caller may manage it. A missing and a foreign invoice look the same. */
export async function loadBooksInvoice(db: Firestore, uid: string, invoiceKey: unknown): Promise<BooksInvoice & { caller: TreasurerCaller; invoiceKey: string }> {
  if (!isDocKey(invoiceKey)) throw new HttpsError('invalid-argument', 'invoiceKey is required');
  const user = (await db.collection('users').doc(uid).get()).data() ?? {};
  const tenantId = Array.isArray(user['tenants']) && typeof user['tenants'][0] === 'string' ? user['tenants'][0] : '';
  const personKey = typeof user['personKey'] === 'string' ? user['personKey'] : '';
  const roles = (user['roles'] as Record<string, unknown> | undefined) ?? {};
  const invoice = (await db.collection(TrainerInvoiceCollection).doc(invoiceKey).get()).data();
  if (!invoice || !mayManageTrainerInvoices({ tenantId, roles }, invoice)) {
    throw new HttpsError('permission-denied', 'not allowed to manage this trainer invoice');
  }
  const books = typeof invoice['accountingTenantId'] === 'string' ? invoice['accountingTenantId'] : '';
  const config = books ? (await db.collection(AccountingConfigCollection).doc(books).get()).data() : undefined;
  const configTenants = Array.isArray(config?.['tenants']) ? (config?.['tenants'] as unknown[]) : [];
  if (!config || !configTenants.includes(tenantId)) throw new HttpsError('permission-denied', 'the books of this invoice are not available to your tenant');
  const name1 = typeof user['firstName'] === 'string' ? user['firstName'] : '';
  const name2 = typeof user['lastName'] === 'string' ? user['lastName'] : '';
  const avatar: AvatarInfo = { key: personKey, name1, name2, modelType: 'person', type: '', subType: '', label: `${name1} ${name2}`.trim() };
  return { invoice, config, invoiceKey, caller: { tenantId, personKey, avatar } };
}
