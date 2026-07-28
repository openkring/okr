/**
 * One-time backfill preceding the strip of the legacy address replicas on orgs
 * (`favStreetName`, `favStreetNumber`, `favCity`, `favCountryCode` — `favZipCode` STAYS).
 *
 * Those four fields are gone from `OrgModel` and no code reads them any more, but ~6 orgs
 * still hold their only postal address there. This script copies each uncovered legacy
 * address into the addresses vault:
 *
 *   orgs.{favStreetName,favStreetNumber,favZipCode,favCity,favCountryCode}
 *     -> addresses doc { addressChannel: 'postal', addressUsage: 'work', parentKey: 'org.<id>' }
 *
 * NON-DESTRUCTIVE: nothing is deleted (that is `strip-org-address-fields.mjs`).
 *
 * Coverage rule (idempotent, re-runnable): an org is already covered when ANY non-archived
 * postal address of that org matches all of its NON-EMPTY legacy values (trimmed,
 * case-insensitive). Empty legacy values never disqualify a match — a street-less address
 * (Postfach / Vereinsadresse) is perfectly valid, so a vault doc carrying only zip/city
 * covers an org that only had zip/city, and an org whose legacy street lives on a
 * NON-favorite postal doc counts as covered too (the favorite may legitimately be a
 * different, street-less address).
 *
 * Nothing-to-preserve rule: an org with no legacy street/number/zip/city is skipped even
 * if it carries a lone `favCountryCode` — a country-only postal address is noise.
 *
 * Favorite rule: the new address becomes `isFavorite: true` only when the org has no other
 * non-archived postal address; otherwise it is created as a non-favorite so an existing
 * (deliberately chosen) favorite is never dethroned.
 *
 * Side effect: each created address fires `onAddressChange`, which rebuilds the org's
 * `address-directory` projection and read-compares `orgs.favZipCode`.
 *
 * Run with:  node scripts/migrate-org-postal-address.mjs --dry   (inspect first)
 *            node scripts/migrate-org-postal-address.mjs         (execute)
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { pathToFileURL } from 'node:url';

if (!getApps().length) {
  initializeApp({ projectId: 'bkaiser-org' });
}
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry') || process.argv.includes('--dry-run');

/** Normalizes a value for comparison: undefined/null -> '', trimmed, lower-cased. */
function norm(value) {
  return (value ?? '').toString().trim().toLowerCase();
}

/** The legacy address carried on the org document. */
export function legacyAddressOf(org) {
  return {
    streetName: (org.favStreetName ?? '').toString().trim(),
    streetNumber: (org.favStreetNumber ?? '').toString().trim(),
    zipCode: (org.favZipCode ?? '').toString().trim(),
    city: (org.favCity ?? '').toString().trim(),
    countryCode: (org.favCountryCode ?? '').toString().trim(),
  };
}

/** True when the legacy values hold an address worth preserving (country alone is not). */
export function hasPreservableAddress(legacy) {
  return !!(legacy.streetName || legacy.streetNumber || legacy.zipCode || legacy.city);
}

/**
 * True when `address` (a non-archived postal vault doc) represents `legacy`: every non-empty
 * legacy field matches. Empty legacy fields are not compared — a street-less Postfach address
 * in the vault still covers an org that never had a street.
 */
export function coversLegacy(address, legacy) {
  for (const field of ['streetName', 'streetNumber', 'zipCode', 'city', 'countryCode']) {
    if (!legacy[field]) continue;
    if (norm(address[field]) !== norm(legacy[field])) return false;
  }
  return true;
}

/** Mirror of getAddressIndex() in @okr/address-util for the postal channel. */
function postalIndex({ streetName, streetNumber, countryCode, zipCode, city }) {
  return `n:${streetName}${streetNumber}${countryCode}${zipCode}${city}`;
}

/** Builds a full AddressModel-shaped plain object (all defaults present, as the service would write). */
function buildPostalAddress(legacy, tenants, parentKey, isFavorite) {
  return {
    addressChannel: 'postal',
    addressChannelLabel: '',
    addressUsage: 'work',
    addressUsageLabel: '',
    email: '',
    phone: '',
    iban: '',
    ssn: '',
    dob: '',
    dod: '',
    streetName: legacy.streetName,
    streetNumber: legacy.streetNumber,
    addressValue2: '',
    zipCode: legacy.zipCode,
    city: legacy.city,
    countryCode: legacy.countryCode,
    url: '',
    isFavorite,
    isCc: false,
    isValidated: false,
    isArchived: false,
    tags: '',
    notes: '',
    tenants,
    index: postalIndex(legacy),
    parentKey,
  };
}

/** Loads all non-archived postal addresses, grouped by parentKey. */
export async function loadPostalByParent(firestore) {
  const snap = await firestore.collection('addresses').where('addressChannel', '==', 'postal').get();
  const byParent = new Map();
  for (const doc of snap.docs) {
    const a = doc.data();
    if (a.isArchived) continue;
    const list = byParent.get(a.parentKey) ?? [];
    list.push({ okey: doc.id, ...a });
    byParent.set(a.parentKey, list);
  }
  return byParent;
}

async function main() {
  const postalByParent = await loadPostalByParent(db);
  const orgs = await db.collection('orgs').get();

  let created = 0;
  let covered = 0;
  let nothingToPreserve = 0;

  for (const doc of orgs.docs) {
    const org = doc.data();
    const legacy = legacyAddressOf(org);
    if (!hasPreservableAddress(legacy)) {
      if (legacy.countryCode) nothingToPreserve++;
      continue;
    }
    const postals = postalByParent.get(`org.${doc.id}`) ?? [];
    if (postals.some((a) => coversLegacy(a, legacy))) {
      covered++;
      continue;
    }
    const isFavorite = postals.length === 0;
    const address = buildPostalAddress(legacy, org.tenants ?? [], `org.${doc.id}`, isFavorite);
    console.log(
      `${DRY_RUN ? '[dry] ' : ''}create postal address for orgs/${doc.id} "${org.name ?? ''}" ` +
        `[${(org.tenants ?? []).join(',')}] fav=${isFavorite} :: ` +
        `"${legacy.streetName}" "${legacy.streetNumber}" "${legacy.zipCode}" "${legacy.city}" "${legacy.countryCode}"`
    );
    if (!DRY_RUN) await db.collection('addresses').add(address);
    created++;
  }

  console.log(
    `\norgs: ${orgs.size} scanned — ${created} postal address(es) ${DRY_RUN ? 'would be ' : ''}created, ` +
      `${covered} already covered by the vault, ${nothingToPreserve} skipped (country code only).`
  );
  if (DRY_RUN) console.log('DRY RUN — nothing was written. Re-run without --dry to execute.');
}

// only run when invoked directly — strip-org-address-fields.mjs imports the coverage helpers
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
  process.exit(0);
}
