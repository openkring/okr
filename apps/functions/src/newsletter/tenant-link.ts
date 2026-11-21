// apps/functions/src/newsletter/tenant-link.ts
//
// The only-link rule of spec 1.169 §5.4: after a newsletter exit, a person with no other link to the tenant
// is archived (person of this tenant only) or detached (person shared with another tenant).
//
// TENANT_LINK_SOURCES is the one list of what counts as "another link". It sits next to the subject-data
// map (../privacy/subject-data-map.ts) on purpose: when a collection holding a personKey is added there,
// decide here too whether it ties the person to the tenant. When in doubt a collection is included —
// archiving a person too early is the worse error.

import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

import {
  AddressCollection, ApplicationCollection, AssetCollection, BillCollection, BookingCollection, CompetitionLevelCollection,
  ContractCollection, ContractDocumentCollection, CourseCollection, GroupCollection, HouseholdCollection, InvoiceCollection,
  InvoicePositionCollection, LegacyMemberFeeCollection, MemberFeeCollection, MembershipCollection,
  NewsletterSubscriptionCollection, OwnershipCollection, PersonalRelCollection, PersonCollection, ReservationCollection,
  ResponsibilityCollection, SectionCollection, TrainerAgreementCollection, TrainerInvoiceCollection,
  TrainerProfileCollection, TransferCollection, UserCollection, WorkEntryCollection, WorkrelCollection,
} from '@okr/shared-models';

import { toStoreDate } from '../srv/zurich-time';
import { addressReleasePatch, avatarListHolds, isActiveMembership, isActiveSubscription, releaseAction, ReleaseAction } from './tenant-link.logic';

/**
 * One kind of record that ties a person to a tenant. A found document counts only when its `tenants`
 * contains the tenant (and `isLink`, when given, agrees).
 * - `field`: queried by the field that names the person by raw personKey (dotted for an embedded AvatarInfo),
 *   '==' or 'array-contains'; `extra` adds the modelType equality of a polymorphic key, so an org with the
 *   same key never counts.
 * - `scan`: the person sits inside embedded AvatarInfo arrays (`arrays`, not queryable), so the tenant's
 *   documents are read — or, with `bound`, the documents of that equality — and matched in memory.
 * - `docId`: the document id is the personKey.
 */
export type TenantLinkSource =
  | {
    kind: 'field'; collection: string; field: string; op?: '==' | 'array-contains';
    extra?: { field: string; value: string };
    isLink?: (doc: DocumentData, today: string) => boolean;
  }
  | { kind: 'scan'; collection: string; arrays: string[]; bound?: { field: string; value: string } }
  | { kind: 'docId'; collection: string };

type FieldSource = Extract<TenantLinkSource, { kind: 'field' }>;
const byField = (collection: string, field: string, more: Omit<FieldSource, 'kind' | 'collection' | 'field'> = {}): TenantLinkSource =>
  ({ kind: 'field', collection, field, ...more });
const byPerson = (collection: string, avatar: string): TenantLinkSource =>
  byField(collection, `${avatar}.key`, { extra: { field: `${avatar}.modelType`, value: 'person' } });

