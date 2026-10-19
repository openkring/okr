/**
 * Data loading for the exit settlement (spec 1.105 §4): reads everything the pure
 * `computeExitSettlement` needs from Firestore, finds the settlement task and the treasurer.
 * The mapping helpers are pure and exported for the tests.
 */
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  AccountingConfigCollection, AvatarInfo, AvatarModelTypes, CategoryCollection, FeeScheduleEntry, InvoiceCollection,
  InvoicePositionCollection, MembershipCollection, MembershipModel, OrgCollection, ResponsibilityCollection,
} from '@okr/shared-models';
import { getFullName } from '@okr/shared-util-core';
import { EXIT_SETTLEMENT_TAG, ExitSettlementInput, InvoiceFacts, invoiceShape } from '@okr/relationship-membership-util';
import { orgOwnerKey, resolveOwnerKey } from '@okr/finance-accounting-util';

import { activeResponsible, AvatarRef, ResponsibilityLike, treasurerResponsibilityKey } from '../invoice/treasurer-contact.logic';
import { storedDecision } from './settle-membership-exit.logic';
import { SYSTEM_AUTHOR } from '../workflow/activity';

/** Appended to the notes when the trigger closes a task because nothing is due any more (§4.5). */
export const CLOSE_NOTE = 'Nicht mehr nötig: Austritt geändert.';

