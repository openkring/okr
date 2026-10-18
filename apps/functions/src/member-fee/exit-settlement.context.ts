/**
 * Data loading for the exit settlement (spec 1.105 §4): reads everything the pure
 * `computeExitSettlement` needs from Firestore, finds the settlement task and the treasurer.
 * The mapping helpers are pure and exported for the tests.
 */
import type { DocumentData, DocumentReference, Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  AccountingConfigCollection, AvatarInfo, AvatarModelTypes, CategoryCollection, FeeScheduleEntry, InvoiceCollection,
  InvoicePositionCollection, MembershipCollection, MembershipModel, OrgCollection, ResponsibilityCollection, TaskCollection,
} from '@okr/shared-models';
import { getFullName } from '@okr/shared-util-core';
import { EXIT_SETTLEMENT_TAG, ExitSettlementInput, InvoiceFacts, invoiceShape } from '@okr/relationship-membership-util';

import { activeResponsible, AvatarRef, ResponsibilityLike, treasurerResponsibilityKey } from '../invoice/treasurer-contact.logic';

/** Appended to the notes when the trigger closes a task because nothing is due any more (§4.5). */
export const CLOSE_NOTE = 'Nicht mehr nötig: Austritt geändert.';

export interface ExitContext {
  tenantId: string;
  membershipKey: string;
  membership: MembershipModel;
  memberLabel: string;
  input: ExitSettlementInput;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const tenantsOf = (d: DocumentData): string[] => (Array.isArray(d['tenants']) ? (d['tenants'] as string[]) : []);
const tagsOf = (d: DocumentData): string[] => str(d['tags']).split(',').map(t => t.trim());

/** Every category list as `listName -> category -> price`, exactly as the member-fee store flattens it. */
export function flattenCategoryLists(lists: { name?: string; items?: { name?: string; price?: number }[] }[]): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  for (const list of lists) {
    const prices: Record<string, number> = {};
    list.items?.forEach(item => { prices[item.name ?? ''] = item.price ?? 0; });
    result[list.name ?? ''] = prices;
  }
  return result;
}

/** Memberships of the same org that touch `year` (an empty exit is open-ended), archived ones left out. */
export function overlappingCount(
  memberships: { orgKey?: string; dateOfEntry?: string; dateOfExit?: string; isArchived?: boolean }[],
  orgKey: string, year: number,
): number {
  const first = `${year}0101`;
  const last = `${year}1231`;
  return memberships.filter(m =>
    m.isArchived !== true && m.orgKey === orgKey &&
    str(m.dateOfEntry) <= last && (str(m.dateOfExit) === '' || str(m.dateOfExit) >= first)).length;
}

/** The invoice as the computation sees it; Rappen for totals and payments, francs for positions. */
export function toInvoiceFacts(okey: string, inv: DocumentData, positions: DocumentData[]): InvoiceFacts {
  const payments = Array.isArray(inv['payments']) ? (inv['payments'] as { amount?: unknown }[]) : [];
  return {
    okey,
    invoiceId: str(inv['invoiceId']),
    accountingTenantId: str(inv['accountingTenantId']),
    state: str(inv['state']),
    invoiceNo: num(inv['invoiceNo']),
    bookingKey: str(inv['bookingKey']),
    invoiceDate: str(inv['invoiceDate']),
    title: str(inv['title']),
    totalRappen: num((inv['totalAmount'] as { amount?: unknown } | undefined)?.amount),
    paidRappen: payments.reduce((sum, p) => sum + num(p.amount), 0),
    positions: positions.map(p => ({ usage: str(p['invoicePositionUsage']), year: num(p['year']), amount: num(p['amount']) })),
  };
}

/** The responsibility holder as a task assignee; undefined when nobody holds it. */
export function toAvatarInfo(ref: AvatarRef | undefined): AvatarInfo | undefined {
  if (!ref?.key) return undefined;
  const name1 = ref.name1 ?? '';
  const name2 = ref.name2 ?? '';
  return {
    key: ref.key, name1, name2, modelType: (ref.modelType || 'person') as AvatarModelTypes,
    type: '', subType: '', label: ref.label || getFullName(name1, name2),
  };
}

/** A task the trigger closed itself (§4.5) is not a treasurer decision: a later exit opens a fresh task. */
export function isAutoClosed(task: DocumentData): boolean {
  return str(task['state']) === 'done' && str(task['notes']).includes(CLOSE_NOTE);
}

/** The exit year of a StoreDate exit, or 0 when there is none. */
function exitYearOf(exit: string): number {
  return /^\d{8}$/.test(exit) && !exit.startsWith('9999') ? Number(exit.substring(0, 4)) : 0;
}

/**
 * The tenant the settlement runs in: the first tenant of the membership that the books
 * (`accounting-configs/{orgKey}`) and the org also belong to. Membership `tenants` alone is not
 * trusted — the rules let a user write a membership that merely contains one of their tenants.
 */
export function resolveSettlementTenant(membershipTenants: string[], configTenants: string[], orgTenants: string[]): string | undefined {
  return membershipTenants.find(t => !!t && configTenants.includes(t) && orgTenants.includes(t));
}

/** Positions are only needed for a native invoice dated in the exit year or the year after. */
export function needsPositions(facts: InvoiceFacts, exitYear: number): boolean {
  if (invoiceShape(facts) === 'bexio') return false;
  const year = Number(facts.invoiceDate.substring(0, 4));
  return year === exitYear || year === exitYear + 1;
}