/**
 * Every record that ties a person to a tenant, checked against every row of the subject-data map
 * (../privacy/subject-data-map.ts, 2026-11-21, `households` of spec 1.168 included). Rows left out on purpose, with the reason:
 * - `persons`, `addresses`, `address-directory`, `avatars`, `contactsDavBooks/cards`: the person's own data
 *   (or a copy of it), released together with the person.
 * - `sendings`, `notices`: every newsletter issue writes them, so they would keep every subscriber forever.
 * - `tasks`, `comments`, `invitations`, `calevents`, `trips`, `trips/tracker`, `stats_members`, `meetings`,
 *   `approvals`, `projects`: activity around a person, not a relationship with the tenant (the subscriber
 *   tasks of this feature are tasks too).
 * - `docs`, `whiteboards`, `instruments`, `folders`, `websites`, `websites/publishes`, `file-transfers`,
 *   `file-transfer-events`, `ratings`: content a member wrote or sent in the app — the author has a login,
 *   which `users` already counts.
 * - uid-keyed rows (`users/fcmTokens`, `seen`, `badge`, `passkeys`, `expenses`, `diaries`, `diaryAlbums`,
 *   `diarySources`, `diaryImports`, `hearingQuizResults`, `sessions`, `aliasEvents`, `docGenerations`,
 *   `payment-orders`, `esignList`, `esignAudit`, `featureEvents`, `news-subscriptions`,
 *   `news-channel-requests`, `carddavTokens`): only a person with a login has them, and `users` counts that.
 * - `chatReminders`, `aliases`: personal notes and short links (diary targets) — personal use, not a tie.
 * - `activities`: operational log.
 * - `newsletterSignups`, `prospects`, `locations`: no person key (e-mail or address register only).
 * - `courses/finance`: the eligible trainers are the course's trainers (counted on `courses`), and what was
 *   paid is a `bookings` counterparty (counted).
 * - `tenant-allocation-log`: evidence of a past disclosure, kept as a log, not a relationship.
 * - `feature-rollout`, `tickets`: global platform tables, no tenant.
 * - `booking-lines`: carry no person; their booking (`bookings.counterparty`) does.
 */
export const TENANT_LINK_SOURCES: readonly TenantLinkSource[] = [
  // relationships and roles
  byField(MembershipCollection, 'memberKey', { extra: { field: 'memberModelType', value: 'person' }, isLink: isActiveMembership }),
  byField(NewsletterSubscriptionCollection, 'personKey', { isLink: (doc) => isActiveSubscription(doc) }),
  byField(UserCollection, 'personKey'),
  byField(ApplicationCollection, 'personKey'),
  byField(OwnershipCollection, 'ownerKey', { extra: { field: 'ownerModelType', value: 'person' } }),
  byField(WorkrelCollection, 'subjectKey', { extra: { field: 'subjectModelType', value: 'person' } }),
  byField(PersonalRelCollection, 'subjectKey'),
  byField(PersonalRelCollection, 'objectKey'),
  // a live household of the tenant (spec 1.168): its members are combined for Versand and invoices
  byField(HouseholdCollection, 'memberKeys', { op: 'array-contains', isLink: (doc) => doc['isArchived'] !== true }),
  byPerson(ResponsibilityCollection, 'responsibleAvatar'),
  byPerson(ResponsibilityCollection, 'delegateAvatar'),
  { kind: 'scan', collection: GroupCollection, arrays: ['admins'] },
  // the AvatarInfo arrays, not the `trainerKeys` mirror: it lags the trigger and is empty on a legacy course
  { kind: 'scan', collection: CourseCollection, arrays: ['trainers', 'responsiblePersons'] },
  { kind: 'scan', collection: SectionCollection, arrays: ['properties.persons'], bound: { field: 'type', value: 'people' } },
  byField(CompetitionLevelCollection, 'personKey'),
  { kind: 'docId', collection: TrainerProfileCollection },
  // resources: every reservation counts, past ones too (a reservation history is the club's record of use)
  byPerson(ReservationCollection, 'reserver'),
  { kind: 'scan', collection: TransferCollection, arrays: ['subjects', 'objects'] },
  // invoices and accounting records (kept 10 years)
  byPerson(InvoiceCollection, 'receiver'),
  byField(InvoicePositionCollection, 'personKey'),
  byPerson(BookingCollection, 'counterparty'),
  byPerson(MemberFeeCollection, 'member'),
  byPerson(LegacyMemberFeeCollection, 'member'),
  byPerson(BillCollection, 'vendor'),
  byField(ContractCollection, 'partyPersonKeys', { op: 'array-contains' }),
  byPerson(ContractCollection, 'responsible'),
  byField(ContractDocumentCollection, 'partyPersonKeys', { op: 'array-contains' }),
  byField(AssetCollection, 'responsiblePersonKey'),
  byField(TrainerAgreementCollection, 'personKey'),
  byField(WorkEntryCollection, 'personKey'),
  byField(TrainerInvoiceCollection, 'personKey'),
  byPerson(TrainerInvoiceCollection, 'rejectedBy'),
];

