import { ResourceModel } from '@bk2/shared-models';
import { addIndexElement, extractFirstPartOfOptionalTupel, extractSecondPartOfOptionalTupel } from '@bk2/shared-util-core';

import { DEFAULT_CAR_TYPE, DEFAULT_GENDER, DEFAULT_RBOAT_TYPE } from '@bk2/shared-constants';

  // locker:  name = lockerNr/keyNr, subType = GenderType
  // key:     name = keyNr
  // boat:    name = boatName, subType = boatType
  // car:     name = carName, subType = carType
  // default: name = name, subType = undefined


export function getKeyNr(resource: ResourceModel): number {
  if (resource.type === 'locker') {
    return parseInt(extractSecondPartOfOptionalTupel(resource.name, '/'));
  } else {
    return 0;
  }
}

export function getLockerNr(resource: ResourceModel): number {
  return resource.type === 'locker' ? parseInt(extractFirstPartOfOptionalTupel(resource.name, '/')) : 0;
}

export function getDefaultForResourceType(resourceType?: string): string {
  if (!resourceType) return '';
  switch (resourceType) {
    case 'rboat': return DEFAULT_RBOAT_TYPE;
    case 'car': return DEFAULT_CAR_TYPE;
    case 'locker': return DEFAULT_GENDER;
    case 'boat': // tbd: default boat_type
    case 'key':  // no subType
    case 'realestate': // tbd: default realestate_type
    case 'pet': // tbd: default pet_type
    case 'other': // no subType
    default: return '';
  }
}

export function getCategoryNameForResourceType(resourceType?: string): string | undefined {
  if (!resourceType) return undefined;
  switch (resourceType) {
    case 'rboat': return 'rboat_type';
    case 'car': return 'car_type';
    case 'locker': return 'gender';
    case 'boat': // tbd: boat_type
    case 'key':  // no subType
    case 'realestate': // tbd: realestate_type
    case 'pet': // tbd: pet_type
    case 'other': // no subType
    default: return undefined;
  }
}

export function getUsageNameForResourceType(resourceType?: string): string | undefined {
  if (!resourceType) return undefined;
  return resourceType === 'rboat' ? 'rboat_usage' : undefined;
}

/* ---------------------- Getters -------------------------*/
export function isReservable(resourceType: string): boolean {
  switch (resourceType) {
    case 'rboat':
      return true;
    case 'boat':
      return true;
    case 'car':
      return true;
    case 'locker':
      return false;
    case 'key':
      return false;
    case 'realestate':
      return true;
    case 'other':
      return true;
    default:
      return false;
  }
}

/*-------------------------- search index --------------------------------*/
/**
 * Create an index entry for a given resource based on its values.
 * @param resource the resource for which to create the index
 * @returns the index string
 */
export function getResourceIndex(resource: ResourceModel): string {
  let index = '';
  index = addIndexElement(index, 'n', resource.name);
  index = addIndexElement(index, 't', resource.type);
  index = addIndexElement(index, 'st', resource.subType);
  return index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getResourceIndexInfo(): string {
  return 'n:name c:type st:subtype';
}  