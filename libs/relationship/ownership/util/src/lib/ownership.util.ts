import { END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { AccountModel, OrgModel, OwnershipModel, PersonModel, ResourceModel } from '@bk2/shared-models';
import { addIndexElement, die, getTodayStr, isPerson, isResource, isType } from '@bk2/shared-util-core';

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
  const ownership = new OwnershipModel(tenantId);

  ownership.validFrom = validFrom;
  ownership.validTo = END_FUTURE_DATE_STR;

  ownership.ownerKey = owner.bkey;
  if (isPerson(owner, tenantId)) {
    ownership.ownerModelType = 'person';
    ownership.ownerName1 = owner.firstName;
    ownership.ownerName2 = owner.lastName;
    ownership.ownerType = owner.gender;
  } else {
    ownership.ownerModelType = 'org';
    ownership.ownerName1 = '';
    ownership.ownerName2 = owner.name;
    ownership.ownerType = owner.type;
  }

  ownership.resourceKey = resource.bkey;
  ownership.resourceName = resource.name;
  if (isResource(resource, tenantId)) {
    ownership.resourceModelType = 'resource';
    ownership.resourceType = resource.type;
    ownership.resourceSubType = resource.subType;
  } else {
    ownership.resourceModelType = 'account';
    ownership.resourceType = resource.type;
    ownership.resourceSubType = '';
  }
  return ownership;
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
export function getOwnershipIndex(ownership: OwnershipModel): string {
  let _index = '';
  _index = addIndexElement(_index, 'on', getOwnerName(ownership));
  _index = addIndexElement(_index, 'rn', ownership.resourceName);
  return _index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getOwnershipIndexInfo(): string {
  return 'on:ownerName rn:resourceName';
}
