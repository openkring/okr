/**
 * Backfill / full rebuild of the `address-directory` projection (privacy spec 1.19 Phase 4).
 * Local admin-SDK twin of the `rebuildAddressDirectory` callable — same idempotent logic,
 * run directly against production Firestore (no AppCheck/auth ceremony needed).
 *
 * For every person and org it writes one `address-directory/{tenantId_parentKey}` doc per
 * tenant, containing ONLY the addresses whose effective accessor (§A3:
 * stricterAccessor(channelFloor, personPreference, tenantFloor)) admits `registered`
 * viewers. ssn/dob/bankaccount can never appear (privileged channel floors). Stale
 * projection docs (tenant removed, parent deleted) are removed.
 *
 * AUTHORITATIVE LOGIC: libs/shared/util-functions/src/lib/address-projection.util.ts
 * (+ libs/shared/models/src/lib/privacy.model.ts). This script mirrors it 1:1 for
 * standalone execution — if the formula changes there, update this mirror.
 *
 * ⚠️ THIS MIRROR HAS SILENTLY DRIFTED BEFORE. On 2026-07-28 it still lacked the
 * favorite-only reduction (D-P4-6) and the `dod` channel floor, so running it would
 * have REVERTED the reduction for every parent and admitted dod rows into the
 * member-facing projection. A mirror that lags is worse than no mirror: it looks
 * authoritative and writes stale data over good data.
 *
 * Before trusting it, diff it against the real thing. The reliable way to run the
 * authoritative code standalone is to bundle it (esbuild resolves the @okr/* aliases
 * from tsconfig.base.json, so no mirror is involved at all):
 *
 *   npx esbuild entry.ts --bundle --platform=node --format=cjs \
 *     --tsconfig=tsconfig.base.json --external:firebase-admin --outfile=dist/tmp/run.cjs
 *   node dist/tmp/run.cjs      # output must live inside the repo so firebase-admin resolves
 *
 * where entry.ts imports { writeAddressDirectory } from '@okr/shared-util-functions'.
 *
 * Run with:  node scripts/rebuild-address-directory.mjs --dry     (inspect first)
 *            node scripts/rebuild-address-directory.mjs           (execute)
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ projectId: 'bkaiser-org' });
}
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry');
const DIRECTORY_COLLECTION = 'address-directory';

/* ---------- mirrored privacy formula (see header for the authoritative source) ---------- */

const ACCESSOR_RANK = { public: 0, registered: 1, privileged: 2, admin: 3 };
const CHANNEL_SENSITIVITY_FLOOR = { ssn: 'privileged', dob: 'privileged', dod: 'privileged', bankaccount: 'privileged' };
const CHANNEL_PRIVACY_INPUTS = {
  email:       { usageFlag: 'usageEmail',         tenantFloor: 'showEmail' },
  phone:       { usageFlag: 'usagePhone',         tenantFloor: 'showPhone' },
  postal:      { usageFlag: 'usagePostalAddress', tenantFloor: 'showPostalAddress' },
  dob:         { usageFlag: 'usageDateOfBirth',   tenantFloor: 'showDateOfBirth' },
  // dod has no usage* flag: a deceased person expresses no preference
  dod:         { tenantFloor: 'showDateOfDeath' },
  ssn:         { tenantFloor: 'showTaxId' },
  bankaccount: { tenantFloor: 'showIban' },
};

function privacyUsageToAccessor(usage) {
  return usage === 0 ? 'public' : usage === 2 ? 'privileged' : 'registered';
}
function stricterAccessor(a, b) {
  return ACCESSOR_RANK[a] >= ACCESSOR_RANK[b] ? a : b;
}
function effectiveAccessor(address, parentType, person, settings) {
  const inputs = CHANNEL_PRIVACY_INPUTS[address.addressChannel] ?? {};
  const usage = inputs.usageFlag ? person?.[inputs.usageFlag] : undefined;
  const floor = inputs.tenantFloor ? settings?.[inputs.tenantFloor] : undefined;
  const preference = parentType === 'org' ? 'public' : privacyUsageToAccessor(usage ?? 1);
  const channelFloor = CHANNEL_SENSITIVITY_FLOOR[address.addressChannel] ?? 'public';
  return stricterAccessor(channelFloor, stricterAccessor(preference, floor ?? 'public'));
}