export interface ExitContext {
  /** the app tenant the settlement runs in: the writer's / caller's tenant, never derived from the membership */
  tenantId: string;
  membershipKey: string;
  membership: MembershipModel;
  memberLabel: string;
  /** live memberships of the member in the tenant with this entry date and category, incl. this one (fee-row match, §4.6) */
  sameEntryMemberships: number;
  input: ExitSettlementInput;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const tenantsOf = (d: DocumentData): string[] => (Array.isArray(d['tenants']) ? (d['tenants'] as string[]) : []);

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

/**
 * Live memberships (any org) with this entry date and category. The fee row carries neither the
 * membership nor the org, so two of them (two orgs in one tenant) make the row match ambiguous.
 */
export function sameEntryCount(
  memberships: { dateOfEntry?: string; category?: string; isArchived?: boolean }[], dateOfEntry: string, category: string,
): number {
  return memberships.filter(m => m.isArchived !== true && str(m.dateOfEntry) === dateOfEntry && str(m.category) === category).length;
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

/**
 * A task the trigger closed itself (§4.5) is not a treasurer decision: a later exit reopens it. Only
 * when the close note is the LAST non-empty line: a task reopened by hand and then decided carries
 * the decision line after it, and that is a decision.
 */
export function isAutoClosed(task: DocumentData): boolean {
  if (str(task['state']) !== 'done') return false;
  const lines = str(task['notes']).split('\n').map(l => l.trim()).filter(l => l !== '');
  return lines[lines.length - 1] === CLOSE_NOTE;
}

/** The decision line the card shows for a done task: the close note when the trigger closed it itself. */
export function doneTaskDecision(task: DocumentData): string {
  return isAutoClosed(task) ? CLOSE_NOTE : storedDecision(str(task['notes']));
}

/**
 * The one settlement task of a membership in a tenant lives at this id (one exit per membership). The
 * tenant is part of it: a membership can belong to several tenants, and one tenant's run must never
 * write over another tenant's task.
 */
export function settlementTaskId(tenantId: string, membershipKey: string): string {
  return `exit-${tenantId}-${membershipKey}`;
}

/** The exit year of a StoreDate exit, or 0 when there is none. */
function exitYearOf(exit: string): number {
  return /^\d{8}$/.test(exit) && !exit.startsWith('9999') ? Number(exit.substring(0, 4)) : 0;
}

/**
 * The books of a membership (§4.2): the one accounting config of the tenant whose owner
 * (`resolveOwnerKey`) is the membership's org. Never `accounting-configs/{orgKey}` and never the app
 * tenant: accountingTenantId, tenantId and the org okey are three different things (gss books are
 * owned by org mkdf7xin64es5q4rmhdj). Personal books (owner `person.*`) never match. Undefined when
 * none or several match.
 */
export function pickBooksId(configs: { okey: string; data: DocumentData }[], tenantId: string, orgKey: string): string | undefined {
  if (!orgKey || !tenantId) return undefined;
  const owner = orgOwnerKey(orgKey);
  const hits = configs.filter(c => c.data['isArchived'] !== true && tenantsOf(c.data).includes(tenantId) &&
    resolveOwnerKey(c.data as { ownerKey?: string; orgId?: string }) === owner);
  return hits.length === 1 ? hits[0].okey : undefined;
}

const hasSettlementTag = (t: DocumentData): boolean =>
  typeof t['tags'] === 'string' && (t['tags'] as string).split(',').map(x => x.trim()).includes(EXIT_SETTLEMENT_TAG);

/**
 * Whether the doc at `exit-<tenantId>-<membershipKey>` is the task the trigger wrote: system author, the
 * settlement tag, this membership, this tenant. The id is predictable and tasks are client-writable,
 * so anything else is a squat.
 */
export function isServerTask(task: DocumentData, tenantId: string, membershipKey: string): boolean {
  const author = (task['author'] ?? {}) as Record<string, unknown>;
  return author['key'] === SYSTEM_AUTHOR.key && author['name1'] === SYSTEM_AUTHOR.name1 && author['modelType'] === SYSTEM_AUTHOR.modelType &&
    hasSettlementTag(task) && task['relatedKey'] === `membership.${membershipKey}` &&
    Array.isArray(task['tenants']) && (task['tenants'] as string[]).includes(tenantId);
}

/**
 * The callable's acceptance check: the task is the membership's server task in the caller's tenant,
 * at its deterministic id. A copied server task at any other id is refused.
 */
export function isSettlementTaskFor(taskKey: string, task: DocumentData, tenantId: string, membershipKey: string): boolean {
  return taskKey === settlementTaskId(tenantId, membershipKey) && isServerTask(task, tenantId, membershipKey);
}

/**
 * Positions are only needed for a native invoice dated around the exit year: the year before (a fee
 * invoice issued in December for the next year), the exit year, or the year after.
 */
export function needsPositions(facts: InvoiceFacts, exitYear: number): boolean {
  if (invoiceShape(facts) === 'bexio') return false;
  const year = Number(facts.invoiceDate.substring(0, 4));
  return year >= exitYear - 1 && year <= exitYear + 1;
}

/** Why `loadExitContext` found nothing to settle. */
export type ExitContextMiss = 'no-membership' | 'foreign-tenant' | 'no-books';

export function isExitContext(r: ExitContext | ExitContextMiss | undefined): r is ExitContext {
  return typeof r === 'object' && r !== null;
}

/**
 * Load the membership and everything its exit settlement depends on, in the app tenant `tenantId`
 * (the writer's or caller's tenant, §4.2). The membership must belong to that tenant; its books are
 * found via the owner (`pickBooksId`). A miss names why: 'no-membership' (gone or archived),
 * 'foreign-tenant', 'no-books' (none or several books owned by the org in the tenant).
 * `includeArchived` is only for the trigger, which loads an archived membership to close its task.
 */
export async function loadExitContext(
  db: Firestore, membershipKey: string, tenantId: string, today: string, opts: { includeArchived?: boolean } = {},
): Promise<ExitContext | ExitContextMiss> {
  const snap = await db.collection(MembershipCollection).doc(membershipKey).get();
  const data = snap.data();
  if (!snap.exists || !data) return 'no-membership';
  if (data['isArchived'] === true && opts.includeArchived !== true) return 'no-membership';
  if (!tenantId || !tenantsOf(data).includes(tenantId)) return 'foreign-tenant';
  const membership = { ...(data as MembershipModel), okey: membershipKey };
  const orgKey = str(membership.orgKey);

  const [configsSnap, orgSnap] = await Promise.all([
    db.collection(AccountingConfigCollection).where('tenants', 'array-contains', tenantId).get(),
    orgKey ? db.collection(OrgCollection).doc(orgKey).get() : undefined,
  ]);
  const configs = configsSnap.docs.map(d => ({ okey: d.id, data: d.data() }));
  const booksId = pickBooksId(configs, tenantId, orgKey);
  const memberLabel = getFullName(str(membership.memberName1), str(membership.memberName2));
  if (!booksId && data['isArchived'] === true) {
    // an archived membership has nothing to settle; its open task must close even without books (I1)
    return { tenantId, membershipKey, membership, memberLabel, sameEntryMemberships: 0, input: {
      membership: { dateOfEntry: str(membership.dateOfEntry), dateOfExit: str(membership.dateOfExit), category: str(membership.category), orgKey },
      overlappingMemberships: 0, schedule: undefined, categoryLists: {}, defaultCategoryList: '', booksId: '', invoices: [], today,
    } };
  }
  if (!booksId) {
    logger.info(`loadExitContext: membership ${membershipKey} (org ${orgKey || '-'}) has no unique books in tenant ${tenantId}, skipped`);
    return 'no-books';
  }
  const config = configs.find(c => c.okey === booksId)?.data ?? {};

  const exitYear = exitYearOf(str(membership.dateOfExit)) || Number(today.substring(0, 4));
  const memberKey = str(membership.memberKey);

  const [categorySnap, membershipSnap, invoiceSnap] = await Promise.all([
    db.collection(CategoryCollection).where('tenants', 'array-contains', tenantId).get(),
    memberKey ? db.collection(MembershipCollection).where('memberKey', '==', memberKey).get() : undefined,
    memberKey ? db.collection(InvoiceCollection).where('receiver.key', '==', memberKey).get() : undefined,
  ]);

  const schedule = ((config['feeSchedule'] ?? []) as FeeScheduleEntry[]).find(e => e.year === exitYear);
  const defaultCategoryList = str(orgSnap?.data()?.['membershipCategoryKey']) || 'mcat';
  const categoryLists = flattenCategoryLists(categorySnap.docs.map(d => d.data()).filter(d => d['isArchived'] !== true));

  // The membership itself is taken from its own read, so it always counts once with its latest data.
  const others = (membershipSnap?.docs ?? [])
    .filter(d => d.id !== membershipKey && tenantsOf(d.data()).includes(tenantId))
    .map(d => d.data());
  const overlappingMemberships = overlappingCount([...others, membership], orgKey, exitYear);
  const sameEntryMemberships = sameEntryCount([...others, membership], str(membership.dateOfEntry), str(membership.category));

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
    memberLabel,
    sameEntryMemberships,
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

/** Who holds the tenant's treasurer responsibility today (delegate aware); undefined = unassigned. */
export async function treasurerAssignee(db: Firestore, tenantId: string, today: string): Promise<AvatarInfo | undefined> {
  const snap = await db.collection(ResponsibilityCollection).doc(treasurerResponsibilityKey(tenantId)).get();
  const r = snap.data();
  if (!snap.exists || !r || r['isArchived'] === true) return undefined;
  return toAvatarInfo(activeResponsible(r as ResponsibilityLike, today));
}