/**
 * Load the membership and everything its exit settlement depends on. The books are
 * `accounting-configs/{orgKey}` (never the app tenant, §4.2). Undefined when the membership is gone
 * or no tenant is shared by the membership, the books and the org.
 */
export async function loadExitContext(db: Firestore, membershipKey: string, today: string): Promise<ExitContext | undefined> {
  const snap = await db.collection(MembershipCollection).doc(membershipKey).get();
  const data = snap.data();
  if (!snap.exists || !data) return undefined;
  const membership = { ...(data as MembershipModel), okey: membershipKey };
  const orgKey = str(membership.orgKey);
  if (!orgKey) return undefined;
  const booksId = orgKey;

  const [configSnap, orgSnap] = await Promise.all([
    db.collection(AccountingConfigCollection).doc(booksId).get(),
    db.collection(OrgCollection).doc(orgKey).get(),
  ]);
  const tenantId = resolveSettlementTenant(tenantsOf(data), tenantsOf(configSnap.data() ?? {}), tenantsOf(orgSnap.data() ?? {}));
  if (!tenantId) {
    logger.warn(`loadExitContext: membership ${membershipKey} shares no tenant with books/org ${orgKey}, skipped`);
    return undefined;
  }

  const exitYear = exitYearOf(str(membership.dateOfExit)) || Number(today.substring(0, 4));
  const memberKey = str(membership.memberKey);

  const [categorySnap, membershipSnap, invoiceSnap] = await Promise.all([
    db.collection(CategoryCollection).where('tenants', 'array-contains', tenantId).get(),
    memberKey ? db.collection(MembershipCollection).where('memberKey', '==', memberKey).get() : undefined,
    memberKey ? db.collection(InvoiceCollection).where('receiver.key', '==', memberKey).get() : undefined,
  ]);

  const schedule = ((configSnap.data()?.['feeSchedule'] ?? []) as FeeScheduleEntry[]).find(e => e.year === exitYear);
  const defaultCategoryList = str(orgSnap.data()?.['membershipCategoryKey']) || 'mcat';
  const categoryLists = flattenCategoryLists(categorySnap.docs.map(d => d.data()).filter(d => d['isArchived'] !== true));

  // The membership itself is taken from its own read, so it always counts once with its latest data.
  const others = (membershipSnap?.docs ?? [])
    .filter(d => d.id !== membershipKey && tenantsOf(d.data()).includes(tenantId))
    .map(d => d.data());
  const overlappingMemberships = overlappingCount([...others, membership], orgKey, exitYear);

  // computeExitSettlement does not look at the invoice state: a cancelled invoice and its
  // replacement would otherwise read as two matches (ambiguous).
  const candidates = (invoiceSnap?.docs ?? []).filter(d => {
    const inv = d.data();
    return tenantsOf(inv).includes(tenantId) && str(inv['accountingTenantId']) === booksId &&
      str(inv['state']) !== 'cancelled' && inv['isArchived'] !== true;
  });
  const invoices = await Promise.all(candidates.map(async d => {
    const facts = toInvoiceFacts(d.id, d.data(), []);
    if (!needsPositions(facts, exitYear)) return facts;
    const posSnap = await db.collection(InvoicePositionCollection).where('invoiceKey', '==', d.id).get();
    return toInvoiceFacts(d.id, d.data(), posSnap.docs.map(p => p.data())
      .filter(p => p['isArchived'] !== true && tenantsOf(p).includes(tenantId)));
  }));

  return {
    tenantId,
    membershipKey,
    membership,
    memberLabel: getFullName(str(membership.memberName1), str(membership.memberName2)),
    input: {
      membership: {
        dateOfEntry: str(membership.dateOfEntry), dateOfExit: str(membership.dateOfExit),
        category: str(membership.category), orgKey,
      },
      overlappingMemberships,
      schedule,
      categoryLists,
      defaultCategoryList,
      booksId,
      invoices,
      today,
    },
  };
}

/**
 * The newest (latest due date) non-archived settlement task of the membership (tag + relatedKey),
 * auto-closed tasks left out. A membership has a single exit, so its task is the same whatever
 * year the exit moves to.
 */
export async function findSettlementTask(
  db: Firestore, tenantId: string, membershipKey: string,
): Promise<{ ref: DocumentReference; data: DocumentData; done: boolean } | undefined> {
  const snap = await db.collection(TaskCollection).where('relatedKey', '==', `membership.${membershipKey}`).get();
  const hit = snap.docs
    .filter(d => {
      const t = d.data();
      return t['isArchived'] !== true && tenantsOf(t).includes(tenantId) && tagsOf(t).includes(EXIT_SETTLEMENT_TAG) && !isAutoClosed(t);
    })
    .sort((a, b) => str(b.data()['dueDate']).localeCompare(str(a.data()['dueDate'])))[0];
  if (!hit) return undefined;
  const data = hit.data();
  return { ref: hit.ref, data, done: str(data['state']) === 'done' || str(data['completionDate']) !== '' };
}

/** Who holds the tenant's treasurer responsibility today (delegate aware); undefined = unassigned. */
export async function treasurerAssignee(db: Firestore, tenantId: string, today: string): Promise<AvatarInfo | undefined> {
  const snap = await db.collection(ResponsibilityCollection).doc(treasurerResponsibilityKey(tenantId)).get();
  const r = snap.data();
  if (!snap.exists || !r || r['isArchived'] === true) return undefined;
  return toAvatarInfo(activeResponsible(r as ResponsibilityLike, today));
}
