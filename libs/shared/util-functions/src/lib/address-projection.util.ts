import { DocumentData, Firestore, Query } from 'firebase-admin/firestore';

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
  isSensitiveScalarChannel,
  OrgCollection,
  PersonCollection,
  PersonModel,
  PersonPrivacyPreferences,
  PrivacyAccessor,
  PrivacySettings,
} from '@okr/shared-models';

import { parseParentKey } from './address.util';

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
 * D-L1 (spec 1.23 §5, finding F1) — **provenance scoping**. Tenancy is enforced on two
 * independent surfaces: `person.tenants[]` drives the projection, `address.tenants[]`
 * drives the raw vault read (`canReadVault` → `belongsToTenant`) and every client query.
 * An address is stamped `[tenantId]` at creation and never gains a second tenant, so its
 * `tenants[]` is a **provenance marker**: which tenant collected this datum.
 *
 * Without this filter, tenant B's directory doc is built from *all* of a shared person's
 * addresses — including the ones collected by tenant A, which B's admins cannot even see
 * raw. That is a cross-tenant delivery against purpose limitation (Art. 5 I b GDPR /
 * revDSG Art. 6 III), and its inverse is the duplicate-vault-doc footgun of D-P4-1: the
 * admin reads raw, does not find the foreign address, and upserts a second one.
 *
 * Cost, accepted at decision time: a person who joins a second tenant starts with an
 * empty directory entry there and supplies their contact data again. An address carrying
 * no tenant at all is invisible on the raw surface too, so it is dropped here as well —
 * consistency with S2 is the whole point.
 */
export function scopeToTenant(addresses: AddressModel[], tenantId: string): AddressModel[] {
  return addresses.filter((address) => (address.tenants ?? []).includes(tenantId));
}

/**
 * Build the materialized `address-directory` doc for one parent × tenant:
 * only addresses collected by that tenant (D-L1) whose effective accessor (§A3)
 * admits `registered` viewers, reduced to one address per channel for persons
 * (see reduceToFavoriteAddresses), with the favorite email/phone/zip lifted into
 * the fav* convenience fields.
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
  // Sensitive scalar channels never belong in the directory: DirectoryEntry has no ssn/dob/dod
  // field, so admitting one would only add a valueless entry to every member's contact list —
  // and it would leak the mere existence of the value. They are served on demand by
  // getAddressView instead. The guard is explicit rather than implied by the accessor, because
  // the dob floor is 'registered' since the §A2 amendment and would otherwise pass this filter.
  const visible = scopeToTenant(addresses, tenantId).filter((address) =>
    !address.isArchived
    && !isSensitiveScalarChannel(address.addressChannel ?? '')
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
 * materialized directory — the two read paths MUST agree on CONTACT channels, or
 * the detail view would show more of a person than the list it was opened from.
 *
 * The sensitive scalar channels are the deliberate exception: this path serves them
 * (that is how the person form hydrates a shared dob), the directory does not
 * materialize them. They are never rendered in the contact list on either path
 * (addresses.store filters them out), so the two cannot visibly disagree.
 *
 * ⚠️ This function applies the viewer tier only. A caller that loads raw `addresses`
 * docs itself must scope them by provenance first — `scopeToTenant` (D-L1), or an
 * equivalent `belongsToTenant` filter as `vcardExport` does. `getProjectedAddresses`
 * below does it for every consumer that goes through the chokepoint.
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

/** What one `writeAddressDirectory` pass did — the D-L1 migration measurement. */
export interface DirectoryWriteResult {
  /** projection docs written — one per tenant on the parent */
  readonly written: number;
  /**
   * (tenant × address) pairs the D-L1 provenance filter kept out of a projection doc,
   * i.e. how much cross-tenant contact data this parent would be served without it.
   * Archived addresses are not counted — they were never projected.
   *
   * A **standing measure, not a migration delta.** It is recomputed from the addresses on
   * every call and does not fall to 0 after the backfill: the filter excludes those rows,
   * it does not delete or re-tag them, so the same pairs are counted again next run. It
   * drops only when the underlying addresses do. (The 1.23 F1 commit message called for
   * 0 afterwards; that reading is wrong and cost one round of "did the rebuild fail?".)
   */
  readonly crossTenant: number;
}

