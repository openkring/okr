// apps/functions/src/auth/account-sync.decide.ts
//
// Pure transition logic for membership-driven account sync
// (planning/specs/2026-08-12-membership-account-sync-design.md).
// No Firestore, no clock, no I/O — tenantId and today are parameters so this
// stays trivially testable.

import { isActiveMembership } from '@okr/shared-util-core';

/** Inlined subset of MembershipModel — same pattern as membership-sync.ts. */
export interface MembershipDoc {
  memberKey: string;
  memberModelType: 'person' | 'org' | 'group';
  orgKey: string;
  orgModelType: 'org' | 'group';
  dateOfExit?: string;
  isArchived?: boolean;
  tenants?: string[];
  // read by the workflow engine (spec 1.35) for the categoryChanged event and the
  // {name} placeholder of a rule's message
  category?: string;
  memberName1?: string;
  memberName2?: string;
  // a category change ends the old membership with relIsLast = false and creates a
  // successor carrying the whole relLog ('20190101:A,20260814:P')
  relIsLast?: boolean;
  relLog?: string;
}

/**
 * The category abbreviations of a relLog, oldest first: '20190101:A,20260814:P' → ['A', 'P'].
 * More than one entry means this membership succeeds an earlier one — i.e. it was created
 * by a category change, not by someone joining.
 */
export function relLogAbbrs(m: MembershipDoc | undefined): string[] {
  return (m?.relLog ?? '')
    .split(',')
    .map((entry) => entry.split(':')[1]?.trim() ?? '')
    .filter((abbr) => abbr.length > 0);
}

export type AccountAction = 'open' | 'close' | 'none';

/**
 * True when this membership is an active person↔default-org membership.
 * The default org is the org whose okey equals the tenant id (app.store.ts:266);
 * the orgModelType check is required because org and group keys can collide.
 */
function qualifies(m: MembershipDoc | undefined, tenantId: string, today: string): boolean {
  if (!m) return false;
  if (m.memberModelType !== 'person') return false;
  if (m.orgModelType !== 'org') return false;
  if (m.orgKey !== tenantId) return false;
  return isActiveMembership(m, today);
}

/**
 * @param before   the membership before the write, undefined on create
 * @param after    the membership after the write, undefined on delete
 * @param tenantId resolved from orgKey via the app-config lookup in account-sync.ts
 * @param today    StoreDate (yyyyMMdd)
 */
export function decideAccountAction(
  before: MembershipDoc | undefined,
  after: MembershipDoc | undefined,
  tenantId: string,
  today: string,
): AccountAction {
  const had = qualifies(before, tenantId, today);
  const has = qualifies(after, tenantId, today);
  // A category change ends the old membership and creates a successor
  // (membership.service.ts:111-122). Closing here would delete the member's user
  // document — and with it their Matrix group memberships — only for the successor's
  // write to re-open the account seconds later under a new uid. relIsLast = false says
  // "superseded", so this is not an exit.
  if (had && !has && after?.relIsLast === false) return 'none';
  if (!had && has) return 'open';
  if (had && !has) return 'close';
  return 'none';
}

/**
 * Subtract n days from a StoreDate (yyyyMMdd) and return a StoreDate.
 * Used for the sweep's catch-up window; UTC throughout, so no DST surprises.
 */
export function shiftDaysBack(storeDate: string, days: number): string {
  const year = Number(storeDate.slice(0, 4));
  const month = Number(storeDate.slice(4, 6));
  const day = Number(storeDate.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - days);
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${date.getUTCFullYear()}${mm}${dd}`;
}
