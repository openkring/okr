/**
 * §4.6 (spec 1.105, restored in round 2): when an exit moves, the not-yet-invoiced fee row of the
 * running year is rebuilt from the books' fee schedule, so its pro rata follows the new exit; a
 * cleared exit restores the full year. Runs only behind the trigger's writer check (the writer's own
 * tenant, a settlement role) and only with books resolved via ownerKey for the membership's org.
 */
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { FeeScheduleEntry, MemberFeeCollection, MemberFeePosition, MembershipModel, OwnershipCollection } from '@okr/shared-models';
import { isAfterDate } from '@okr/shared-util-core';
import { buildPositions, ExitSettlement, noExitSettlement, rebatePosition } from '@okr/relationship-membership-util';

import type { ExitContext } from './exit-settlement.context';

const CF_NAME = 'onMembershipExitWritten';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const tenantsOf = (d: DocumentData): string[] => (Array.isArray(d['tenants']) ? (d['tenants'] as string[]) : []);
const FEE_ROW_OPEN_STATES = ['initial', 'review'];

export type FeeRowPlan =
  | { action: 'rebuild'; rowKey: string }
  | { action: 'ambiguous'; rowKeys: string[] }
  | { action: 'skip'; why: 'archived' | 'other-year' | 'membership-collision' | 'no-row' | 'other-books' | 'no-books' };

interface FeeRowMembership { memberKey?: string; dateOfEntry?: string; dateOfExit?: string; category?: string; isArchived?: boolean }

/** A fee row that is not yet on its way to an invoice: open state, not posted natively, not uploaded to bexio. */
const isOpenRow = (f: DocumentData): boolean => FEE_ROW_OPEN_STATES.includes(str(f['state'])) && f['isArchived'] !== true &&
  str(f['invoiceKey']) === '' && str(f['invoiceBexioId']) === '';

/**
 * Whether the row belongs to the books (spec 1.108, D6). A row without books (`''` or missing,
 * D11) belongs to none — it is never treated as the club's.
 */
const isRowOfBooks = (f: DocumentData, booksId: string): boolean => booksId !== '' && str(f['accountingTenantId']) === booksId;

/**
 * Which fee row to rebuild. Only for an exit in the running year or a cleared exit; the row has no
 * membership key, so it is matched by tenant, member, entry date and category; when the member has
 * more than one live membership in the tenant with that entry date and category (two orgs) the match
 * is not safe and nothing is done (D13: the guard stays). Only rows of the membership org's books
 * (`booksId`, spec 1.108 D6) are candidates: a row of other books → 'other-books', a row without
 * books (D11) → 'no-books', so the caller can log it. Exactly one open row ('initial' | 'review',
 * no invoice yet) of the books → rebuild; several → nothing (ambiguous).
 */
export interface FeeRowScope {
  /** The app tenant (`tenants[]`). */
  tenantId: string;
  /** The books of the membership org (`accountingTenantId`, spec 1.108 D6) — never the tenant. */
  booksId: string;
  /** Today as StoreDate (yyyymmdd). */
  today: string;
  /** Live memberships of the member in the tenant with this entry date and category (default 1). */
  sameEntryMemberships?: number;
}

export function feeRowToRebuild(
  rows: { okey: string; data: DocumentData }[], m: FeeRowMembership, scope: FeeRowScope,
): FeeRowPlan {
  const { tenantId, booksId, today, sameEntryMemberships = 1 } = scope;
  if (m.isArchived === true) return { action: 'skip', why: 'archived' };
  const exit = str(m.dateOfExit);
  const hasExit = /^\d{8}$/.test(exit) && !exit.startsWith('9999');
  if (hasExit && exit.substring(0, 4) !== today.substring(0, 4)) return { action: 'skip', why: 'other-year' };
  if (sameEntryMemberships > 1) return { action: 'skip', why: 'membership-collision' };
  const candidates = rows.filter(({ data: f }) => isOpenRow(f) && tenantsOf(f).includes(tenantId) &&
    str((f['member'] as { key?: unknown } | undefined)?.key) === str(m.memberKey) && !!m.memberKey &&
    str(f['dateOfEntry']) === str(m.dateOfEntry) && str(f['category']) === str(m.category));
  if (candidates.length === 0) return { action: 'skip', why: 'no-row' };
  const hits = candidates.filter(({ data: f }) => isRowOfBooks(f, booksId));
  if (hits.length === 0) {
    const withoutBooks = candidates.some(({ data: f }) => str(f['accountingTenantId']) === '');
    return { action: 'skip', why: withoutBooks ? 'no-books' : 'other-books' };
  }
  if (hits.length > 1) return { action: 'ambiguous', rowKeys: hits.map(h => h.okey) };
  return { action: 'rebuild', rowKey: hits[0].okey };
}

