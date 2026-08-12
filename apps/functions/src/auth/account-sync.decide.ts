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
  if (!had && has) return 'open';
  if (had && !has) return 'close';
  return 'none';
}
