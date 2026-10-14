import { END_FUTURE_DATE_STR } from '@okr/shared-constants';
import { AccountModel, OrgModel, OwnershipModel, PersonModel, ResourceModel } from '@okr/shared-models';
import { addIndexElement, die, getTodayStr, isResource, isType } from '@okr/shared-util-core';

/**
 * Creates a new ownership between a person or org and a resource or account for the current tenant.
 * @param owner
 * @param resource
 * @param tenantId
 * @param ownershipType
 * @param validFrom
 * @returns
 */
/**
 * Creates a new ownership of a resource (or account) by a person or an org.
 * The owner type is explicit: isPerson() only checks the tenant, so it also accepts an org — which
 * stored orgs as persons without a name (and the org's avatar never showed).
 */
export function newOwnership(owner: PersonModel | OrgModel, resource: ResourceModel | AccountModel, tenantId: string, ownerModelType: 'person' | 'org', validFrom = getTodayStr()): OwnershipModel {
  if (!owner.okey) die('ownership.util.newOwnership(): owner.okey is mandatory.');
  const ownership = new OwnershipModel(tenantId);

  ownership.validFrom = validFrom;
  ownership.validTo = END_FUTURE_DATE_STR;

  ownership.ownerKey = owner.okey;
  if (ownerModelType === 'person') {
    const person = owner as PersonModel;
    ownership.ownerModelType = 'person';
    ownership.ownerName1 = person.firstName;
    ownership.ownerName2 = person.lastName;
    ownership.ownerType = person.gender;
  } else {
    const org = owner as OrgModel;
    ownership.ownerModelType = 'org';
    ownership.ownerName1 = '';
    ownership.ownerName2 = org.name;
    ownership.ownerType = org.type;
  }

  ownership.resourceKey = resource.okey;
  ownership.resourceName = resource.name;
  if (isResource(resource, tenantId)) {
    const res = resource as ResourceModel;
    ownership.resourceModelType = 'resource';
    ownership.resourceType = res.type;
    ownership.resourceSubType = res.subType;
  } else {
    const acc = resource as AccountModel;
    ownership.resourceModelType = 'account';
    ownership.resourceType = acc.type;
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
