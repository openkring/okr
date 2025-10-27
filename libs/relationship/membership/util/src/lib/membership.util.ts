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
  const membership = new MembershipModel('dummy');
  membership.tenants = person.tenants;

  membership.memberKey = person.bkey ?? die('membership.util.newMembershipForPerson: person.bkey is undefined');
  membership.memberName1 = person.firstName;
  membership.memberName2 = person.lastName;
  membership.memberModelType = ModelType.Person;
  membership.memberType = person.gender;
  membership.memberDateOfBirth = person.dateOfBirth;
  membership.memberDateOfDeath = person.dateOfDeath;
  membership.memberZipCode = person.fav_zip_code;
  membership.memberBexioId = person.bexioId;

  membership.orgKey = orgKey;
  membership.orgName = orgName;

  membership.dateOfEntry = dateOfEntry;
  membership.dateOfExit = END_FUTURE_DATE_STR;
  membership.membershipCategory = membershipCategory.name;

  membership.priority = 1;
  membership.relLog = getRelLogEntry(membership.priority, '', membership.dateOfEntry, membershipCategory.abbreviation);
  membership.relIsLast = true;

  membership.price = 0;

  return membership;
}

export function newMembershipForOrg(org: OrgModel, orgKey: string, orgName: string, membershipCategory: CategoryItemModel, dateOfEntry = getTodayStr(DateFormat.StoreDate)): MembershipModel {
  const membership = new MembershipModel('dummy');
  membership.tenants = org.tenants;

  membership.memberKey = org.bkey ?? die('membership.util.newMembershipForOrg: org.bkey is undefined');
  membership.memberName1 = '';
  membership.memberName2 = org.name;
  membership.memberModelType = ModelType.Org;
  membership.memberType = OrgType.Association;
  membership.memberDateOfBirth = org.dateOfFoundation;
  membership.memberDateOfDeath = '';
  membership.memberZipCode = org.fav_zip_code;
  membership.memberBexioId = org.bexioId;

  membership.orgKey = orgKey;
  membership.orgName = orgName;

  membership.dateOfEntry = dateOfEntry;
  membership.dateOfExit = END_FUTURE_DATE_STR;
  membership.membershipCategory = membershipCategory.name;

  membership.priority = 1;
  membership.relLog = getRelLogEntry(membership.priority, '', membership.dateOfEntry, membershipCategory.abbreviation);
  membership.relIsLast = true;

  membership.price = 0;

  return membership;
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
    const person = member as PersonModel;
    return {
      memberKey: person.bkey,
      memberName1: person.firstName,
      memberName2: person.lastName,
      memberName: getMemberName(person, currentUser),
      memberModelType: ModelType.Person,
      memberType: person.gender,
      memberDateOfBirth: person.dateOfBirth,
      memberDateOfDeath: person.dateOfDeath,
      memberZipCode: person.fav_zip_code,
      memberBexioId: person.bexioId,

      orgKey: org.bkey,
      orgName: org.name,
      dateOfEntry: getTodayStr(),
      membershipCategory: 'active',
      membershipCategoryAbbreviation: 'A',
    };
  }
  if (modelType === ModelType.Org) {
    const org = member as OrgModel;
    return {
      memberKey: org.bkey,
      memberName1: '',
      memberName2: org.name,
      memberName: org.name,
      memberModelType: ModelType.Org,
      memberType: org.type,
      memberDateOfBirth: org.dateOfFoundation,
      memberDateOfDeath: org.dateOfLiquidation,
      memberZipCode: org.fav_zip_code,
      memberBexioId: org.bexioId,

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
  const membership = new MembershipModel(tenantId);
  membership.tenants = [tenantId];
  membership.isArchived = false;
  membership.tags = '';
  membership.notes = '';
  membership.memberKey = vm.memberKey ?? die('membership.util.convertFormToNewMembership: memberKey is mandatory');
  membership.memberName1 = vm.memberName1 ?? '';
  membership.memberName2 = vm.memberName2 ?? '';
  membership.memberModelType = vm.memberModelType ?? ModelType.Person;
  membership.memberType = vm.memberType;
  membership.memberNickName = '';
  membership.memberAbbreviation = '';
  membership.memberDateOfBirth = vm.memberDateOfBirth ?? '';
  membership.memberDateOfDeath = vm.memberDateOfDeath ?? '';
  membership.memberZipCode = vm.memberZipCode ?? '';
  membership.memberBexioId = vm.memberBexioId ?? '';
  membership.memberId = '';
  membership.orgKey = vm.orgKey ?? die('membership.util.convertFormToNewMembership: orgKey is mandatory');
  membership.orgName = vm.orgName ?? '';
  membership.dateOfEntry = vm.dateOfEntry ?? getTodayStr();
  membership.dateOfExit = END_FUTURE_DATE_STR;
  membership.membershipCategory = vm.membershipCategory ?? 'active';
  membership.membershipState = 'active';
  membership.priority = 1;
  membership.relLog = getRelLogEntry(membership.priority, '', membership.dateOfEntry, vm.membershipCategoryAbbreviation ?? 'A');
  membership.relIsLast = true;
  membership.price = 0;
  membership.currency = 'CHF';
  membership.periodicity = Periodicity.Yearly;
  membership.index = getMembershipSearchIndex(membership);
  return membership;
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
  let relLog = '';
  if (priority === 1) {
    // first membership
    relLog = `${dateOfEntry}:${category}`;
  } else {
    relLog = `${priorRelLog},${category}`;
  }
  return relLog;
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
  return `${oldMembershipCategory} -> ${_newMembershipCategory}`;
}

export function getMembershipSearchIndex(membership: MembershipModel): string {
  let index = '';
  index = addIndexElement(index, 'mn', membership.memberName1 + ' ' + membership.memberName2);
  index = addIndexElement(index, 'mk', membership.memberKey);
  index = addIndexElement(index, 'ok', membership.orgKey);
  if (membership?.memberNickName) {
    index = addIndexElement(index, 'nn', membership.memberNickName);
  }
  return index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getMembershipSearchIndexInfo(): string {
  return 'mn:memberName mk:memberKey ok:orgKey [nn:nickName]';
}