/**
 * (Re)write the `address-directory` projection docs of one parent: one doc per
 * tenant on the parent, stale/orphaned docs deleted. Idempotent — safe to call
 * from triggers and from the rebuild backfill.
 */
export async function writeAddressDirectory(firestore: Firestore, parentKey: string): Promise<DirectoryWriteResult> {
  const empty: DirectoryWriteResult = { written: 0, crossTenant: 0 };
  const loaded = await loadParentAndAddresses(firestore, parentKey);
  if (!loaded) return empty;
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
  if (!parent) return empty;

  let crossTenant = 0;
  for (const tenantId of tenants) {
    crossTenant += addresses.filter((a) => !a.isArchived && !(a.tenants ?? []).includes(tenantId)).length;
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
  return { written: tenants.length, crossTenant };
}

/** Iterate a collection in id-ordered pages; runs `fn` per doc id. Returns docs seen. */
async function forEachDocId(base: Query<DocumentData>, fn: (id: string) => Promise<unknown>, batch = 400): Promise<number> {
  let last: string | undefined;
  let seen = 0;
  for (;;) {
    let q = base.orderBy('__name__').limit(batch);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      await fn(doc.id);
      seen++;
    }
    last = snap.docs[snap.docs.length - 1].id;
    if (snap.size < batch) break;
  }
  return seen;
}

/**
 * Rebuild every `address-directory` projection of one tenant. The tenant's
 * `AppConfig.PrivacySettings` floors are inputs to the projection, so a tenant that
 * tightens `showEmail` (etc.) must have its projections recomputed — otherwise the
 * stricter setting does not reach members until each parent's next address write.
 * Used by the app-config trigger and available for targeted backfills.
 */
export async function rebuildDirectoryForTenant(
  firestore: Firestore,
  tenantId: string,
): Promise<{ persons: number; orgs: number; crossTenantAddresses: number; parentsAffected: number }> {
  let crossTenantAddresses = 0;
  let parentsAffected = 0;
  const tally = async (parentKey: string) => {
    const { crossTenant } = await writeAddressDirectory(firestore, parentKey);
    crossTenantAddresses += crossTenant;
    if (crossTenant > 0) parentsAffected++;
  };
  const persons = await forEachDocId(
    firestore.collection(PersonCollection).where('tenants', 'array-contains', tenantId),
    (id) => tally(`person.${id}`));
  const orgs = await forEachDocId(
    firestore.collection(OrgCollection).where('tenants', 'array-contains', tenantId),
    (id) => tally(`org.${id}`));
  return { persons, orgs, crossTenantAddresses, parentsAffected };
}

/**
 * D8 chokepoint for Cloud-Function consumers (publicApi, vCard, SRV, replication,
 * RAG, QR-slip): privacy-filtered addresses of one parent for a viewer tier.
 * `tenantId` selects the tenant floor **and the address provenance** (D-L1) and is
 * **required**: it used to default to `parent.tenants[0]`, which silently gave a
 * dual-tenant org (`['bkg','kring']`) bkg provenance wherever the caller forgot it
 * (spec 1.26 C1 §6, follow-up (b)). Pass `''` only for a parent with no tenant.
 */
export async function getProjectedAddresses(
  firestore: Firestore,
  parentKey: string,
  viewerAccessor: PrivacyAccessor,
  tenantId: string,
): Promise<AddressModel[]> {
  const loaded = await loadParentAndAddresses(firestore, parentKey);
  if (!loaded || !loaded.parent) return [];
  const { parentType, parent, addresses } = loaded;
  const effectiveTenant = tenantId;
  const settings = effectiveTenant ? await loadPrivacySettings(firestore, effectiveTenant) : undefined;
  // D-L1: a parent with no tenant at all has no provenance to scope by — it also has no
  // tenant floor and no viewer, so leaving the set unfiltered changes nothing.
  const scoped = effectiveTenant ? scopeToTenant(addresses, effectiveTenant) : addresses;
  return projectAddressesForViewer(
    scoped, viewerAccessor, parentType,
    parentType === 'person' ? (parent as Partial<PersonPrivacyPreferences>) : undefined,
    settings,
  );
}
