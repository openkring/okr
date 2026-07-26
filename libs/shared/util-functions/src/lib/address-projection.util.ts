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
 * Build the materialized `address-directory` doc for one parent × tenant:
 * only addresses whose effective accessor (§A3) admits `registered` viewers,
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
  doc.entries = visible.map(toDirectoryEntry);
  doc.favEmail = visible.find((a) => a.isFavorite && a.addressChannel === 'email')?.email ?? '';
  doc.favPhone = visible.find((a) => a.isFavorite && a.addressChannel === 'phone')?.phone ?? '';
  doc.favZipCode = visible.find((a) => a.isFavorite && a.addressChannel === 'postal')?.zipCode ?? '';
  return doc;
}

/**
 * Per-call variant of the projection for `getAddressView` and CF consumers:
 * returns whitelist-copied address docs whose effective accessor admits the
 * viewer tier. Docs the viewer may not see are dropped entirely (stricter than
 * field-blanking — no shell docs leak existence metadata).
 */
export function projectAddressesForViewer(
  addresses: AddressModel[],
  viewerAccessor: PrivacyAccessor,
  parentType: 'person' | 'org',
  person?: Partial<PersonPrivacyPreferences>,
  settings?: Partial<PrivacySettings>,
): AddressModel[] {
  return addresses
    .filter((address) =>
      !address.isArchived
      && accessorAllows(viewerAccessor, getEffectiveAccessorForAddress(address, parentType, person, settings)))
    .map(toSanitizedAddress);
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
