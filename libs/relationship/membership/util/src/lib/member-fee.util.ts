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
