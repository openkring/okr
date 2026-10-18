/** Pure selection for the exit-settlement backfill (spec 1.105): which memberships need a look. */

export interface BackfillCandidate {
  okey: string;
  tenants?: string[];
  dateOfExit?: string;
  isArchived?: boolean;
}

/**
 * Memberships of the tenant that ended this year before 31.12. (31.12. is the regular year-end
 * exit, nothing to settle); '' and 9999… mean «no exit».
 */
export function selectBackfillMemberships(memberships: BackfillCandidate[], tenantId: string, today: string): string[] {
  const year = today.substring(0, 4);
  return memberships
    .filter(m => m.isArchived !== true && Array.isArray(m.tenants) && m.tenants.includes(tenantId))
    .filter(m => {
      const exit = m.dateOfExit ?? '';
      return /^\d{8}$/.test(exit) && !exit.startsWith('9999') && exit.startsWith(year) && exit.substring(4) !== '1231';
    })
    .map(m => m.okey);
}
