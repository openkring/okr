import { PartnerModel, PartnerStatus } from '@okr/shared-models';
import { addIndexElement, isType } from '@okr/shared-util-core';

/**
 * Type guard for a partner document, in the repo's existing `isType` idiom.
 *
 * ⚠️ `isType` compares `typeof` only, so this narrows a non-null object and nothing more — it
 * catches `undefined` and primitives, not a wrongly-shaped object. Kept identical to every other
 * feature's guard on purpose; a stronger check here alone would read as a stronger guarantee than
 * the rest of the codebase actually gives.
 */
export function isPartner(partner: unknown, tenantId: string): partner is PartnerModel {
  return isType<PartnerModel>(partner, new PartnerModel(tenantId));
}

/**
 * The search index. `serviceUid` is deliberately NOT indexed: it is a credential-like identifier,
 * and putting it in a field every tenant member can read would make it searchable by anyone.
 */
export function getPartnerIndex(partner: PartnerModel): string {
  let index = addIndexElement('', 'name', partner.name);
  index = addIndexElement(index, 'status', partner.status);
  index = addIndexElement(index, 'org', partner.orgKey);
  return index;
}

/** The statuses a partner may be in, in the order a lifecycle moves through them. */
export const PARTNER_STATUSES: readonly PartnerStatus[] = [
  'prospect', 'active', 'suspended', 'terminated',
];

/** Only an active partner may push metering or claim leads (C2 §13.3). */
export function isPartnerOperational(partner: PartnerModel): boolean {
  return partner.status === 'active' && !partner.isArchived;
}
