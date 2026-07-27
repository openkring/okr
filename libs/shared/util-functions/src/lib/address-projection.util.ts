import { Firestore } from 'firebase-admin/firestore';

import {
  accessorAllows,
  AddressCollection,
  AddressDirectoryCollection,
  AddressDirectoryModel,
  AddressModel,
  AppConfigCollection,
  DirectoryEntry,
  getAddressDirectoryKey,
  getEffectiveAccessorForAddress,
  OrgCollection,
  PersonCollection,
  PersonModel,
  PersonPrivacyPreferences,
  PrivacyAccessor,
  PrivacySettings,
} from '@okr/shared-models';

/**
 * The shared projection module (spec 1.19 Phase 4, D8): the ONE chokepoint through
 * which every Cloud Function and the directory trigger derive privacy-filtered
 * address views. Never hand raw `addresses` docs to a consumer — route it here.
 */

/**
 * Whitelist copy of one address into a DirectoryEntry. Copies exactly the
 * DirectoryEntry fields — never spread the raw doc (a spread is how `iban`,
 * `ssn`, or `dob` would leak into the registered-readable projection).
 */
export function toDirectoryEntry(address: AddressModel): DirectoryEntry {
  return {
    addressOkey: address.okey ?? '',
    addressChannel: address.addressChannel ?? '',
    addressChannelLabel: address.addressChannelLabel ?? '',
    addressUsage: address.addressUsage ?? '',
    addressUsageLabel: address.addressUsageLabel ?? '',
    isFavorite: address.isFavorite ?? false,
    isCc: address.isCc ?? false,
    email: address.email ?? '',
    phone: address.phone ?? '',
    streetName: address.streetName ?? '',
    streetNumber: address.streetNumber ?? '',
    addressValue2: address.addressValue2 ?? '',
    zipCode: address.zipCode ?? '',
    city: address.city ?? '',
    countryCode: address.countryCode ?? '',
    url: address.url ?? '',
  };
}

/**
 * Whitelist copy of one address onto a fresh AddressModel: only fields declared
 * on the model survive (legacy/unknown Firestore keys are dropped).
 */
function toSanitizedAddress(address: AddressModel): AddressModel {
  const copy = new AddressModel(address.tenants?.[0] ?? '');
  for (const key of Object.keys(copy) as (keyof AddressModel)[]) {
    const value = address[key];
    if (value !== undefined) {
      (copy as Record<keyof AddressModel, unknown>)[key] = value;
    }
  }
  copy.tenants = [...(address.tenants ?? [])];
  return copy;
}

/**
 * Reduce a person's addresses to ONE per contact channel for below-privileged
 * viewers (decided 2026-07-27): a member sees the address the person flagged
 * `isFavorite` — labelled "shared with members" in the address form — and not the
 * rest of their contact catalogue. Showing every registered-visible address leaks
 * by inference (the work address names the employer, the second postal address the
 * holiday flat), and the `usage*` flags are per channel CLASS, so they give the
 * person no way to share one email while hiding another. This is that lever.
 *
 * Fallback: when no address of a channel is flagged, the first non-CC one wins.
 * Nothing enforces the flag across documents (a per-address Vest suite cannot see
 * its siblings), so without the fallback every person who never set a favorite
 * would silently drop out of the directory and become unreachable.
 *
 * CC addresses are never the member-facing one: they exist for privileged
 * correspondence and are read raw at that tier, not through this projection.
 *
 * Orgs are deliberately NOT reduced — org contact data is intentionally public and
 * its multiple channels (Sekretariat, Bootshaus, Kasse) are all meant to be found.
 */
export function reduceToFavoriteAddresses(addresses: AddressModel[]): AddressModel[] {
  const byChannel = new Map<string, AddressModel[]>();
  for (const address of addresses) {
    const channel = address.addressChannel ?? '';
    byChannel.set(channel, [...(byChannel.get(channel) ?? []), address]);
  }
  const reduced: AddressModel[] = [];
  for (const candidates of byChannel.values()) {
    const shareable = candidates.filter((a) => !a.isCc);
    const picked = shareable.find((a) => a.isFavorite) ?? shareable[0];
    if (picked) reduced.push(picked);
  }
  return reduced;
}

/**
 * Build the materialized `address-directory` doc for one parent × tenant:
 * only addresses whose effective accessor (§A3) admits `registered` viewers,
 * reduced to one address per channel for persons (see reduceToFavoriteAddresses),
 * with the favorite email/phone/zip lifted into the fav* convenience fields.
 */
export function buildDirectoryDoc(
  tenantId: string,
  parentKey: string,
  parentType: 'person' | 'org',
  addresses: AddressModel[],
  person?: Partial<PersonPrivacyPreferences>,
  settings?: Partial<PrivacySettings>,
): AddressDirectoryModel {
  const doc = new AddressDirectoryModel(tenantId);
  doc.okey = getAddressDirectoryKey(tenantId, parentKey);
  doc.parentKey = parentKey;
  doc.parentType = parentType;
  const visible = addresses.filter((address) =>
    !address.isArchived
    && accessorAllows('registered', getEffectiveAccessorForAddress(address, parentType, person, settings)));
  const projected = parentType === 'person' ? reduceToFavoriteAddresses(visible) : visible;
  doc.entries = projected.map(toDirectoryEntry);
  // for persons `projected` holds at most one address per channel (the favorite or
  // its fallback), so the channel lookup already IS the favorite
  const favorite = (channel: string) => parentType === 'person'
    ? projected.find((a) => a.addressChannel === channel)
    : projected.find((a) => a.isFavorite && a.addressChannel === channel);
  doc.favEmail = favorite('email')?.email ?? '';
  doc.favPhone = favorite('phone')?.phone ?? '';
  doc.favZipCode = favorite('postal')?.zipCode ?? '';
  return doc;
}

