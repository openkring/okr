import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore, Transaction } from 'firebase-admin/firestore';

import { AddressCollection, AddressModel, PersonCollection, ResponsibilityCollection } from '@okr/shared-models';
import { getProjectedAddresses, pickFavoriteByChannel, scopeToTenant } from '@okr/shared-util-functions';

import type { PostalAddress } from './invoice.logic';
import { activeResponsible, ResponsibilityLike, TreasurerContact, treasurerContactFields, treasurerResponsibilityKey } from './treasurer-contact.logic';
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

export type ReceiverRef = { key?: string; name1?: string; name2?: string; modelType?: string } | undefined;

/**
 * The contact printed in the footer and signature of finance PDFs: whoever holds the tenant's treasurer
 * responsibility today (`{tenantId}-treasurer`, the delegate inside its period). Email and phone come through the
 * shared privacy projection for a `registered` viewer — the documents go to members — so the person's `usage*`
 * preferences and the tenant's privacy floor apply exactly as in the member directory. All fields '' when the
 * responsibility (of this tenant) or the person is missing.
 */
export async function treasurerContact(db: Firestore, tenantId: string, today: string): Promise<TreasurerContact> {
  const resp = (await db.collection(ResponsibilityCollection).doc(treasurerResponsibilityKey(tenantId)).get()).data() as
    (ResponsibilityLike & { tenants?: string[] }) | undefined;
  if (!resp || !(resp.tenants ?? []).includes(tenantId)) return treasurerContactFields(undefined, []);
  const person = activeResponsible(resp, today);
  if (!person?.key) return treasurerContactFields(undefined, []);
  const addresses = await getProjectedAddresses(db, `person.${person.key}`, 'registered', tenantId);
  return treasurerContactFields(person, addresses);
}

/** The receiving person's gender (PersonModel.gender) for the greeting; undefined for an org or an unknown person. */
export async function receiverGender(db: Firestore, receiver: ReceiverRef): Promise<string | undefined> {
  if (receiver?.modelType !== 'person' || !receiver.key) return undefined;
  const gender = (await db.collection(PersonCollection).doc(receiver.key).get()).data()?.['gender'];
  return typeof gender === 'string' ? gender : undefined;
}

/** The receiver's favourite postal address collected by this tenant (D-L1), or undefined. */
export async function receiverAddress(db: Firestore, receiver: ReceiverRef, tenantId: string): Promise<PostalAddress | undefined> {
  if (!receiver?.key || !receiver.modelType) return undefined;
  const snap = await db.collection(AddressCollection).where('parentKey', '==', `${receiver.modelType}.${receiver.key}`).get();
  const addresses = scopeToTenant(snap.docs.map((d) => ({ ...d.data(), okey: d.id }) as AddressModel), tenantId);
  const postal = pickFavoriteByChannel(addresses, 'postal');
  if (!postal) return undefined;
  return {
    streetName: postal.streetName ?? '',
    streetNumber: postal.streetNumber ?? '',
    zipCode: postal.zipCode ?? '',
    city: postal.city ?? '',
    countryCode: postal.countryCode || 'CH',
  };
}