function toDirectoryEntry(a) {
  return {
    addressOkey: a.okey ?? '',
    addressChannel: a.addressChannel ?? '',
    addressChannelLabel: a.addressChannelLabel ?? '',
    addressUsage: a.addressUsage ?? '',
    addressUsageLabel: a.addressUsageLabel ?? '',
    isFavorite: a.isFavorite ?? false,
    isCc: a.isCc ?? false,
    email: a.email ?? '',
    phone: a.phone ?? '',
    streetName: a.streetName ?? '',
    streetNumber: a.streetNumber ?? '',
    addressValue2: a.addressValue2 ?? '',
    zipCode: a.zipCode ?? '',
    city: a.city ?? '',
    countryCode: a.countryCode ?? '',
    url: a.url ?? '',
  };
}

/**
 * Reduce a PERSON's addresses to ONE per channel (D-P4-6, 2026-07-27): the favorite,
 * else the first non-CC one. Orgs are deliberately NOT reduced.
 * Mirror of reduceToFavoriteAddresses in address-projection.util.ts.
 */
function reduceToFavoriteAddresses(addresses) {
  const byChannel = new Map();
  for (const a of addresses) {
    const ch = a.addressChannel ?? '';
    byChannel.set(ch, [...(byChannel.get(ch) ?? []), a]);
  }
  const reduced = [];
  for (const candidates of byChannel.values()) {
    const shareable = candidates.filter((a) => !a.isCc);
    const picked = shareable.find((a) => a.isFavorite) ?? shareable[0];
    if (picked) reduced.push(picked);
  }
  return reduced;
}

function buildDirectoryDoc(tenantId, parentKey, parentType, addresses, person, settings) {
  const visible = addresses.filter((a) =>
    !a.isArchived && ACCESSOR_RANK['registered'] >= ACCESSOR_RANK[effectiveAccessor(a, parentType, person, settings)]);
  const projected = parentType === 'person' ? reduceToFavoriteAddresses(visible) : visible;
  // for persons `projected` holds at most one address per channel, so the channel
  // lookup already IS the favorite; orgs still require the explicit flag
  const favorite = (channel) => parentType === 'person'
    ? projected.find((a) => a.addressChannel === channel)
    : projected.find((a) => a.isFavorite && a.addressChannel === channel);
  return {
    parentKey,
    parentType,
    favEmail: favorite('email')?.email ?? '',
    favPhone: favorite('phone')?.phone ?? '',
    favZipCode: favorite('postal')?.zipCode ?? '',
    entries: projected.map(toDirectoryEntry),
    isArchived: false,
    tenants: [tenantId],
    index: '',
  };
}

/* ---------- rebuild ---------- */

const settingsCache = new Map();
async function loadSettings(tenantId) {
  if (!settingsCache.has(tenantId)) {
    const snap = await db.collection('app-config').doc(tenantId).get();
    settingsCache.set(tenantId, snap.exists ? snap.data() : undefined);
  }
  return settingsCache.get(tenantId);
}

const stats = { parents: 0, written: 0, deleted: 0, entries: 0 };

async function rebuildParent(parentType, parentId, parent) {
  const parentKey = `${parentType}.${parentId}`;
  const tenants = Array.isArray(parent.tenants) ? parent.tenants : [];
  const addrSnap = await db.collection('addresses').where('parentKey', '==', parentKey).get();
  const addresses = addrSnap.docs.map((d) => ({ ...d.data(), okey: d.id }));

  const staleSnap = await db.collection(DIRECTORY_COLLECTION).where('parentKey', '==', parentKey).get();
  for (const doc of staleSnap.docs) {
    const docTenant = (doc.data().tenants ?? [])[0];
    if (!tenants.includes(docTenant)) {
      stats.deleted++;
      if (!DRY_RUN) await doc.ref.delete();
    }
  }

  for (const tenantId of tenants) {
    const settings = await loadSettings(tenantId);
    const doc = buildDirectoryDoc(tenantId, parentKey, parentType, addresses,
      parentType === 'person' ? parent : undefined, settings);
    stats.written++;
    stats.entries += doc.entries.length;
    if (!DRY_RUN) {
      await db.collection(DIRECTORY_COLLECTION).doc(`${tenantId}_${parentKey}`).set(doc);
    }
  }
  stats.parents++;
}

async function rebuildCollection(collection, parentType) {
  const BATCH = 400;
  let last;
  for (;;) {
    let q = db.collection(collection).orderBy('__name__').limit(BATCH);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      await rebuildParent(parentType, doc.id, doc.data());
    }
    last = snap.docs[snap.docs.length - 1].id;
    if (snap.size < BATCH) break;
  }
}

console.log(`Rebuilding address-directory${DRY_RUN ? ' (DRY RUN — no writes)' : ''} ...`);
await rebuildCollection('persons', 'person');
await rebuildCollection('orgs', 'org');
console.log(`Done: ${stats.parents} parents -> ${stats.written} projection docs (${stats.entries} entries), ${stats.deleted} stale docs deleted.`);
