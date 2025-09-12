import { END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { CategoryItemModel, GenderType, MembershipModel, ModelType, OrgModel, OrgType, Periodicity, PersonModel, UserModel } from '@bk2/shared-models';
import { addIndexElement, DateFormat, die, getFullPersonName, getTodayStr } from '@bk2/shared-util-core';

import { CategoryChangeFormModel } from './category-change-form.model';
import { MembershipFormModel } from './membership-form.model';
import { MembershipNewFormModel } from './membership-new-form.model';

export function newMembershipFormModel(): MembershipFormModel {
  return {
    bkey: '',
    tags: '',
    notes: '',
    memberKey: '',
    memberName1: '',
    memberName2: '',
    memberModelType: ModelType.Person,
    memberType: GenderType.Male,
    memberNickName: '',
    memberAbbreviation: '',
    memberDateOfBirth: '',
    memberDateOfDeath: '',
    memberZipCode: '',
    memberBexioId: '',
    orgKey: '',
    orgName: '',
    memberId: '',
    dateOfEntry: '',
    dateOfExit: '',
    membershipCategory: 'active',
    orgFunction: '',
    priority: 0,
    relLog: '',
    relIsLast: true,
    price: 0,
    currency: 'CHF',
    periodicity: Periodicity.Yearly,
  };
}

export function convertMembershipToForm(membership: MembershipModel | undefined): MembershipFormModel {
  if (!membership) return newMembershipFormModel();
  return {
    bkey: membership.bkey ?? '',
    tags: membership.tags ?? '',
    notes: membership.notes ?? '',
    memberKey: membership.memberKey ?? '',
    memberName1: membership.memberName1 ?? '',
    memberName2: membership.memberName2 ?? '',
    memberModelType: membership.memberModelType ?? ModelType.Person,
    memberType: membership.memberType ?? (membership.memberModelType === ModelType.Person ? GenderType.Male : OrgType.Association),
    memberNickName: membership.memberNickName ?? '',
    memberAbbreviation: membership.memberAbbreviation ?? '',
    memberDateOfBirth: membership.memberDateOfBirth ?? '',
    memberDateOfDeath: membership.memberDateOfDeath ?? '',
    memberZipCode: membership.memberZipCode ?? '',
    memberBexioId: membership.memberBexioId ?? '',
    orgKey: membership.orgKey ?? '',
    orgName: membership.orgName ?? '',
    memberId: membership.memberId ?? '',
    dateOfEntry: membership.dateOfEntry ?? '',
    dateOfExit: membership.dateOfExit ?? '',
    membershipCategory: membership.membershipCategory ?? 'active',
    orgFunction: membership.orgFunction ?? '',
    priority: membership.priority ?? 0,
    relLog: membership.relLog ?? '',
    relIsLast: membership.relIsLast ?? true,
    price: membership.price ?? 0,
    currency: membership.currency ?? 'CHF',
    periodicity: membership.periodicity ?? Periodicity.Yearly,
  };
}

/**
 * Only convert back the fields that can be changed by the user.
 * @param membership the membership to be updated.
 * @param vm the view model, ie. the form data with the updated values.
 * @returns the updated membership.
 */
export function convertFormToMembership(membership: MembershipModel | undefined, vm: MembershipFormModel, tenantId: string): MembershipModel {
  if (!membership) {
    membership = new MembershipModel(tenantId);
    membership.bkey = vm.bkey ?? '';
  }
  membership.tags = vm.tags ?? '';
  membership.notes = vm.notes ?? '';

  // the member attributes are copied from the person or org and not editable (with the exception of nickName, abbreviation, and bexioId that are editable in memberhsip only)
  membership.memberKey = vm.memberKey ?? '';
  membership.memberName1 = vm.memberName1 ?? '';
  membership.memberName2 = vm.memberName2 ?? '';
  membership.memberModelType = vm.memberModelType ?? ModelType.Person;
  membership.memberType = vm.memberType ?? vm.memberModelType === ModelType.Person ? GenderType.Male : OrgType.Association;
  membership.memberNickName = vm.memberNickName ?? '';
  membership.memberAbbreviation = vm.memberAbbreviation ?? '';
  membership.memberDateOfBirth = vm.memberDateOfBirth ?? ''; // readonly
  membership.memberDateOfDeath = vm.memberDateOfDeath ?? ''; // readonly
  membership.memberZipCode = vm.memberZipCode ?? ''; // readonly
  membership.memberBexioId = vm.memberBexioId ?? ''; // can be a different one than the person's bexioId, default is to use the persons' bexioId

  membership.orgKey = vm.orgKey ?? '';
  membership.orgName = vm.orgName ?? '';

  membership.memberId = vm.memberId ?? '';
  membership.dateOfEntry = vm.dateOfEntry ?? '';
  membership.dateOfExit = vm.dateOfExit ?? '';
  membership.membershipCategory = vm.membershipCategory ?? 'active';
  membership.orgFunction = vm.orgFunction ?? '';

  membership.priority = vm.priority ?? 0;
  membership.relLog = vm.relLog ?? '';
  membership.relIsLast = vm.relIsLast ?? true;

  membership.price = parseInt(vm.price + '') ?? 0; // make sure it's a number (input returns string)
  membership.currency = vm.currency ?? 'CHF';
  membership.periodicity = vm.periodicity ?? Periodicity.Yearly;

  return membership;
}

export function newMembershipForPerson(person: PersonModel, orgKey: string, orgName: string, membershipCategory: CategoryItemModel, dateOfEntry = getTodayStr(DateFormat.StoreDate)): MembershipModel {
  const _membership = new MembershipModel('dummy');
  _membership.tenants = person.tenants;

  _membership.memberKey = person.bkey ?? die('membership.util.newMembershipForPerson: person.bkey is undefined');
  _membership.memberName1 = person.firstName;
  _membership.memberName2 = person.lastName;
  _membership.memberModelType = ModelType.Person;
  _membership.memberType = person.gender;
  _membership.memberDateOfBirth = person.dateOfBirth;
  _membership.memberDateOfDeath = person.dateOfDeath;
  _membership.memberZipCode = person.fav_zip;
  _membership.memberBexioId = person.bexioId;

  _membership.orgKey = orgKey;
  _membership.orgName = orgName;

  _membership.dateOfEntry = dateOfEntry;
  _membership.dateOfExit = END_FUTURE_DATE_STR;
  _membership.membershipCategory = membershipCategory.name;

  _membership.priority = 1;
  _membership.relLog = getRelLogEntry(_membership.priority, '', _membership.dateOfEntry, membershipCategory.abbreviation);
  _membership.relIsLast = true;

  _membership.price = 0;

  return _membership;
}

export function newMembershipForOrg(org: OrgModel, orgKey: string, orgName: string, membershipCategory: CategoryItemModel, dateOfEntry = getTodayStr(DateFormat.StoreDate)): MembershipModel {
  const _membership = new MembershipModel('dummy');
  _membership.tenants = org.tenants;

  _membership.memberKey = org.bkey ?? die('membership.util.newMembershipForOrg: org.bkey is undefined');
  _membership.memberName1 = '';
  _membership.memberName2 = org.name;
  _membership.memberModelType = ModelType.Org;
  _membership.memberType = OrgType.Association;
  _membership.memberDateOfBirth = org.dateOfFoundation;
  _membership.memberDateOfDeath = '';
  _membership.memberZipCode = org.fav_zip;
  _membership.memberBexioId = org.bexioId;

  _membership.orgKey = orgKey;
  _membership.orgName = orgName;

  _membership.dateOfEntry = dateOfEntry;
  _membership.dateOfExit = END_FUTURE_DATE_STR;
  _membership.membershipCategory = membershipCategory.name;

  _membership.priority = 1;
  _membership.relLog = getRelLogEntry(_membership.priority, '', _membership.dateOfEntry, membershipCategory.abbreviation);
  _membership.relIsLast = true;

  _membership.price = 0;

  return _membership;
}

export function convertMembershipToCategoryChangeForm(membership: MembershipModel): CategoryChangeFormModel {
  return {
    bkey: membership.bkey ?? '', // readonly
    memberName: membership.memberName1 + ' ' + membership.memberName2, // readonly
    orgName: membership.orgName ?? '', // readonly
    dateOfChange: getTodayStr(DateFormat.StoreDate),
    membershipCategoryOld: membership.membershipCategory ?? 'active', // readonly
    membershipCategoryNew: membership.membershipCategory ?? 'active',
  };
}

export function convertMemberAndOrgToNewForm(member: PersonModel | OrgModel, org: OrgModel, currentUser?: UserModel, modelType?: ModelType): MembershipNewFormModel {
  if (!currentUser) die('membership.util.convertMemberAndOrgToNewForm: currentUser is mandatory');
  if (!modelType) die('membership.util.convertMemberAndOrgToNewForm: modelType is mandatory');

  // tbd: resolve the org name with OrgService.read(orgKey)
  if (modelType === ModelType.Person) {
    const _person = member as PersonModel;
    return {
      memberKey: _person.bkey,
      memberName1: _person.firstName,
      memberName2: _person.lastName,
      memberName: getMemberName(_person, currentUser),
      memberModelType: ModelType.Person,
      memberType: _person.gender,
      memberDateOfBirth: _person.dateOfBirth,
      memberDateOfDeath: _person.dateOfDeath,
      memberZipCode: _person.fav_zip,
      memberBexioId: _person.bexioId,

      orgKey: org.bkey,
      orgName: org.name,
      dateOfEntry: getTodayStr(),
      membershipCategory: 'active',
      membershipCategoryAbbreviation: 'A',
    };
  }
  if (modelType === ModelType.Org) {
    const _org = member as OrgModel;
    return {
      memberKey: _org.bkey,
      memberName1: '',
      memberName2: _org.name,
      memberName: _org.name,
      memberModelType: ModelType.Org,
      memberType: _org.type,
      memberDateOfBirth: _org.dateOfFoundation,
      memberDateOfDeath: _org.dateOfLiquidation,
      memberZipCode: _org.fav_zip,
      memberBexioId: _org.bexioId,

      orgKey: org.bkey,
      orgName: org.name,
      dateOfEntry: getTodayStr(),
      membershipCategory: 'active',
      membershipCategoryAbbreviation: 'A',
    };
  }
  die('membership.util.convertMembershipToNewForm: member is neither a person nor an org');
}

export function convertFormToNewMembership(vm: MembershipNewFormModel, tenantId: string): MembershipModel {
  const _membership = new MembershipModel(tenantId);
  _membership.tenants = [tenantId];
  _membership.isArchived = false;
  _membership.tags = '';
  _membership.notes = '';
  _membership.memberKey = vm.memberKey ?? die('membership.util.convertFormToNewMembership: memberKey is mandatory');
  _membership.memberName1 = vm.memberName1 ?? '';
  _membership.memberName2 = vm.memberName2 ?? '';
  _membership.memberModelType = vm.memberModelType ?? ModelType.Person;
  _membership.memberType = vm.memberType;
  _membership.memberNickName = '';
  _membership.memberAbbreviation = '';
  _membership.memberDateOfBirth = vm.memberDateOfBirth ?? '';
  _membership.memberDateOfDeath = vm.memberDateOfDeath ?? '';
  _membership.memberZipCode = vm.memberZipCode ?? '';
  _membership.memberBexioId = vm.memberBexioId ?? '';
  _membership.memberId = '';
  _membership.orgKey = vm.orgKey ?? die('membership.util.convertFormToNewMembership: orgKey is mandatory');
  _membership.orgName = vm.orgName ?? '';
  _membership.dateOfEntry = vm.dateOfEntry ?? getTodayStr();
  _membership.dateOfExit = END_FUTURE_DATE_STR;
  _membership.membershipCategory = vm.membershipCategory ?? 'active';
  _membership.membershipState = 'active';
  _membership.priority = 1;
  _membership.relLog = getRelLogEntry(_membership.priority, '', _membership.dateOfEntry, vm.membershipCategoryAbbreviation ?? 'A');
  _membership.relIsLast = true;
  _membership.price = 0;
  _membership.currency = 'CHF';
  _membership.periodicity = Periodicity.Yearly;
  _membership.index = getMembershipSearchIndex(_membership);
  return _membership;
}

function getMemberName(person?: PersonModel, currentUser?: UserModel): string {
  if (person) {
    return getFullPersonName(person.firstName, person.lastName);
  } else if (currentUser) {
    return getFullPersonName(currentUser.firstName, currentUser.lastName);
  } else {
    return '';
  }
}

export function getMembershipName(membership: MembershipModel): string {
  // tbd: consider NameDisplay
  if (membership.memberModelType === ModelType.Person) {
    return `${membership.memberName1} ${membership.memberName2}`;
  } else {
    return membership.memberName2;
  }
}

/**
 * Generate a relLog entry for a membership change.
 * @param priority the priority of the current membership
 * @param priorRelLog the relLog entry of the previous membership
 * @param dateOfEntry the start date of the current membership
 * @param category the membership category abbreviation for the current membership
 * @returns
 */
export function getRelLogEntry(priority: number, priorRelLog: string, dateOfEntry: string, category: string): string {
  let _relLog = '';
  if (priority === 1) {
    // first membership
    _relLog = `${dateOfEntry}:${category}`;
  } else {
    _relLog = `${priorRelLog},${category}`;
  }
  return _relLog;
}

/**
 * Generate a comment for a membership change. e.g. J -> A
 * @param oldMembershipType the old membership type
 * @param newMembershipType the new membership type
 * @returns a short description of the membership change
 */
export function getMembershipCategoryChangeComment(oldMembershipCategory?: string, newMembershipCategory?: string): string {
  const _oldMembershipCategory = oldMembershipCategory ?? 'undefined';
  const _newMembershipCategory = newMembershipCategory ?? 'undefined';
  return `${_oldMembershipCategory} -> ${_newMembershipCategory}`;
}

export function getMembershipSearchIndex(membership: MembershipModel): string {
  let _index = '';
  _index = addIndexElement(_index, 'mn', membership.memberName1 + ' ' + membership.memberName2);
  _index = addIndexElement(_index, 'mk', membership.memberKey);
  _index = addIndexElement(_index, 'ok', membership.orgKey);
  if (membership?.memberNickName) {
    _index = addIndexElement(_index, 'nn', membership.memberNickName);
  }
  return _index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getMembershipSearchIndexInfo(): string {
  return 'mn:memberName mk:memberKey ok:orgKey [nn:nickName]';
}
