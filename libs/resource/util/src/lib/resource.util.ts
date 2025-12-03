import { ResourceModel } from '@bk2/shared-models';
import { addIndexElement, die, extractFirstPartOfOptionalTupel, extractSecondPartOfOptionalTupel } from '@bk2/shared-util-core';

import { ResourceFormModel } from './resource-form.model';
import { DEFAULT_CAR_TYPE, DEFAULT_GENDER, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_RBOAT_TYPE, DEFAULT_RBOAT_USAGE, DEFAULT_RESOURCE_TYPE, DEFAULT_TAGS } from '@bk2/shared-constants';

/* ----------------------------- */
export function convertResourceToForm(resource?: ResourceModel): ResourceFormModel | undefined {
  if (!resource) return undefined;

  // locker:  name = lockerNr/keyNr, subType = GenderType
  // key:     name = keyNr
  // boat:    name = boatName, subType = boatType
  // car:     name = carName, subType = carType
  // default: name = name, subType = undefined
  return {
    bkey: resource.bkey,
    name: resource.name,
    keyNr: getKeyNr(resource),
    lockerNr: getLockerNr(resource),
    type: resource.type,
    subType: resource.subType, // carType, rowingBoatType, boatType, gender (Locker) etc.
    usage: resource.usage,
    currentValue: resource.currentValue,
    weight: resource.weight,
    load: resource.load,
    brand: resource.brand,
    model: resource.model,
    serialNumber: resource.serialNumber,
    seats: resource.seats,
    length: resource.length,
    width: resource.width,
    height: resource.height,
    data: resource.data ?? [],
    hexColor: resource.color,
    description: resource.description,
    tags: resource.tags,
  };
}

function getKeyNr(resource: ResourceModel): number {
  if (resource.type === 'locker') {
    return parseInt(extractSecondPartOfOptionalTupel(resource.name, '/'));
  } else {
    return 0;
  }
}

function getLockerNr(resource: ResourceModel): number {
  return resource.type === 'locker' ? parseInt(extractFirstPartOfOptionalTupel(resource.name, '/')) : 0;
}

export function convertFormToResource(vm?: ResourceFormModel, resource?: ResourceModel): ResourceModel {
  if (!resource) die('resource.util.convertFormToResource: resource is mandatory.');
  if (!vm) return resource;
  
  resource.bkey = vm.bkey ?? DEFAULT_KEY;
  resource.name = vm.name ?? DEFAULT_NAME;
  resource.type = vm.type ?? DEFAULT_RESOURCE_TYPE;
  resource.subType = getDefaultForResourceType(resource.type);
  resource.usage = vm.usage ?? DEFAULT_RBOAT_USAGE;
  resource.currentValue = parseInt(vm.currentValue + ''); // make sure it's a number (input returns string)
  resource.weight = parseInt(vm.weight + ''); // make sure it's a number (input returns string)
  resource.load = vm.load ?? '';
  resource.color = vm.hexColor ?? '';
  resource.description = vm.description ?? DEFAULT_NOTES;
  resource.tags = vm.tags ?? DEFAULT_TAGS;

  return resource;
}

export function getDefaultForResourceType(resourceType?: string): string {
  if (!resourceType) return '';
  switch (resourceType) {
    case 'rboat': return DEFAULT_RBOAT_TYPE;
    case 'locker': return DEFAULT_GENDER;
    case 'car': return DEFAULT_CAR_TYPE;
    default: return '';
  }
}

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

/* ---------------------- Getters -------------------------*/
export function getResourceTitle(resourceType: string, operation: string | undefined, isResourceAdmin: boolean): string {
  const _operation = operation || isResourceAdmin ? 'update' : 'view';
  return `@resource.${resourceType}.operation.${_operation}.label`;
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