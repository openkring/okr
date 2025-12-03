import { DEFAULT_CURRENCY, DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_KEY, DEFAULT_MCAT, DEFAULT_MSTATE, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORG_TYPE, DEFAULT_PERIODICITY, DEFAULT_PRICE, DEFAULT_PRIORITY, DEFAULT_TAGS, END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { CategoryItemModel, MembershipModel, OrgModel, PersonModel, UserModel } from '@bk2/shared-models';
import { addIndexElement, DateFormat, die, getTodayStr } from '@bk2/shared-util-core';

import { CategoryChangeFormModel } from './category-change-form.model';
import { MembershipFormModel } from './membership-form.model';
import { MembershipNewFormModel } from './membership-new-form.model';

export function newMembershipFormModel(): MembershipFormModel {
  return {
    bkey: DEFAULT_KEY,
    tags: DEFAULT_TAGS,
    notes: DEFAULT_NOTES,
    memberKey: DEFAULT_KEY,
    memberName1: DEFAULT_NAME,
    memberName2: DEFAULT_NAME,
    memberModelType: 'person',
    memberType: DEFAULT_GENDER,
    memberNickName: DEFAULT_NAME,
    memberAbbreviation: '',
    memberDateOfBirth: DEFAULT_DATE,
    memberDateOfDeath: DEFAULT_DATE,
    memberZipCode: '',
    memberBexioId: '',
    orgKey: DEFAULT_KEY,
    orgName: DEFAULT_NAME,
    memberId: DEFAULT_ID,
    dateOfEntry: DEFAULT_DATE,
    dateOfExit: DEFAULT_DATE,
    membershipCategory: 'active',
    orgFunction: '',
    order: 0,
    relLog: '',
    relIsLast: true,
    price: DEFAULT_PRICE,
    currency: DEFAULT_CURRENCY,
    periodicity: DEFAULT_PERIODICITY,
  };
}

export function convertMembershipToForm(membership: MembershipModel | undefined): MembershipFormModel {
  if (!membership) return newMembershipFormModel();
  return {
    bkey: membership.bkey ?? DEFAULT_KEY,
    tags: membership.tags ?? DEFAULT_TAGS,
    notes: membership.notes ?? DEFAULT_NOTES,
    memberKey: membership.memberKey ?? DEFAULT_KEY,
    memberName1: membership.memberName1 ?? DEFAULT_NAME,
    memberName2: membership.memberName2 ?? DEFAULT_NAME,
    memberModelType: membership.memberModelType ?? 'person',
    memberType: membership.memberType ?? (membership.memberModelType === 'person' ? DEFAULT_GENDER : DEFAULT_ORG_TYPE),
    memberNickName: membership.memberNickName ?? DEFAULT_NAME,
    memberAbbreviation: membership.memberAbbreviation ?? '',
    memberDateOfBirth: membership.memberDateOfBirth ?? DEFAULT_DATE,
    memberDateOfDeath: membership.memberDateOfDeath ?? DEFAULT_DATE,
    memberZipCode: membership.memberZipCode ?? '',
    memberBexioId: membership.memberBexioId ?? DEFAULT_ID,
    orgKey: membership.orgKey ?? DEFAULT_KEY,
    orgName: membership.orgName ?? DEFAULT_NAME,
    memberId: membership.memberId ?? DEFAULT_ID,
    dateOfEntry: membership.dateOfEntry ?? DEFAULT_DATE,
    dateOfExit: membership.dateOfExit ?? DEFAULT_DATE,
    membershipCategory: membership.membershipCategory ?? 'active',
    orgFunction: membership.orgFunction ?? '',
    order: membership.order ?? 0,
    relLog: membership.relLog ?? '',
    relIsLast: membership.relIsLast ?? true,
    price: membership.price ?? DEFAULT_PRICE,
    currency: membership.currency ?? DEFAULT_CURRENCY,
    periodicity: membership.periodicity ?? 'yearly',
  };
}

/**
 * Only convert back the fields that can be changed by the user.
 * @param membership the membership to be updated.
 * @param vm the view model, ie. the form data with the updated values.
 * @returns the updated membership.
 */
export function convertFormToMembership(vm?: MembershipFormModel, membership?: MembershipModel): MembershipModel {
  if (!membership) die('membership.util.convertFormToMembership: membership is mandatory.');
  if (!vm) return membership;
  
  membership.tags = vm.tags ?? DEFAULT_TAGS;
  membership.notes = vm.notes ?? DEFAULT_NOTES;

  // the member attributes are copied from the person or org and not editable (with the exception of nickName, abbreviation, and bexioId that are editable in memberhsip only)
  membership.memberKey = vm.memberKey ?? DEFAULT_KEY;
  membership.memberName1 = vm.memberName1 ?? DEFAULT_NAME;
  membership.memberName2 = vm.memberName2 ?? DEFAULT_NAME;
  membership.memberModelType = vm.memberModelType ?? 'person';
  membership.memberType = vm.memberType ?? DEFAULT_GENDER;
  membership.memberNickName = vm.memberNickName ?? DEFAULT_NAME;
  membership.memberAbbreviation = vm.memberAbbreviation ?? '';
  membership.memberDateOfBirth = vm.memberDateOfBirth ?? DEFAULT_DATE; // readonly
  membership.memberDateOfDeath = vm.memberDateOfDeath ?? DEFAULT_DATE; // readonly
  membership.memberZipCode = vm.memberZipCode ?? ''; // readonly
  membership.memberBexioId = vm.memberBexioId ?? DEFAULT_ID; // can be a different one than the person's bexioId, default is to use the persons' bexioId

  membership.orgKey = vm.orgKey ?? DEFAULT_KEY;
  membership.orgName = vm.orgName ?? DEFAULT_NAME;

  membership.memberId = vm.memberId ?? DEFAULT_ID;
  membership.dateOfEntry = vm.dateOfEntry ?? DEFAULT_DATE;
  membership.dateOfExit = vm.dateOfExit ?? DEFAULT_DATE;
  membership.membershipCategory = vm.membershipCategory ?? 'active';
  membership.orgFunction = vm.orgFunction ?? '';

  membership.order = vm.order ?? 0;
  membership.relLog = vm.relLog ?? '';
  membership.relIsLast = vm.relIsLast ?? true;

  membership.price = parseInt(vm.price + '') ?? DEFAULT_PRICE; 
  membership.currency = vm.currency ?? DEFAULT_CURRENCY;
  membership.periodicity = vm.periodicity ?? 'yearly';

  return membership;
}

export function newMembershipForPerson(person: PersonModel, orgKey: string, orgName: string, membershipCategory: CategoryItemModel, dateOfEntry = getTodayStr(DateFormat.StoreDate)): MembershipModel {
  const membership = new MembershipModel('dummy');
  membership.tenants = person.tenants;

  membership.memberKey = person.bkey ?? die('membership.util.newMembershipForPerson: person.bkey is undefined');
  membership.memberName1 = person.firstName;
  membership.memberName2 = person.lastName;
  membership.memberModelType = 'person';
  membership.memberType = person.gender;
  membership.memberDateOfBirth = person.dateOfBirth;
  membership.memberDateOfDeath = person.dateOfDeath;
  membership.memberZipCode = person.favZipCode;
  membership.memberBexioId = person.bexioId;

  membership.orgKey = orgKey;
  membership.orgName = orgName;

  membership.dateOfEntry = dateOfEntry;
  membership.dateOfExit = END_FUTURE_DATE_STR;
  membership.membershipCategory = membershipCategory.name;

  membership.order = 1;
  membership.relLog = getRelLogEntry(membership.order, '', membership.dateOfEntry, membershipCategory.abbreviation);
  membership.relIsLast = true;

  membership.price = 0;

  return membership;
}

export function newMembershipForOrg(org: OrgModel, orgKey: string, orgName: string, membershipCategory: CategoryItemModel, dateOfEntry = getTodayStr(DateFormat.StoreDate)): MembershipModel {
  const membership = new MembershipModel('dummy');
  membership.tenants = org.tenants;

  membership.memberKey = org.bkey ?? die('membership.util.newMembershipForOrg: org.bkey is undefined');
  membership.memberName1 = DEFAULT_NAME;
  membership.memberName2 = org.name;
  membership.memberModelType = 'org';
  membership.memberType = org.type;
  membership.memberDateOfBirth = org.dateOfFoundation;
  membership.memberDateOfDeath = org.dateOfLiquidation;
  membership.memberZipCode = org.favZipCode;
  membership.memberBexioId = org.bexioId;

  membership.orgKey = orgKey;
  membership.orgName = orgName;

  membership.dateOfEntry = dateOfEntry;
  membership.dateOfExit = END_FUTURE_DATE_STR;
  membership.membershipCategory = membershipCategory.name;

  membership.order = 1;
  membership.relLog = getRelLogEntry(membership.order, '', membership.dateOfEntry, membershipCategory.abbreviation);
  membership.relIsLast = true;

  membership.price = DEFAULT_PRICE;

  return membership;
}

export function convertMembershipToCategoryChangeForm(membership: MembershipModel): CategoryChangeFormModel {
  return {
    bkey: membership.bkey ?? DEFAULT_KEY, // readonly
    memberName: membership.memberName1 + ' ' + membership.memberName2, // readonly
    orgName: membership.orgName ?? DEFAULT_NAME, // readonly
    dateOfChange: getTodayStr(DateFormat.StoreDate),
    membershipCategoryOld: membership.membershipCategory ?? DEFAULT_MCAT, // readonly
    membershipCategoryNew: membership.membershipCategory ?? DEFAULT_MCAT,
  };
}

export function convertMemberAndOrgToNewForm(member: PersonModel | OrgModel, org: OrgModel, currentUser?: UserModel, modelType?: string): MembershipNewFormModel {
  if (!currentUser) die('membership.util.convertMemberAndOrgToNewForm: currentUser is mandatory');
  if (!modelType) die('membership.util.convertMemberAndOrgToNewForm: modelType is mandatory');

  // tbd: resolve the org name with OrgService.read(orgKey)
  if (modelType === 'person') {
    const person = member as PersonModel;
    return {
      memberKey: person.bkey,
      memberName1: person.firstName,
      memberName2: person.lastName,
      memberModelType: 'person',
      memberType: person.gender,
      memberDateOfBirth: person.dateOfBirth,
      memberDateOfDeath: person.dateOfDeath,
      memberZipCode: person.favZipCode,
      memberBexioId: person.bexioId,

      orgKey: org.bkey,
      orgName: org.name,
      dateOfEntry: getTodayStr(),
      membershipCategory: DEFAULT_MCAT,
      membershipCategoryAbbreviation: 'A',
    };
  }
  if (modelType === 'org') {
    const org = member as OrgModel;
    return {
      memberKey: org.bkey,
      memberName1: DEFAULT_NAME,
      memberName2: org.name,
      memberModelType: 'org',
      memberType: org.type,
      memberDateOfBirth: org.dateOfFoundation,
      memberDateOfDeath: org.dateOfLiquidation,
      memberZipCode: org.favZipCode,
      memberBexioId: org.bexioId,

      orgKey: org.bkey,
      orgName: org.name,
      dateOfEntry: getTodayStr(),
      membershipCategory: DEFAULT_MCAT,
      membershipCategoryAbbreviation: 'A',
    };
  }
  die('membership.util.convertMembershipToNewForm: member is neither a person nor an org');
}

export function convertFormToNewMembership(vm: MembershipNewFormModel, tenantId: string): MembershipModel {
  const membership = new MembershipModel(tenantId);
  membership.tenants = [tenantId];
  membership.isArchived = false;
  membership.tags = DEFAULT_TAGS;
  membership.notes = DEFAULT_NOTES;
  membership.memberKey = vm.memberKey ?? die('membership.util.convertFormToNewMembership: memberKey is mandatory');
  membership.memberName1 = vm.memberName1 ?? DEFAULT_NAME;
  membership.memberName2 = vm.memberName2 ?? DEFAULT_NAME;
  membership.memberModelType = vm.memberModelType ?? 'person';
  membership.memberType = vm.memberType ?? DEFAULT_GENDER;
  membership.memberNickName = DEFAULT_NAME;
  membership.memberAbbreviation = '';
  membership.memberDateOfBirth = vm.memberDateOfBirth ?? DEFAULT_DATE;
  membership.memberDateOfDeath = vm.memberDateOfDeath ?? DEFAULT_DATE;
  membership.memberZipCode = vm.memberZipCode ?? '';
  membership.memberBexioId = vm.memberBexioId ?? DEFAULT_ID;
  membership.memberId = DEFAULT_ID;
  membership.orgKey = vm.orgKey ?? die('membership.util.convertFormToNewMembership: orgKey is mandatory');
  membership.orgName = vm.orgName ?? DEFAULT_NAME;
  membership.dateOfEntry = vm.dateOfEntry ?? getTodayStr();
  membership.dateOfExit = END_FUTURE_DATE_STR;
  membership.membershipCategory = vm.membershipCategory ?? DEFAULT_MCAT;
  membership.membershipState = DEFAULT_MSTATE;
  membership.order = 1;
  membership.relLog = getRelLogEntry(membership.order, '', membership.dateOfEntry, vm.membershipCategoryAbbreviation ?? 'A');
  membership.relIsLast = true;
  membership.price = DEFAULT_PRICE;
  membership.currency = DEFAULT_CURRENCY;
  membership.periodicity = 'yearly';
  membership.index = getMembershipIndex(membership);
  return membership;
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
  const oldMembershipCat = oldMembershipCategory || 'undefined';
  const newMembershipCat = newMembershipCategory || 'undefined';
  return `${oldMembershipCat} -> ${newMembershipCat}`;
}

/*-------------------------- search index --------------------------------*/
/**
 * Create an index entry for a given membership based on its values.
 * @param membership the membership for which to create the index
 * @returns the index string
 */
export function getMembershipIndex(membership: MembershipModel): string {
  let index = '';
  index = addIndexElement(index, 'mn', membership.memberName1 + ' ' + membership.memberName2);
  index = addIndexElement(index, 'mk', membership.memberKey);
  index = addIndexElement(index, 'ok', membership.orgKey);
  index = addIndexElement(index, 'on', membership.orgName);
  if (membership?.memberNickName) {
    index = addIndexElement(index, 'nn', membership.memberNickName);
  }
  return index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getMembershipIndexInfo(): string {
  return 'mn:memberName mk:memberKey ok:orgKey on:orgName [nn:nickName]';
}
