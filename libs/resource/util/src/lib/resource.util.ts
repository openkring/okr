import { CategoryListModel, ResourceModel } from '@okr/shared-models';
import { addIndexElement, defaultItemName, extractFirstPartOfOptionalTupel, extractSecondPartOfOptionalTupel } from '@okr/shared-util-core';

import { DEFAULT_CAR_TYPE, DEFAULT_GENDER, DEFAULT_PET_TYPE, DEFAULT_RBOAT_TYPE, DEFAULT_RBOAT_USAGE } from '@okr/shared-constants';

import { getUsageForYear } from './boat-usage.util';

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
    case 'pet': return DEFAULT_PET_TYPE;
    case 'boat': // tbd: default boat_type
    case 'key':  // no subType
    case 'realestate': // tbd: default realestate_type
    case 'other': // no subType
    default: return '';
  }
}

/**
 * A copy of `resource` with `type`, whose subType and usage are items the tenant offers for that
 * type — so a subType left over from the previous type (a car with 'b1x') or a default the tenant
 * does not offer is replaced. Where the new type has no subtypes to choose from, it gets its default.
 * Only for a record being created: an existing record keeps its values.
 *
 * @param categoryFor the category list by name (`appStore.tryGetCategory`); only asked for the type's own lists
 * @param year the season whose usage entry is checked
 */
export function applyResourceType(resource: ResourceModel, type: string, categoryFor: (name: string) => CategoryListModel | undefined, year: number): ResourceModel {
  const result = { ...resource, type } as ResourceModel;
  const subTypeList = getCategoryNameForResourceType(type);
  const subTypes = subTypeList ? categoryFor(subTypeList) : undefined;
  if (subTypes && subTypes.items.length > 0) {
    if (!subTypes.items.some(item => item.name === result.subType)) {
      result.subType = defaultItemName(subTypes, getDefaultForResourceType(type));
    }
  } else if (type !== resource.type) {
    result.subType = getDefaultForResourceType(type);
  }
  const usageList = getUsageNameForResourceType(type);
  const usages = usageList ? categoryFor(usageList) : undefined;
  const current = getUsageForYear(result.usage, year) ?? '';
  if (usages && usages.items.length > 0 && !usages.items.some(item => item.name === current)) {
    result.usage = defaultItemName(usages, DEFAULT_RBOAT_USAGE);
  }
  return result;
}

export function getCategoryNameForResourceType(resourceType?: string): string | undefined {
  if (!resourceType) return undefined;
  switch (resourceType) {
    case 'rboat': return 'rboat_type';
    case 'car': return 'car_type';
    case 'locker': return 'gender';
    case 'pet': return 'pet_type';
    case 'key':  // no subType
    case 'realestate': // tbd: realestate_type
    case 'boat': // tbd: return 'boat_type';
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