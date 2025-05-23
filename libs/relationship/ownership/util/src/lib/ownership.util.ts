import { END_FUTURE_DATE_STR } from '@bk2/shared/config';
import { AccountModel, AccountType, GenderType, ModelType, OrgModel, OwnershipModel, OwnershipType, Periodicity, PersonModel, ResourceModel, ResourceType, RowingBoatType } from '@bk2/shared/models';
import { die, getTodayStr, isPerson, isResource, isType } from '@bk2/shared/util';
import { OwnershipFormModel } from './ownership-form.model';
import { addIndexElement } from '@bk2/shared/data';

export function newOwnershipFormModel(): OwnershipFormModel {
  return {
    bkey: '',
    tags: '',
    notes: '',

    ownerKey: '',
    ownerName1: '',
    ownerName2: '',
    ownerModelType: ModelType.Person,
    ownerType: GenderType.Male,

    resourceKey: '',
    resourceName: '',
    resourceModelType: ModelType.Resource,
    resourceType: ResourceType.Key,
    resourceSubType: RowingBoatType.b1x,

    validFrom: getTodayStr(),
    validTo: END_FUTURE_DATE_STR,
    ownershipCategory: 'use',
    ownershipState: 'active',

    count: '1',
    priority: 0,

    price: 0,
    currency: 'CHF',
    periodicity: Periodicity.Yearly
  }
}

export function convertOwnershipToForm(ownership: OwnershipModel | undefined): OwnershipFormModel {
  if (!ownership) return newOwnershipFormModel();
  return {
    bkey: ownership.bkey ?? '',
    tags: ownership.tags ?? '',
    notes: ownership.notes ?? '',

    ownerKey: ownership.ownerKey ?? '',
    ownerName1: ownership.ownerName1 ?? '',
    ownerName2: ownership.ownerName2 ?? '',
    ownerModelType: ownership.ownerModelType ?? ModelType.Person,
    ownerType: ownership.ownerType ?? GenderType.Male,

    resourceKey: ownership.resourceKey ?? '',
    resourceName: ownership.resourceName ?? '',
    resourceModelType: ownership.resourceModelType ?? ModelType.Resource,
    resourceType: ownership.resourceType ?? ResourceType.Key,
    resourceSubType: ownership.resourceSubType ?? RowingBoatType.b1x,

    validFrom: ownership.validFrom ?? getTodayStr(),
    validTo: ownership.validTo ?? END_FUTURE_DATE_STR,
    ownershipCategory: ownership.ownershipCategory ?? 'use',
    ownershipState: ownership.ownershipState ?? 'active',

    count: ownership.count ?? '1',
    priority: ownership.priority ?? 0,

    price: ownership.price ?? 0,
    currency: ownership.currency ?? 'CHF',
    periodicity: ownership.periodicity ?? Periodicity.Yearly
  }
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
    ownership.bkey = vm.bkey ?? '';
  }

  ownership.validFrom = vm.validFrom ?? '';
  ownership.validTo = vm.validTo ?? '';

  ownership.price = vm.price ?? 0;
  ownership.currency = vm.currency ?? 'CHF';
  ownership.periodicity = vm.periodicity ?? Periodicity.Yearly;
  ownership.count = vm.count ?? '1';
  ownership.priority = vm.priority ?? 0;
  ownership.ownershipState = vm.ownershipState ?? 'active';
  ownership.ownershipCategory = vm.ownershipCategory ?? 'use';
  ownership.notes = vm.notes ?? '';
  ownership.tags = vm.tags ?? '';
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
export function newOwnership(owner: PersonModel | OrgModel, resource: ResourceModel | AccountModel, tenantId: string, validFrom = getTodayStr(), ownershipType = OwnershipType.Possession): OwnershipModel {
  if (!owner.bkey) die('ownership.util.newOwnership(): owner.bkey is mandatory.');
  const _ownership = new OwnershipModel(tenantId);

  _ownership.validFrom = validFrom;
  _ownership.validTo = END_FUTURE_DATE_STR;

  _ownership.ownerKey = owner.bkey;
  if(isPerson(owner, tenantId)) {
    _ownership.ownerModelType = ModelType.Person;
    _ownership.ownerName1 = owner.firstName;
    _ownership.ownerName2 = owner.lastName;
    _ownership.ownerType = owner.gender;
  } else {
    _ownership.ownerModelType = ModelType.Org;
    _ownership.ownerName1 = '';
    _ownership.ownerName2 = owner.name;
    _ownership.ownerType = owner.type;
  }

  _ownership.resourceKey = resource.bkey;
  _ownership.resourceName = resource.name;
  if(isResource(resource, tenantId)) {
    _ownership.resourceModelType = ModelType.Resource;
    _ownership.resourceType = resource.type as ResourceType;
    _ownership.resourceSubType = resource.subType;
  } else {
    _ownership.resourceModelType = ModelType.Account;
    _ownership.resourceType = resource.type as AccountType;
    _ownership.resourceSubType = undefined;
  }
  return _ownership;
}

export function getOwnerName(ownership: OwnershipModel): string {
  // tbd: consider NameDisplay
  if (ownership.ownerModelType === ModelType.Person) {
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