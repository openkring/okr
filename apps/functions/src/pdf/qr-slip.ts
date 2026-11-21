// apps/functions/src/pdf/qr-slip.ts
import type { Firestore } from 'firebase-admin/firestore';
import type { Data } from 'swissqrbill/types';

import { AppConfigCollection, OrgCollection, AddressCollection, AddressModel } from '@okr/shared-models';
import { zurichStoreDate } from '@okr/shared-util-core';
import { pickBankIbans, pickFavoriteByChannel, QrPayee, QrSlipData, scopeToTenant } from '@okr/shared-util-functions';

/**
 * Resolve the payee (creditor) org: name from the org, IBAN from its favorite
 * bankaccount address, postal address from its favorite postal address.
 *
 * The org is `payeeOrgId` when the template sets one (a tenant may contain
 * sub-entities, e.g. a Gönnerverein within a Seeclub — different IBAN), else the
 * tenant's default org (`AppConfig.ownerOrgId`, which defaults to the tenantId).
 * Best-effort — returns empty strings for missing parts; the caller decides
 * whether a missing IBAN is fatal.
 */
export async function resolvePayee(db: Firestore, tenantId: string, payeeOrgId?: string): Promise<QrPayee> {
  let orgId = payeeOrgId ?? '';
  if (!orgId) {
    const configSnap = await db.collection(AppConfigCollection).doc(tenantId).get();
    orgId = (configSnap.data()?.['ownerOrgId'] as string) || tenantId;
  }

  const orgSnap = await db.collection(OrgCollection).doc(orgId).get();
  const orgName = (orgSnap.data()?.['name'] as string) ?? '';

  // D-L1: prefer this tenant's own addresses. An org shared by two tenants carries both
  // tenants' bank addresses, and the OTHER tenant's favorite would otherwise decide which
  // IBAN this payment slip asks money to be sent to. Unlike the directory projection this
  // falls back to the unscoped set: an org address seeded without a `tenants[]` entry must
  // not silently produce a QR bill with no IBAN, and org payment data is published to the
  // payer by definition — the concern here is which IBAN is right, not who may see it.
  const addrSnap = await db.collection(AddressCollection)
    .where('parentKey', '==', `org.${orgId}`).get();
  const allAddresses = addrSnap.docs.map(d => ({ okey: d.id, ...d.data() }) as AddressModel);
  const ownAddresses = scopeToTenant(allAddresses, tenantId);
  const addresses = ownAddresses.length > 0 ? ownAddresses : allAddresses;

  const bank = pickFavoriteByChannel(addresses, 'bankaccount');
  const { qrIban, regularIban } = pickBankIbans(addresses);
  const postal = pickFavoriteByChannel(addresses, 'postal', zurichStoreDate());

  return {
    name: orgName,
    iban: bank?.iban ?? '',
    qrIban, regularIban,
    street: postal?.streetName ?? '',
    buildingNumber: postal?.streetNumber ?? '',
    zip: postal?.zipCode ?? '',
    city: postal?.city ?? '',
    country: postal?.countryCode || 'CH',
  };
}

/**
 * The payee of a person (spec 1.167 §8: a trainer invoices in his own name): `name` as given, IBAN from
 * `bank`, postal parts from `postal`. Pure — an address of the wrong channel, an archived bank address or a
 * missing one yields empty strings, so the caller can refuse a slip without an IBAN.
 */
export function payeeFromAddresses(name: string, bank: AddressModel | undefined, postal: AddressModel | undefined): QrPayee {
  const bankOk = bank?.addressChannel === 'bankaccount' && !bank.isArchived ? bank : undefined;
  const postalOk = postal?.addressChannel === 'postal' ? postal : undefined;
  const { qrIban, regularIban } = pickBankIbans(bankOk ? [bankOk] : []);
  return {
    name,
    iban: bankOk?.iban ?? '',
    qrIban, regularIban,
    street: postalOk?.streetName ?? '',
    buildingNumber: postalOk?.streetNumber ?? '',
    zip: postalOk?.zipCode ?? '',
    city: postalOk?.city ?? '',
    country: postalOk?.countryCode || 'CH',
  };
}

/**
 * Resolve a person's payee from the two addresses the person picked (trainer profile: `bankAddressKey`,
 * `postalAddressKey`). Server-side guard: an address counts only when its `parentKey` is
 * `person.<personKey>` — a profile cannot point the slip at someone else's IBAN. Anything else (missing doc,
 * foreign owner, wrong channel) yields empty strings for that part.
 */
export async function resolvePersonPayee(
  db: Firestore,
  name: string,
  bankAddressKey: string,
  postalAddressKey: string,
  personKey: string,
): Promise<QrPayee> {
  const owner = personKey ? `person.${personKey}` : '';
  const readOwn = async (key: string): Promise<AddressModel | undefined> => {
    if (!key || !owner) return undefined;
    const snap = await db.collection(AddressCollection).doc(key).get();
    if (!snap.exists) return undefined;
    const address = { ...snap.data(), okey: snap.id } as AddressModel;
    return address.parentKey === owner ? address : undefined;
  };
  const [bank, postal] = await Promise.all([readOwn(bankAddressKey), readOwn(postalAddressKey)]);
  return payeeFromAddresses(name, bank, postal);
}

/** Render the QR-bill payment slip as an SVG string. */
export async function renderQrSlipSvg(data: QrSlipData): Promise<string> {
  const { SwissQRBill } = await import('swissqrbill/svg'); // lazy: loading it at module init costs every function instance memory (see init.ts)
  return new SwissQRBill(data as unknown as Data, { language: 'DE' }).toString();
}

/** Wrap the slip SVG in a second A4 page, pinned to the bottom 105 mm. */
export function buildQrSlipPageHtml(svg: string): string {
  return `<div style="page-break-before: always; position: relative; width: 210mm; height: 297mm;">`
    + `<div style="position: absolute; bottom: 0; left: 0; width: 210mm;">${svg}</div>`
    + `</div>`;
}
