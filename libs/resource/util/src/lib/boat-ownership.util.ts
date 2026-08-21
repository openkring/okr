import { OwnershipModel } from '@okr/shared-models';

/**
 * The boats that are NOT the club's in `year` — the `p` flag of the Bootseinteilung.
 *
 * A boat can carry several ownerships whose periods overlap: a transfer from a member to the
 * club is recorded as the member's ownership running to the end of the season and the club's
 * starting in it. For one season the LATEST ownership wins (by validFrom, then validTo), so a
 * transferred boat stops being private in the year it was handed over, not a year later.
 *
 * @param ownerships every ownership of the tenant (open-ended ones end '99991231')
 * @param tenantId the club's own org key — an ownership held by anyone else is private
 */
export function getPrivateBoatKeys(ownerships: OwnershipModel[], tenantId: string, year: number): Set<string> {
  const [from, to] = [`${year}0101`, `${year}1231`];
  const current = new Map<string, OwnershipModel>();
  for (const ownership of ownerships) {
    if (!ownership.resourceKey) continue;
    if (ownership.validFrom > to || ownership.validTo < from) continue;   // not valid in this season
    const best = current.get(ownership.resourceKey);
    if (!best || isLater(ownership, best)) current.set(ownership.resourceKey, ownership);
  }
  return new Set([...current.values()]
    .filter(ownership => ownership.ownerKey !== tenantId)
    .map(ownership => ownership.resourceKey));
}

/** Later = started later; two starting on the same day are ordered by the one running longer. */
function isLater(candidate: OwnershipModel, best: OwnershipModel): boolean {
  return candidate.validFrom === best.validFrom
    ? candidate.validTo > best.validTo
    : candidate.validFrom > best.validFrom;
}