function inTenant(doc: DocumentData, tenantId: string): boolean {
  return Array.isArray(doc['tenants']) && (doc['tenants'] as string[]).includes(tenantId);
}

/** Whether one source holds a record of the tenant that names the person. */
async function sourceLinks(db: Firestore, source: TenantLinkSource, tenantId: string, personKey: string, today: string): Promise<boolean> {
  switch (source.kind) {
    case 'docId': {
      const snap = await db.collection(source.collection).doc(personKey).get();
      return snap.exists && inTenant(snap.data() ?? {}, tenantId);
    }
    case 'scan': {
      const col = db.collection(source.collection);
      const snap = await (source.bound
        ? col.where(source.bound.field, '==', source.bound.value)
        : col.where('tenants', 'array-contains', tenantId)).get();
      return snap.docs.some((d) => {
        const doc = d.data();
        return inTenant(doc, tenantId) && source.arrays.some((path) => avatarListHolds(doc, path, personKey));
      });
    }
    case 'field': {
      let query = db.collection(source.collection).where(source.field, source.op ?? '==', personKey);
      if (source.extra) query = query.where(source.extra.field, '==', source.extra.value);
      const snap = await query.get();
      return snap.docs.some((d) => {
        const doc = d.data();
        return inTenant(doc, tenantId) && (source.isLink ? source.isLink(doc, today) : true);
      });
    }
  }
}

/**
 * Whether the person still has any link to the tenant (TENANT_LINK_SOURCES). A `field` source queries by the
 * person field and filters the tenant in memory, like the subject-data map's `tenantsArray` scope — no
 * composite index needed. `today` (StoreDate, default: today in Zurich) decides whether a membership has ended.
 */
export async function hasOtherTenantLink(db: Firestore, tenantId: string, personKey: string, today = toStoreDate(new Date())): Promise<boolean> {
  if (!tenantId || !personKey) throw new Error('hasOtherTenantLink: tenantId and personKey are required');
  const found = await Promise.all(TENANT_LINK_SOURCES.map((source) => sourceLinks(db, source, tenantId, personKey, today)));
  return found.some((hit) => hit);
}

/**
 * Applies the only-link rule to the person (spec 1.169 §5.4): without another link to the tenant, the person
 * is archived (of this tenant only) or detached (shared), and each of their addresses that carries the tenant
 * is archived or loses the tenant (getDeletePatch). Another tenant's data is never touched. The writes are one
 * transaction, and a second run writes nothing.
 */
export async function releasePersonIfUnlinked(db: Firestore, tenantId: string, personKey: string, today = toStoreDate(new Date())): Promise<ReleaseAction> {
  const linked = await hasOtherTenantLink(db, tenantId, personKey, today);
  if (linked) return 'kept';

  const personRef = db.collection(PersonCollection).doc(personKey);
  const action = await db.runTransaction<ReleaseAction>(async (tx) => {
    const personSnap = await tx.get(personRef);
    if (!personSnap.exists) return 'kept';
    const person = personSnap.data() ?? {};
    const tenants = Array.isArray(person['tenants']) ? (person['tenants'] as string[]) : [];
    const result = releaseAction(tenants, tenantId, false);
    if (result === 'kept') return result;
    const addresses = await tx.get(db.collection(AddressCollection).where('parentKey', '==', `person.${personKey}`));

    // every read is done
    if (result === 'archived' && person['isArchived'] !== true) tx.update(personRef, { isArchived: true });
    if (result === 'detached') tx.update(personRef, { tenants: tenants.filter((t) => t !== tenantId) });
    for (const address of addresses.docs) {
      const patch = addressReleasePatch(address.data(), tenantId);
      if (patch) tx.update(address.ref, patch);
    }
    return result;
  });
  // keys and tenant only, never a name or an address
  if (action !== 'kept') logger.info(`newsletter only-link rule: person ${action} in ${tenantId}`);
  return action;
}
