import { DEFAULT_ADDRESS_USAGE, DEFAULT_CITY, DEFAULT_COUNTRY, DEFAULT_DATE, DEFAULT_EMAIL, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PHONE, DEFAULT_STREETNAME, DEFAULT_STREETNUMBER, DEFAULT_TAGS, DEFAULT_URL, DEFAULT_ZIP, END_FUTURE_DATE_STR } from '@okr/shared-constants';
import { AddressModel, MembershipModel, OrgModel, PersonModel } from '@okr/shared-models';
import { addIndexElement, die, getBirthYear, getStoreDateYear, getTodayStr } from '@okr/shared-util-core';

import { createFavoriteEmailAddress, createFavoritePhoneAddress, createFavoritePostalAddress, createFavoriteWebAddress } from '@okr/subject-address-util';

import { PERSON_NEW_FORM_SHAPE, PersonNewFormModel } from './person-new-form.model';
import { PersonFormModel } from './person-form.model';
import { AhvFormat, formatAhv } from '@okr/shared-util-angular';

// new person
export function createNewPersonFormModel(org?: OrgModel): PersonNewFormModel {
  const model = { ...PERSON_NEW_FORM_SHAPE };
  model.orgKey = org?.okey ?? DEFAULT_KEY;
  model.orgName = org?.name ?? DEFAULT_NAME;
  model.membershipCategory = 'active';
  return model;
}

export function convertFormToNewPerson(vm: PersonNewFormModel, tenantId: string): PersonFormModel {
  const person = new PersonModel(tenantId) as PersonFormModel;
  person.okey = DEFAULT_KEY;
  person.firstName = vm.firstName ?? DEFAULT_NAME;
  person.lastName = vm.lastName ?? DEFAULT_NAME;
  person.gender = vm.gender ?? DEFAULT_GENDER;
  // ssn/dob/dod ride along on the form model only — PersonService strips them from the
  // person write and syncs them into the addresses vault (spec 1.19 Phase 4).
  person.dateOfBirth = vm.dateOfBirth ?? DEFAULT_DATE;
  person.dateOfDeath = vm.dateOfDeath ?? DEFAULT_DATE;
  person.ssnId = formatAhv(vm.ssnId ?? DEFAULT_ID, AhvFormat.Electronic);
  person.bexioId = vm.bexioId ?? DEFAULT_ID;

  person.notes = vm.notes ?? DEFAULT_NOTES;
  person.tags = vm.tags ?? DEFAULT_TAGS;

  return person;
}

export function convertNewPersonFormToEmailAddress(vm: PersonNewFormModel, tenantId: string): AddressModel {
  return createFavoriteEmailAddress(DEFAULT_ADDRESS_USAGE, vm.email ?? DEFAULT_EMAIL, tenantId);
}

export function convertNewPersonFormToPhoneAddress(vm: PersonNewFormModel, tenantId: string): AddressModel {
  return createFavoritePhoneAddress(DEFAULT_ADDRESS_USAGE, vm.phone ?? DEFAULT_PHONE, tenantId);
}

export function convertNewPersonFormToWebAddress(vm: PersonNewFormModel, tenantId: string): AddressModel {
  return createFavoriteWebAddress(DEFAULT_ADDRESS_USAGE, vm.web ?? DEFAULT_URL, tenantId);
}

export function convertNewPersonFormToPostalAddress(vm: PersonNewFormModel, tenantId: string): AddressModel {
  return createFavoritePostalAddress(
    DEFAULT_ADDRESS_USAGE, 
    vm.streetName ?? DEFAULT_STREETNAME,
    vm.streetNumber ?? DEFAULT_STREETNUMBER, 
    vm.zipCode ?? DEFAULT_ZIP, 
    vm.city ?? DEFAULT_CITY, 
    vm.countryCode ?? DEFAULT_COUNTRY, 
    tenantId,
  );
}

export function convertNewPersonFormToMembership(vm: PersonNewFormModel, personKey: string, tenantId: string): MembershipModel {
  const member = new MembershipModel(tenantId);
  member.tenants = [tenantId];
  member.isArchived = false;
  member.tags = DEFAULT_TAGS;
  member.notes = DEFAULT_NOTES;
  member.memberKey = personKey;
  member.memberName1 = vm.firstName ?? DEFAULT_NAME;
  member.memberName2 = vm.lastName ?? DEFAULT_NAME;
  member.memberModelType = 'person';
  member.memberType = vm.gender ?? DEFAULT_GENDER;
  member.memberNickName = DEFAULT_NAME;
  member.memberAbbreviation = '';
  member.memberBirthYear = getBirthYear(vm.dateOfBirth ?? DEFAULT_DATE);
  member.memberIsDeceased = (vm.dateOfDeath ?? '').length > 0;
  member.memberDeathYear = getStoreDateYear(vm.dateOfDeath);
  member.memberZipCode = vm.zipCode ?? DEFAULT_ZIP;
  member.memberBexioId = vm.bexioId ?? DEFAULT_ID;
  member.memberId = DEFAULT_ID;
  member.orgKey = vm.orgKey ?? die('membership.util.convertFormToNewMembership: orgKey is mandatory');
  member.orgName = vm.orgName ?? DEFAULT_NAME;
  member.dateOfEntry = vm.dateOfEntry ?? getTodayStr();
  member.dateOfExit = END_FUTURE_DATE_STR;
  member.category = vm.membershipCategory ?? 'active';
  member.state = 'active';
  member.order = 1;
  member.relLog = member.dateOfEntry + ':' + (vm.membershipCategoryAbbreviation ?? 'A');
  member.relIsLast = true;
  member.index = 'mn:' + member.memberName1 + ' ' + member.memberName2 + ', mk:' + member.memberKey + ', ok:' + member.orgKey;
  return member;
}


/*-------------------------- search index --------------------------------*/
/**
 * Create an index entry for a given person based on its values.
 * @param person the person for which to create the index
 * @returns the index string
 */
export function getPersonIndex(person: PersonModel): string {
  let _index = '';
  _index = addIndexElement(_index, 'n', person.lastName);
  _index = addIndexElement(_index, 'z', person.favZipCode);
  _index = addIndexElement(_index, 'fn', person.firstName);
  _index = addIndexElement(_index, 'bx', person.bexioId);
  // dob dropped from the search index (spec 1.19 Phase 3): date of birth moves to the
  // privileged addresses vault and must not sit in the tenant-readable index string.
  return _index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getPersonIndexInfo(): string {
  return 'n:name z:zipCode fn:firstName bx:bexioId';
}