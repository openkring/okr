// apps/functions/src/pdf/qr-slip.ts
import type { Firestore } from 'firebase-admin/firestore';
import { SwissQRBill } from 'swissqrbill/svg';
import type { Data } from 'swissqrbill/types';

import { AppConfigCollection, OrgCollection, AddressCollection, AddressModel } from '@okr/shared-models';
import { pickFavoriteByChannel, QrPayee, QrSlipData, scopeToTenant } from '@okr/shared-util-functions';

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
  const postal = pickFavoriteByChannel(addresses, 'postal');

  return {
    name: orgName,
    iban: bank?.iban ?? '',
    street: postal?.streetName ?? '',
    buildingNumber: postal?.streetNumber ?? '',
    zip: postal?.zipCode ?? '',
    city: postal?.city ?? '',
    country: postal?.countryCode || 'CH',
  };
}

/** Render the QR-bill payment slip as an SVG string. */
export function renderQrSlipSvg(data: QrSlipData): string {
  return new SwissQRBill(data as unknown as Data, { language: 'DE' }).toString();
}

/** Wrap the slip SVG in a second A4 page, pinned to the bottom 105 mm. */
export function buildQrSlipPageHtml(svg: string): string {
  return `<div style="page-break-before: always; position: relative; width: 210mm; height: 297mm;">`
    + `<div style="position: absolute; bottom: 0; left: 0; width: 210mm;">${svg}</div>`
    + `</div>`;
}
