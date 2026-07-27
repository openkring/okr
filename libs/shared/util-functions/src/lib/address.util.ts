import { Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

import { AddressCollection, AddressModel, OrgCollection, PersonCollection } from '@okr/shared-models';

/** The parsed halves of an address `parentKey` (`person.<okey>` / `org.<okey>`). */
export interface ParsedParentKey {
  parentType: 'person' | 'org';
  parentId: string;
  parentCollection: typeof PersonCollection | typeof OrgCollection;
}

/**
 * Split an address `parentKey` into its type and id. Returns undefined for any
 * other prefix — an address whose parent is neither a person nor an org has no
 * replication target.
 */
export function parseParentKey(parentKey: string): ParsedParentKey | undefined {
  if (parentKey?.startsWith('person.')) {
    return { parentType: 'person', parentId: parentKey.substring('person.'.length), parentCollection: PersonCollection };
  }
  if (parentKey?.startsWith('org.')) {
    return { parentType: 'org', parentId: parentKey.substring('org.'.length), parentCollection: OrgCollection };
  }
  return undefined;
}

/**
 * The LIVE vault contents of one parent: every address doc minus the archived ones.
 *
 * Archived is the app's delete — `FirestoreService.deleteModel` sets `isArchived`
 * rather than removing the doc — so every replication target derived from the vault
 * MUST be derived from this list, or "deleting" an address leaves its replica behind
 * (and makes `persons.favZipCode` disagree with the `address-directory` projection,
 * which has always filtered archived out).
 */
export async function getActiveAddresses(firestore: Firestore, parentKey: string): Promise<AddressModel[]> {
  const snapshot = await firestore.collection(AddressCollection).where('parentKey', '==', parentKey).get();
  return snapshot.docs
    .map((doc) => ({ ...doc.data(), okey: doc.id } as AddressModel))
    .filter((address) => !address.isArchived);
}

/**
 * The value of a sensitive scalar channel (ssn/dob/dod) held in the vault, `''` when
 * the person has none. Scalar channels are one-per-person by contract, but nothing
 * enforces that across documents, so pick deterministically (lowest okey) and log the
 * duplicates instead of letting whichever doc happened to be written last decide.
 */
export function getScalarChannelValue(addresses: AddressModel[], channel: 'ssn' | 'dob' | 'dod'): string {
  const candidates = addresses
    .filter((address) => address.addressChannel === channel && (address[channel] ?? '') !== '')
    .sort((a, b) => (a.okey ?? '').localeCompare(b.okey ?? ''));
  if (candidates.length > 1) {
    logger.warn(`getScalarChannelValue: ${candidates.length} '${channel}' addresses for ${candidates[0].parentKey} — using ${candidates[0].okey}`,
      { okeys: candidates.map((a) => a.okey) });
  }
  return candidates[0]?.[channel] ?? '';
}

/**
 * The zip code of the parent's favorite postal address ('' when there is none).
 * Favorite-only by design: unlike the directory projection — which falls back to the
 * first non-CC address so a person who never set a favorite still stays reachable —
 * `favZipCode` is a declared preference feeding the search index and the QR slip.
 */
export function getFavoriteZipCode(addresses: AddressModel[]): string {
  return addresses.find((address) => address.addressChannel === 'postal' && address.isFavorite)?.zipCode ?? '';
}

/**
 * Replicate the favorite postal zip code onto the parent document (person or org).
 * favEmail/favPhone are NOT replicated (spec 1.19 Phase 4 strip) — contact data is
 * served by the address-directory projection instead.
 *
 * The write is guarded: a person write fans out into ~6 relation queries via
 * onPersonChange, so an unconditional update on every address write (including
 * ssn/dob/email writes that cannot affect a zip code) is pure amplification.
 *
 * @param firestore a handle to the Firestore database
 * @param parentKey the address parent (`person.<okey>` / `org.<okey>`)
 * @param addresses the parent's live addresses (see getActiveAddresses)
 */
export async function updateFavoriteZipCode(firestore: Firestore, parentKey: string, addresses: AddressModel[]): Promise<void> {
  const parsed = parseParentKey(parentKey);
  if (!parsed) return;
  const { parentCollection, parentId } = parsed;

  try {
    const favZipCode = getFavoriteZipCode(addresses);
    const ref = firestore.doc(`${parentCollection}/${parentId}`);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      logger.info(`updateFavoriteZipCode: ${parentCollection}/${parentId} does not exist — nothing to replicate`);
      return;
    }
    if (snapshot.data()?.['favZipCode'] === favZipCode) return;
    await ref.update({ favZipCode });
    logger.info(`Successfully updated favorite zip code for ${parentCollection}/${parentId}`, { favZipCode });
  } catch (error) {
    logger.error(`Error updating ${parentCollection}/${parentId}:`, error);
  }
}
