import type { Firestore } from 'firebase-admin/firestore';

import { ADDRESS_REGISTER_TENANT } from '@okr/shared-constants';
import { AddressModel, BaseProperty, LocationCollection, LocationModel } from '@okr/shared-models';

import { SwissAddressHit } from './swisstopo.util';

/**
 * Spec 1.164 §5.1: postal addresses live once each in the shared address register — `locations`
 * docs of type 'address' whose only tenant is the register marker. Clients never write them (the
 * rules allow a `get` by key and nothing else); these helpers run in Cloud Functions (Admin SDK).
 */

/** An address typed by hand (abroad, new building, or not found by swisstopo). Never deduplicated. */
export interface ManualAddressInput {
  streetName: string;
  streetNumber: string;
  zipCode: string;
  city: string;
  countryCode: string;
}

export type RegisterAddressInput = SwissAddressHit | ManualAddressInput;

export type AddressSnapshot = Pick<AddressModel, 'streetName' | 'streetNumber' | 'zipCode' | 'city' | 'countryCode'>;

function isSwissHit(input: RegisterAddressInput): input is SwissAddressHit {
  return 'egaid' in input;
}

/** The register lookup property. Exactly these two keys: array-contains matches the whole map. */
function egaidProperty(egaid: string): BaseProperty {
  return { key: 'egaid', value: String(egaid) };
}

/** «Seestrasse 12, 8712 Stäfa» — empty parts are left out. */
function addressText(a: AddressSnapshot): string {
  const street = [a.streetName, a.streetNumber].map((s) => s.trim()).filter(Boolean).join(' ');
  const place = [a.zipCode, a.city].map((s) => s.trim()).filter(Boolean).join(' ');
  return [street, place].filter(Boolean).join(', ');
}

/** True when the location doc belongs to the address register (spec 1.164), not to a club. */
export function isRegisterLocation(data: { tenants?: string[] } | undefined): boolean {
  return !!data?.tenants?.includes(ADDRESS_REGISTER_TENANT);
}

/** The register location for an address (pure, no okey). */
export function buildRegisterLocation(input: RegisterAddressInput): LocationModel {
  const swiss = isSwissHit(input);
  const countryCode = swiss ? 'CH' : input.countryCode.trim().toUpperCase();
  const text = addressText({ ...input, countryCode });
  const loc = new LocationModel(ADDRESS_REGISTER_TENANT);
  loc.type = 'address';
  loc.name = text;
  loc.address = text;
  loc.latitude = swiss ? input.latitude : 0;
  loc.longitude = swiss ? input.longitude : 0;
  loc.properties = [
    ...(swiss ? [egaidProperty(input.egaid)] : []),
    { key: 'countryCode', value: countryCode },
    { key: 'validated', value: swiss ? 'swisstopo' : 'manual' },
  ];
  return loc;
}

/** A plain object without okey: the Admin SDK rejects class instances. */
function toDoc(loc: LocationModel): Record<string, unknown> {
  const { okey: _okey, ...data } = { ...loc };
  return data;
}

/**
 * Returns the okey of the register location for this address. A swisstopo hit is deduplicated by
 * EGAID inside a transaction (find, else create); a manual address always gets a new location.
 */
export async function findOrCreateRegisterLocation(db: Firestore, input: RegisterAddressInput): Promise<string> {
  const data = toDoc(buildRegisterLocation(input));
  const col = db.collection(LocationCollection);
  if (!isSwissHit(input)) {
    const ref = col.doc();
    await ref.set(data);
    return ref.id;
  }
  const query = col.where('properties', 'array-contains', egaidProperty(input.egaid));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(query);
    const found = snap.docs.find((d) => isRegisterLocation(d.data() as { tenants?: string[] }));
    if (found) return found.id;
    const ref = col.doc();
    tx.set(ref, data);
    return ref.id;
  });
}

function propertyValue(loc: LocationModel, key: string): string {
  const p = (loc.properties ?? []).find((x) => x.key === key);
  return p ? String(p.value) : '';
}

/**
 * The inline address fields of a postal row, read back from the register location text
 * («Seestrasse 12, 8712 Stäfa»). The street number is the last word of the street part when it
 * starts with a digit; the zip code is the first word of the place part when it contains a digit.
 */
export function snapshotFromLocation(loc: LocationModel): AddressSnapshot {
  const text = loc.address || loc.name || '';
  const cut = text.lastIndexOf(', ');
  const streetPart = cut >= 0 ? text.slice(0, cut) : text;
  const placePart = cut >= 0 ? text.slice(cut + 2) : '';
  const street = /^(.*?)\s+(\d\S*)$/.exec(streetPart.trim());
  const place = /^(\S*\d\S*)(?:\s+(.*))?$/.exec(placePart.trim());
  return {
    streetName: street ? street[1] : streetPart.trim(),
    streetNumber: street ? street[2] : '',
    zipCode: place ? place[1] : '',
    city: place ? (place[2] ?? '') : placePart.trim(),
    countryCode: propertyValue(loc, 'countryCode'),
  };
}
