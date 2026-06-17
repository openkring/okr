// apps/functions/src/pdf/qr-slip.ts
import type { Firestore } from 'firebase-admin/firestore';
import { SwissQRBill } from 'swissqrbill/svg';
import type { Data } from 'swissqrbill/types';

import { AppConfigCollection, OrgCollection, AddressCollection, AddressModel } from '@bk2/shared-models';
import { pickFavoriteByChannel, QrPayee, QrSlipData } from '@bk2/shared-util-functions';

/**
 * Resolve the payee (creditor) from the owner org: name from the org, IBAN from
 * its favorite bankaccount address, postal address from its favorite postal
 * address. Best-effort — returns empty strings for missing parts; the caller
 * decides whether a missing IBAN is fatal.
 */
export async function resolvePayee(db: Firestore, tenantId: string): Promise<QrPayee> {
  const configSnap = await db.collection(AppConfigCollection).doc(tenantId).get();
  const ownerOrgId = (configSnap.data()?.['ownerOrgId'] as string) || tenantId;

  const orgSnap = await db.collection(OrgCollection).doc(ownerOrgId).get();
  const orgName = (orgSnap.data()?.['name'] as string) ?? '';

  const addrSnap = await db.collection(AddressCollection)
    .where('parentKey', '==', `org.${ownerOrgId}`).get();
  const addresses = addrSnap.docs.map(d => ({ bkey: d.id, ...d.data() }) as AddressModel);

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