/**
 * Per-call variant of the projection for `getAddressView` and CF consumers:
 * returns whitelist-copied address docs whose effective accessor admits the
 * viewer tier. Docs the viewer may not see are dropped entirely (stricter than
 * field-blanking — no shell docs leak existence metadata).
 *
 * Below-privileged viewers get the same one-per-channel reduction as the
 * materialized directory — the two read paths MUST agree, or the detail view
 * would show more of a person than the list it was opened from.
 */
export function projectAddressesForViewer(
  addresses: AddressModel[],
  viewerAccessor: PrivacyAccessor,
  parentType: 'person' | 'org',
  person?: Partial<PersonPrivacyPreferences>,
  settings?: Partial<PrivacySettings>,
): AddressModel[] {
  const visible = addresses.filter((address) =>
    !address.isArchived
    && accessorAllows(viewerAccessor, getEffectiveAccessorForAddress(address, parentType, person, settings)));
  const projected = parentType === 'person' && !accessorAllows(viewerAccessor, 'privileged')
    ? reduceToFavoriteAddresses(visible)
    : visible;
  return projected.map(toSanitizedAddress);
}

function parseParentKey(parentKey: string): { parentType: 'person' | 'org'; parentId: string } | undefined {
  if (parentKey.startsWith('person.')) return { parentType: 'person', parentId: parentKey.substring('person.'.length) };
  if (parentKey.startsWith('org.')) return { parentType: 'org', parentId: parentKey.substring('org.'.length) };
  return undefined;
}

async function loadParentAndAddresses(firestore: Firestore, parentKey: string): Promise<{
  parentType: 'person' | 'org';
  parent: FirebaseFirestore.DocumentData | undefined;
  addresses: AddressModel[];
} | undefined> {
  const parsed = parseParentKey(parentKey);
  if (!parsed) return undefined;
  const parentSnap = await firestore
    .collection(parsed.parentType === 'person' ? PersonCollection : OrgCollection)
    .doc(parsed.parentId).get();
  const addressSnap = await firestore.collection(AddressCollection)
    .where('parentKey', '==', parentKey).get();
  const addresses = addressSnap.docs.map((d) => ({ ...d.data(), okey: d.id } as AddressModel));
  return { parentType: parsed.parentType, parent: parentSnap.exists ? parentSnap.data() : undefined, addresses };
}

async function loadPrivacySettings(firestore: Firestore, tenantId: string): Promise<Partial<PrivacySettings> | undefined> {
  const snap = await firestore.collection(AppConfigCollection).doc(tenantId).get();
  // AppConfig carries the show* accessors flat on the doc — structurally a Partial<PrivacySettings>
  return snap.exists ? (snap.data() as Partial<PrivacySettings>) : undefined;
}

/**
 * (Re)write the `address-directory` projection docs of one parent: one doc per
 * tenant on the parent, stale/orphaned docs deleted. Idempotent — safe to call
 * from triggers and from the rebuild backfill.
 */
export async function writeAddressDirectory(firestore: Firestore, parentKey: string): Promise<void> {
  const loaded = await loadParentAndAddresses(firestore, parentKey);
  if (!loaded) return;
  const { parentType, parent, addresses } = loaded;
  const tenants: string[] = parent?.['tenants'] ?? [];

  // remove projections for tenants no longer on the parent (or all, when the parent is gone)
  const staleSnap = await firestore.collection(AddressDirectoryCollection)
    .where('parentKey', '==', parentKey).get();
  for (const doc of staleSnap.docs) {
    const docTenant: string = (doc.data()['tenants'] ?? [])[0];
    if (!parent || !tenants.includes(docTenant)) {
      await doc.ref.delete();
    }
  }
  if (!parent) return;

  for (const tenantId of tenants) {
    const settings = await loadPrivacySettings(firestore, tenantId);
    const dirDoc = buildDirectoryDoc(
      tenantId, parentKey, parentType, addresses,
      parentType === 'person' ? (parent as Partial<PersonModel>) : undefined,
      settings,
    );
    // strip okey before write (Firestore convention: okey is the doc id)
    const { okey, ...data } = dirDoc as AddressDirectoryModel & { okey: string };
    void okey;
    await firestore.collection(AddressDirectoryCollection).doc(dirDoc.okey).set(JSON.parse(JSON.stringify(data)));
  }
}

/**
 * D8 chokepoint for Cloud-Function consumers (publicApi, vCard, SRV, replication,
 * RAG, QR-slip): privacy-filtered addresses of one parent for a viewer tier.
 * `tenantId` selects the tenant floor; defaults to the parent's first tenant.
 */
export async function getProjectedAddresses(
  firestore: Firestore,
  parentKey: string,
  viewerAccessor: PrivacyAccessor,
  tenantId?: string,
): Promise<AddressModel[]> {
  const loaded = await loadParentAndAddresses(firestore, parentKey);
  if (!loaded || !loaded.parent) return [];
  const { parentType, parent, addresses } = loaded;
  const effectiveTenant = tenantId ?? (parent['tenants'] ?? [])[0];
  const settings = effectiveTenant ? await loadPrivacySettings(firestore, effectiveTenant) : undefined;
  return projectAddressesForViewer(
    addresses, viewerAccessor, parentType,
    parentType === 'person' ? (parent as Partial<PersonPrivacyPreferences>) : undefined,
    settings,
  );
}
