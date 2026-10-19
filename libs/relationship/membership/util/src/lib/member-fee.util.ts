import { MemberFeeModel, MembershipModel } from '@okr/shared-models';
import { isAfterDate } from '@okr/shared-util-core';

/**
 * The fee rows of one set of books (spec 1.108, D3/D11). A row without books (`''`, or a legacy
 * document that lacks the field) belongs to no fee run: it is never shown, posted or rebuilt —
 * a missed migration must surface, not silently count as the club's books.
 */
export function feeRowsOfBooks(rows: MemberFeeModel[], booksId: string): MemberFeeModel[] {
  if (!booksId) return [];
  return rows.filter(row => !!row.accountingTenantId && row.accountingTenantId === booksId);
}

/**
 * The memberships billed by a fee run (spec 1.108, D2): the active or passive memberships of the
 * books' owner org that are still running after `today` (StoreDate). A group membership never
 * counts, even if its okey matches. No org → nobody is billed.
 */
export function billedMemberships(all: MembershipModel[], orgKey: string, today: string): MembershipModel[] {
  if (!orgKey) return [];
  return all.filter(m =>
    m.orgKey === orgKey &&
    m.orgModelType === 'org' &&
    isAfterDate(m.dateOfExit, today) &&
    (m.state === 'active' || m.state === 'passive')
  );
}

/**
 * Where the fee screen stands (spec 1.108, D12): 'error' when the books' config could not be read;
 * 'loading' until the config AND the books' fee rows have answered (a run started earlier would see
 * every member as row-less and create duplicates); 'no-org' when the books have no org owner
 * (nobody to bill, D2); otherwise 'ready'. Every action of the screen runs only when 'ready'.
 */
export type MemberFeesScreenState = 'loading' | 'error' | 'no-org' | 'ready';

export function feeScreenState(
  configLoaded: boolean,
  rowsLoaded: boolean,
  billedOrgKey: string | undefined,
  configFailed = false,
): MemberFeesScreenState {
  if (configFailed) return 'error';
  if (!configLoaded) return 'loading';
  if (!billedOrgKey) return 'no-org';
  if (!rowsLoaded) return 'loading';
  return 'ready';
}

/**
 * The membership-category list a fee run prices from (spec 1.108, D9): the billed org's own list,
 * so a gss run prices from the Gönnerverein's categories. Legacy org docs may lack the field.
 */
export function billedCategoryKey(org: { membershipCategoryKey?: string } | undefined): string {
  return org?.membershipCategoryKey || 'mcat';
}

/**
 * Why a fee reload must not run (spec 1.108, final review): any fee row of the TENANT without books
 * means the migration has not run (or an old client wrote one) — such a row may be this member's
 * row of these books, so a reload would create a duplicate. `rows` is a fresh, non-swallowing read
 * of all the tenant's fee rows.
 */
export function reloadRefusal(rows: MemberFeeModel[]): 'legacy-rows' | undefined {
  // tenant-wide on purpose: a row without books may belong to any books
  return rows.some(row => !row.accountingTenantId) ? 'legacy-rows' : undefined;
}

/** The members that already have a fee row in these books — the reload skips them. */
export function rowMemberKeysOfBooks(rows: MemberFeeModel[], booksId: string): Set<string> {
  const keys = new Set<string>();
  for (const row of feeRowsOfBooks(rows, booksId)) {
    if (row.member?.key) keys.add(row.member.key);
  }
  return keys;
}
