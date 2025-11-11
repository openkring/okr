import { DEFAULT_COUNT, DEFAULT_CURRENCY, DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_OCAT, DEFAULT_OSTATE, DEFAULT_PRICE, DEFAULT_PRIORITY, DEFAULT_RBOAT_TYPE, DEFAULT_RESOURCE_TYPE, DEFAULT_TAGS, END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { AccountModel, OrgModel, OwnershipModel, PersonModel, ResourceModel } from '@bk2/shared-models';
import { addIndexElement, die, getTodayStr, isPerson, isResource, isType } from '@bk2/shared-util-core';

import { OwnershipFormModel } from './ownership-form.model';

export function newOwnershipFormModel(): OwnershipFormModel {
  return {
    bkey: DEFAULT_KEY,
    tags: DEFAULT_TAGS,
    notes: DEFAULT_NOTES,

    ownerKey: DEFAULT_KEY,
    ownerName1: DEFAULT_NAME,
    ownerName2: DEFAULT_NAME,
    ownerModelType: 'person',
    ownerType: DEFAULT_GENDER,

    resourceKey: DEFAULT_KEY,
    resourceName: DEFAULT_NAME,
    resourceModelType: 'resource',
    resourceType: DEFAULT_RESOURCE_TYPE,
    resourceSubType: DEFAULT_RBOAT_TYPE,

    validFrom: getTodayStr(),
    validTo: END_FUTURE_DATE_STR,
    ownershipCategory: DEFAULT_OCAT,
    ownershipState: DEFAULT_OSTATE,

    count: DEFAULT_COUNT,
    order: 1,

    price: DEFAULT_PRICE,
    currency: DEFAULT_CURRENCY,
    periodicity: 'yearly',
  };
}

export function convertOwnershipToForm(ownership: OwnershipModel | undefined): OwnershipFormModel {
  if (!ownership) return newOwnershipFormModel();
  return {
    bkey: ownership.bkey ?? DEFAULT_KEY,
    tags: ownership.tags ?? DEFAULT_TAGS,
    notes: ownership.notes ?? DEFAULT_NOTES,

    ownerKey: ownership.ownerKey ?? DEFAULT_KEY,
    ownerName1: ownership.ownerName1 ?? DEFAULT_NAME,
    ownerName2: ownership.ownerName2 ?? DEFAULT_NAME,
    ownerModelType: ownership.ownerModelType ?? 'person',
    ownerType: ownership.ownerType ?? DEFAULT_GENDER,

    resourceKey: ownership.resourceKey ?? DEFAULT_KEY,
    resourceName: ownership.resourceName ?? DEFAULT_NAME,
    resourceModelType: ownership.resourceModelType ?? 'resource',
    resourceType: ownership.resourceType ?? DEFAULT_RESOURCE_TYPE,
    resourceSubType: ownership.resourceSubType ?? DEFAULT_RBOAT_TYPE,

    validFrom: ownership.validFrom ?? getTodayStr(),
    validTo: ownership.validTo ?? END_FUTURE_DATE_STR,
    ownershipCategory: ownership.ownershipCategory ?? DEFAULT_OCAT,
    ownershipState: ownership.ownershipState ?? DEFAULT_OSTATE,

    count: ownership.count ?? DEFAULT_COUNT,
    order: ownership.order ?? 1,

    price: ownership.price ?? DEFAULT_PRICE,
    currency: ownership.currency ?? DEFAULT_CURRENCY,
    periodicity: ownership.periodicity ?? 'yearly',
  };
}

/**
 * Only convert back the fields that can be changed by the user. Derived fields form person/org or resource/account are not converted.
 * @param ownership the ownership to be updated.
 * @param vm the view model, ie. the form data with the updated values.
 * @returns the updated ownership.
 */
export function convertFormToOwnership(ownership?: OwnershipModel, vm?: OwnershipFormModel, tenantId?: string): OwnershipModel {
  if (!tenantId) die('ownership.util.convertFormToOwnership(): tenantId is mandatory.');
  if (!vm) return ownership ?? new OwnershipModel(tenantId);
  if (!ownership) {
    ownership = new OwnershipModel(tenantId);
    ownership.bkey = vm.bkey ?? DEFAULT_KEY;
  }

  ownership.validFrom = vm.validFrom ?? DEFAULT_DATE;
  ownership.validTo = vm.validTo ?? DEFAULT_DATE;

  ownership.price = vm.price ?? DEFAULT_PRICE;
  ownership.currency = vm.currency ?? DEFAULT_CURRENCY;
  ownership.periodicity = vm.periodicity ?? 'yearly';
  ownership.count = vm.count ?? DEFAULT_COUNT;
  ownership.order = vm.order ?? 0;
  ownership.ownershipState = vm.ownershipState ?? DEFAULT_OSTATE;
  ownership.ownershipCategory = vm.ownershipCategory ?? DEFAULT_OCAT;
  ownership.notes = vm.notes ?? DEFAULT_NOTES;
  ownership.tags = vm.tags ?? DEFAULT_TAGS;
  return ownership;
}

/**
 * Creates a new ownership between a person or org and a resource or account for the current tenant.
 * @param owner
 * @param resource
 * @param tenantId
 * @param ownershipType
 * @param validFrom
 * @returns
 */
export function newOwnership(owner: PersonModel | OrgModel, resource: ResourceModel | AccountModel, tenantId: string, validFrom = getTodayStr()): OwnershipModel {
  if (!owner.bkey) die('ownership.util.newOwnership(): owner.bkey is mandatory.');
  const _ownership = new OwnershipModel(tenantId);

  _ownership.validFrom = validFrom;
  _ownership.validTo = END_FUTURE_DATE_STR;

  _ownership.ownerKey = owner.bkey;
  if (isPerson(owner, tenantId)) {
    _ownership.ownerModelType = 'person';
    _ownership.ownerName1 = owner.firstName;
    _ownership.ownerName2 = owner.lastName;
    _ownership.ownerType = owner.gender;
  } else {
    _ownership.ownerModelType = 'org';
    _ownership.ownerName1 = '';
    _ownership.ownerName2 = owner.name;
    _ownership.ownerType = owner.type;
  }

  _ownership.resourceKey = resource.bkey;
  _ownership.resourceName = resource.name;
  if (isResource(resource, tenantId)) {
    _ownership.resourceModelType = 'resource';
    _ownership.resourceType = resource.type;
    _ownership.resourceSubType = resource.subType;
  } else {
    _ownership.resourceModelType = 'account';
    _ownership.resourceType = resource.type;
    _ownership.resourceSubType = '';
  }
  return _ownership;
}

export function getOwnerName(ownership: OwnershipModel): string {
  // tbd: consider NameDisplay
  if (ownership.ownerModelType === 'person') {
    return `${ownership.ownerName1} ${ownership.ownerName2}`;
  } else {
    return ownership.ownerName2;
  }
}

// THERE ARE NO OWNERSHIP CATEGORY CHANGES. THE CATEGORY IS FIXED FOR THE WHOLE LIFETIME OF THE OWNERSHIP.
// therefore, there is no priority nor priorRelLog needed
// relLogEntry can be computed with validFrom-[validTo|...]/category

export function isOwnership(ownership: unknown, tenantId: string): ownership is OwnershipModel {
  return isType(ownership, new OwnershipModel(tenantId));
}

/************************************************* Search Index ********************************************************** */
export function getOwnershipSearchIndex(ownership: OwnershipModel): string {
  let _index = '';
  _index = addIndexElement(_index, 'on', getOwnerName(ownership));
  _index = addIndexElement(_index, 'rn', ownership.resourceName);
  return _index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getOwnershipSearchIndexInfo(): string {
  return 'on:ownerName rn:resourceName';
}
