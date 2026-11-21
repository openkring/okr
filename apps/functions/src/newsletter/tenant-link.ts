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
  AddressCollection, ApplicationCollection, BillCollection, BookingCollection, CompetitionLevelCollection, ContractCollection, InvoiceCollection,
  InvoicePositionCollection, LegacyMemberFeeCollection, MemberFeeCollection, MembershipCollection,
  NewsletterSubscriptionCollection, OwnershipCollection, PersonalRelCollection, PersonCollection, ResponsibilityCollection,
  TrainerAgreementCollection, TrainerInvoiceCollection, UserCollection, WorkEntryCollection, WorkrelCollection,
} from '@okr/shared-models';

import { toStoreDate } from '../srv/zurich-time';
import { addressReleasePatch, isActiveMembership, isActiveSubscription, releaseAction, ReleaseAction } from './tenant-link.logic';

export interface TenantLinkSource {
  collection: string;
  /** The field that names the person by raw personKey (dotted for an embedded AvatarInfo). */
  field: string;
  /** '==' by default; 'array-contains' for a list of person keys. */
  op?: '==' | 'array-contains';
  /** A second equality the query adds — the modelType of a polymorphic key, so an org with the same key never counts. */
  extra?: { field: string; value: string };
  /** Whether a found document of the tenant still links the person; every document counts when absent. */
  isLink?: (doc: DocumentData, today: string) => boolean;
}

const asPerson = (field: string): { field: string; value: string } => ({ field, value: 'person' });

/**
 * Every record that ties a person to a tenant. A document counts only when its `tenants` contains the
 * tenant. Considered and left out on purpose (see the task-7 report):
 * - `addresses`, `address-directory`, `avatars`: the person's own contact data, released together with the person.
 * - `sendings`, `notices`: every newsletter issue writes them, so they would keep every subscriber forever.
 * - `tasks`, `comments`, `invitations`, `calevents`, `trips`, `docs`, `meetings`, `approvals`, `projects`:
 *   activity around a person, not a relationship with the tenant; the subscriber tasks of this feature are tasks too.
 * - `newsletterSignups`: consent not given yet, no person key.
 * - `expenses`, `passkeys`: reached by uid; a person with a login is already linked by `users`.
 * - `booking-lines`: carry no person; their booking (`bookings.counterparty`) does.
 */
export const TENANT_LINK_SOURCES: readonly TenantLinkSource[] = [
  // relationships
  { collection: MembershipCollection, field: 'memberKey', extra: asPerson('memberModelType'), isLink: isActiveMembership },
  { collection: NewsletterSubscriptionCollection, field: 'personKey', isLink: (doc) => isActiveSubscription(doc) },
  { collection: UserCollection, field: 'personKey' },
  { collection: ApplicationCollection, field: 'personKey' },
  { collection: OwnershipCollection, field: 'ownerKey', extra: asPerson('ownerModelType') },
  { collection: WorkrelCollection, field: 'subjectKey', extra: asPerson('subjectModelType') },
  { collection: PersonalRelCollection, field: 'subjectKey' },
  { collection: PersonalRelCollection, field: 'objectKey' },
  { collection: ResponsibilityCollection, field: 'responsibleAvatar.key', extra: asPerson('responsibleAvatar.modelType') },
  { collection: ResponsibilityCollection, field: 'delegateAvatar.key', extra: asPerson('delegateAvatar.modelType') },
  { collection: CompetitionLevelCollection, field: 'personKey' },
  // invoices and accounting records (kept 10 years)
  { collection: InvoiceCollection, field: 'receiver.key', extra: asPerson('receiver.modelType') },
  { collection: InvoicePositionCollection, field: 'personKey' },
  { collection: BookingCollection, field: 'counterparty.key', extra: asPerson('counterparty.modelType') },
  { collection: MemberFeeCollection, field: 'member.key', extra: asPerson('member.modelType') },
  { collection: LegacyMemberFeeCollection, field: 'member.key', extra: asPerson('member.modelType') },
  { collection: BillCollection, field: 'vendor.key', extra: asPerson('vendor.modelType') },
  { collection: ContractCollection, field: 'partyPersonKeys', op: 'array-contains' },
  { collection: ContractCollection, field: 'responsible.key', extra: asPerson('responsible.modelType') },
  { collection: TrainerAgreementCollection, field: 'personKey' },
  { collection: WorkEntryCollection, field: 'personKey' },
  { collection: TrainerInvoiceCollection, field: 'personKey' },
];

function inTenant(doc: DocumentData, tenantId: string): boolean {
  return Array.isArray(doc['tenants']) && (doc['tenants'] as string[]).includes(tenantId);
}

/**
 * Whether the person still has any link to the tenant (TENANT_LINK_SOURCES). Queries by the person field
 * only and filters the tenant in memory, like the subject-data map's `tenantsArray` scope — no composite
 * index needed. `today` (StoreDate, default: today in Zurich) decides whether a membership has ended.
 */
export async function hasOtherTenantLink(db: Firestore, tenantId: string, personKey: string, today = toStoreDate(new Date())): Promise<boolean> {
  if (!tenantId || !personKey) throw new Error('hasOtherTenantLink: tenantId and personKey are required');
  const found = await Promise.all(TENANT_LINK_SOURCES.map(async (source) => {
    let query = db.collection(source.collection).where(source.field, source.op ?? '==', personKey);
    if (source.extra) query = query.where(source.extra.field, '==', source.extra.value);
    const snap = await query.get();
    return snap.docs.some((d) => {
      const doc = d.data();
      return inTenant(doc, tenantId) && (source.isLink ? source.isLink(doc, today) : true);
    });
  }));
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
