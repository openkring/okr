import { ResourceModel } from '@okr/shared-models';

/**
 * The only rowing boat type that MAY carry a cox although its type does not say so: an 8x
 * (octuple) is rowed with or without one, depending on how it is rigged. A coxed type ('…p',
 * e.g. 'b8p') always has a cox and keeps it among the trip's participants instead.
 */
export const COX_BOAT_TYPE = 'b8x';

/** Whether a resource of this type/subType offers the «Steuerplatz» checkmark (ResourceModel.hasCox). */
export function canHaveCox(type?: string, subType?: string): boolean {
  return type === 'rboat' && subType === COX_BOAT_TYPE;
}

/**
 * Whether the Logbuch asks for a cox (TripModel.cox) when this boat is used: an 8x with the
 * checkmark set. A stale `hasCox` on a boat whose type was changed later is ignored.
 * `hasCox` is undefined on legacy docs.
 */
export function boatHasCox(boat?: Pick<ResourceModel, 'type' | 'subType' | 'hasCox'>): boolean {
  return !!boat && canHaveCox(boat.type, boat.subType) && boat.hasCox === true;
}
