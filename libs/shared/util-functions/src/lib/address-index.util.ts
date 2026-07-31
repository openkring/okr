import { Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

import { AddressCollection, AddressModel, OrgModel, PersonModel } from '@okr/shared-models';
import { getFullName, setIndexOwnerName } from '@okr/shared-util-core';

import { parseParentKey } from './address.util';

/**
 * Keep the `o:<ownerName>` segment of an address search index current.
 *
 * The address list groups its rows by owner, so it must be searchable by owner
 * name — but only the server can hold that name: the client index is written per
 * address, and a person or org rename would leave every one of that owner's
 * address indexes stale. `onAddressChange` fills the segment on write,
 * `onPersonChange`/`onOrgChange` refresh it on rename.
 *
 * Only the `o:` segment is touched. Rebuilding the whole index server-side would
 * mean importing the client's `getAddressIndex`, which reaches `formatIban` in
 * `@okr/shared-util-angular` and would drag Angular into the functions bundle.
 */

/**
 * Whether a write moved nothing but the `index` field.
 *
 * `syncAddressOwnerName` writes back into the collection whose trigger called it,
 * so every client address write now produces a second invocation. Nothing
 * downstream (favorites, favZipCode, the directory projection, the birth/death
 * year replicas) derives from `index`, so that second pass has no work to do —
 * this lets `onAddressChange` return before redoing all of it.
 *
 * Compares field-by-field on sorted keys rather than raw JSON: address documents
 * are flat scalars, but Firestore gives no key-order guarantee between the before
 * and after snapshots.
 */
export function isIndexOnlyChange(before: AddressModel, after: AddressModel): boolean {
  const normalize = (a: Record<string, unknown>) => JSON.stringify(
    Object.keys(a).filter((k) => k !== 'index').sort().map((k) => [k, a[k]]));
  return normalize(before as unknown as Record<string, unknown>)
      === normalize(after as unknown as Record<string, unknown>);
}

/**
 * The display name of an address's parent: `firstName lastName` for a person,
 * `name` for an org. Returns '' when the parent is missing or of another type —
 * an unresolvable owner must leave the segment empty, never stale.
 */
export async function getOwnerName(firestore: Firestore, parentKey: string): Promise<string> {
  const parsed = parseParentKey(parentKey);
  if (!parsed) return '';
  const snapshot = await firestore.collection(parsed.parentCollection).doc(parsed.parentId).get();
  if (!snapshot.exists) return '';
  const data = snapshot.data();
  if (parsed.parentType === 'person') {
    const person = data as PersonModel;
    return getFullName(person?.firstName, person?.lastName);
  }
  return (data as OrgModel)?.name ?? '';
}

/**
 * Write the owner segment onto ONE address document.
 *
 * Returns false when the index is already correct — that read-compare is what
 * stops the recursion, since this writes to the very collection whose trigger
 * called it (same pattern as demoteFavorites).
 */
export async function syncAddressOwnerName(
  firestore: Firestore, addressOkey: string, address: AddressModel, ownerName?: string
): Promise<boolean> {
  const name = ownerName ?? await getOwnerName(firestore, address.parentKey);
  const index = setIndexOwnerName(address.index ?? '', name);
  if (index === address.index) return false;
  await firestore.collection(AddressCollection).doc(addressOkey).update({ index });
  logger.info(`address ${addressOkey}: index owner segment -> "${name}"`);
  return true;
}

/**
 * Refresh the owner segment on EVERY address of one parent — the rename path.
 *
 * Archived addresses are included on purpose: the admin list can surface them
 * via its archived toggle, so an archived doc left with a stale owner name would
 * silently drop out of that search.
 */
export async function syncOwnerNameOnAddresses(firestore: Firestore, parentKey: string): Promise<number> {
  const ownerName = await getOwnerName(firestore, parentKey);
  const snapshot = await firestore.collection(AddressCollection).where('parentKey', '==', parentKey).get();
  let updated = 0;
  for (const doc of snapshot.docs) {
    const address = { ...doc.data(), okey: doc.id } as AddressModel;
    if (await syncAddressOwnerName(firestore, doc.id, address, ownerName)) updated++;
  }
  if (updated > 0) logger.info(`${parentKey}: refreshed the owner segment on ${updated} address index(es)`);
  return updated;
}