/** Whether the member holds a locker today — the member-fee store's `lockerOwnerKeys` derivation. */
export function hasLockerToday(ownerships: DocumentData[], memberKey: string, tenantId: string, today: string): boolean {
  return ownerships.some(o => str(o['ownerKey']) === memberKey && o['resourceType'] === 'locker' && o['isArchived'] !== true &&
    tenantsOf(o).includes(tenantId) && isAfterDate(str(o['validTo']), today));
}

/**
 * The row's positions as the member-fee store derives them (`deriveFee`): `buildPositions` over the
 * year's schedule plus the member's rebate. Missing fields of a legacy doc read as empty.
 */
export function rebuiltFeePositions(
  m: Partial<MembershipModel>, schedule: FeeScheduleEntry,
  opts: { hasLocker: boolean; categoryLists: Record<string, Record<string, number>>; defaultCategoryList: string },
): MemberFeePosition[] {
  const membership = {
    ...m,
    memberKey: str(m.memberKey), dateOfEntry: str(m.dateOfEntry), dateOfExit: str(m.dateOfExit),
    category: str(m.category), memberBirthYear: str(m.memberBirthYear),
  } as MembershipModel;
  const positions = buildPositions(membership, schedule, {
    hasLocker: opts.hasLocker, currentYear: schedule.year,
    categoryLists: opts.categoryLists, defaultCategoryList: opts.defaultCategoryList,
  });
  const rebate = rebatePosition(Number(m.rebate) || 0, str(m.rebateReason), positions);
  if (rebate) positions.push(rebate);
  return positions;
}

/**
 * §4.6: not yet invoiced → no task. When the row was rebuilt, a 'no-invoice' settlement needs no
 * task (an open one closes); without the rebuild the task stays, with its «Neu laden» hint.
 */
export function settlementAfterRebuild(s: ExitSettlement, rebuilt: boolean): ExitSettlement {
  return rebuilt && s.case === 'manual' && s.manualReason === 'no-invoice' ? noExitSettlement(s.exitYear) : s;
}

/**
 * Rebuild the membership's open fee row of the running year (`feeRowToRebuild`). The row is re-read
 * in a transaction, so a row that moved on to an invoice meanwhile is left alone. True when a row
 * was rewritten.
 */
export async function rebuildFeeRow(db: Firestore, ctx: ExitContext, today: string): Promise<boolean> {
  const { membership: m, tenantId } = ctx;
  const booksId = ctx.input.booksId;
  const schedule = ctx.input.schedule;
  const memberKey = str(m.memberKey);
  if (!memberKey || !schedule || String(schedule.year) !== today.substring(0, 4)) return false;

  const snap = await db.collection(MemberFeeCollection).where('member.key', '==', memberKey).get();
  const plan = feeRowToRebuild(snap.docs.map(d => ({ okey: d.id, data: d.data() })), m, {
    tenantId, booksId, today, sameEntryMemberships: ctx.sameEntryMemberships,
  });
  if (plan.action === 'skip' && plan.why === 'membership-collision') {
    logger.warn(`${CF_NAME}: member ${memberKey} has ${ctx.sameEntryMemberships} live memberships with the same entry date and category in tenant ${tenantId}, fee row of membership ${ctx.membershipKey} not rebuilt`);
    return false;
  }
  if (plan.action === 'skip' && plan.why === 'no-books') {
    logger.warn(`${CF_NAME}: open fee row(s) of member ${memberKey} in tenant ${tenantId} have no books (accountingTenantId ''), ignored — fee row of membership ${ctx.membershipKey} not rebuilt`);
    return false;
  }
  if (plan.action === 'skip' && plan.why === 'other-books') {
    logger.info(`${CF_NAME}: the open fee row(s) of member ${memberKey} in tenant ${tenantId} belong to other books than ${booksId}, fee row of membership ${ctx.membershipKey} not rebuilt`);
    return false;
  }
  if (plan.action === 'ambiguous') {
    logger.warn(`${CF_NAME}: ${plan.rowKeys.length} open fee rows match membership ${ctx.membershipKey} (${plan.rowKeys.join(', ')}), none rebuilt`);
    return false;
  }
  if (plan.action === 'skip') return false;

  const ownerships = await db.collection(OwnershipCollection).where('ownerKey', '==', memberKey).get();
  const positions = rebuiltFeePositions(m, schedule, {
    hasLocker: hasLockerToday(ownerships.docs.map(d => d.data()), memberKey, tenantId, today),
    categoryLists: ctx.input.categoryLists,
    defaultCategoryList: ctx.input.defaultCategoryList,
  });
  const ref = db.collection(MemberFeeCollection).doc(plan.rowKey);
  return db.runTransaction(async (tx) => {
    const row = (await tx.get(ref)).data();
    if (!row || !isOpenRow(row) || !tenantsOf(row).includes(tenantId) || !isRowOfBooks(row, booksId)) return false;
    tx.update(ref, { positions });
    return true;
  });
}
