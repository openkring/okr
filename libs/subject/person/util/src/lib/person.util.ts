import { DEFAULT_CITY, DEFAULT_COUNTRY, DEFAULT_CURRENCY, DEFAULT_DATE, DEFAULT_EMAIL, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PHONE, DEFAULT_PRICE, DEFAULT_STREETNAME, DEFAULT_STREETNUMBER, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_URL, DEFAULT_ZIP, END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { AddressModel, AddressUsage, MembershipModel, OrgModel, PersonModel } from '@bk2/shared-models';
import { addIndexElement, die, getTodayStr } from '@bk2/shared-util-core';

import { createFavoriteEmailAddress, createFavoritePhoneAddress, createFavoritePostalAddress, createFavoriteWebAddress } from '@bk2/subject-address-util';

import { PersonNewFormModel } from './person-new-form.model';
import { AhvFormat, formatAhv } from '@bk2/shared-util-angular';

// new person
export function createNewPersonFormModel(org?: OrgModel): PersonNewFormModel {
  return {
    firstName: DEFAULT_NAME,
    lastName: DEFAULT_NAME,
    gender: DEFAULT_GENDER,
    dateOfBirth: DEFAULT_DATE,
    dateOfDeath: DEFAULT_DATE,
    ssnId: DEFAULT_ID,
    bexioId: DEFAULT_ID,

    streetName: DEFAULT_STREETNAME,
    streetNumber: DEFAULT_STREETNUMBER,
    zipCode: DEFAULT_ZIP,
    city: DEFAULT_CITY,
    countryCode: DEFAULT_COUNTRY,
    phone: DEFAULT_PHONE,
    email: DEFAULT_EMAIL,
    web: DEFAULT_URL,

    shouldAddMembership: false,
    orgKey: org?.bkey ?? DEFAULT_KEY,
    orgName: org?.name ?? DEFAULT_NAME,
    membershipCategory: 'active',
    membershipCategoryAbbreviation: 'A',
    dateOfEntry: getTodayStr(),

    notes: DEFAULT_NOTES,
    tags: DEFAULT_TAGS,
  };
}

export function convertFormToNewPerson(vm: PersonNewFormModel, tenantId: string): PersonModel {
  const person = new PersonModel(tenantId);
  person.bkey = DEFAULT_KEY;
  person.firstName = vm.firstName ?? DEFAULT_NAME;
  person.lastName = vm.lastName ?? DEFAULT_NAME;
  person.gender = vm.gender ?? DEFAULT_GENDER;
  person.dateOfBirth = vm.dateOfBirth ?? DEFAULT_DATE;
  person.dateOfDeath = vm.dateOfDeath ?? DEFAULT_DATE;
  person.ssnId = formatAhv(vm.ssnId ?? DEFAULT_ID, AhvFormat.Electronic);
  person.bexioId = vm.bexioId ?? DEFAULT_ID;

  person.favEmail = vm.email ?? DEFAULT_EMAIL;
  person.favPhone = vm.phone ?? DEFAULT_PHONE;
  person.favStreetName = vm.streetName ?? DEFAULT_STREETNAME;
  person.favStreetNumber = vm.streetNumber ?? DEFAULT_STREETNUMBER;
  person.favZipCode = vm.zipCode ?? DEFAULT_ZIP;
  person.favCity = vm.city ?? DEFAULT_CITY;
  person.favCountryCode = vm.countryCode ?? DEFAULT_COUNTRY;

  person.notes = vm.notes ?? DEFAULT_NOTES;
  person.tags = vm.tags ?? DEFAULT_TAGS;

  return person;
}

export function convertNewPersonFormToEmailAddress(vm: PersonNewFormModel, tenantId: string): AddressModel {
  return createFavoriteEmailAddress(AddressUsage.Work, vm.email ?? DEFAULT_EMAIL, tenantId);
}

export function convertNewPersonFormToPhoneAddress(vm: PersonNewFormModel, tenantId: string): AddressModel {
  return createFavoritePhoneAddress(AddressUsage.Work, vm.phone ?? DEFAULT_PHONE, tenantId);
}

export function convertNewPersonFormToWebAddress(vm: PersonNewFormModel, tenantId: string): AddressModel {
  return createFavoriteWebAddress(AddressUsage.Work, vm.web ?? DEFAULT_URL, tenantId);
}

export function convertNewPersonFormToPostalAddress(vm: PersonNewFormModel, tenantId: string): AddressModel {
  return createFavoritePostalAddress(
    AddressUsage.Work, 
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
  member.memberDateOfBirth = vm.dateOfBirth ?? DEFAULT_DATE;
  member.memberDateOfDeath = vm.dateOfDeath ?? DEFAULT_DATE;
  member.memberZipCode = vm.zipCode ?? DEFAULT_ZIP;
  member.memberBexioId = vm.bexioId ?? DEFAULT_ID;
  member.memberId = DEFAULT_ID;
  member.orgKey = vm.orgKey ?? die('membership.util.convertFormToNewMembership: orgKey is mandatory');
  member.orgName = vm.orgName ?? DEFAULT_NAME;
  member.dateOfEntry = vm.dateOfEntry ?? getTodayStr();
  member.dateOfExit = END_FUTURE_DATE_STR;
  member.membershipCategory = vm.membershipCategory ?? 'active';
  member.membershipState = 'active';
  member.order = 1;
  member.relLog = member.dateOfEntry + ':' + (vm.membershipCategoryAbbreviation ?? 'A');
  member.relIsLast = true;
  member.price = DEFAULT_PRICE;
  member.currency = DEFAULT_CURRENCY;
  member.periodicity = 'yearly';
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
  _index = addIndexElement(_index, 'c', person.favCity);
  _index = addIndexElement(_index, 'fn', person.firstName);
  _index = addIndexElement(_index, 'bx', person.bexioId);
  _index = addIndexElement(_index, 'dob', person.dateOfBirth);
  return _index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getPersonIndexInfo(): string {
  return 'n:name c:city fn:firstName dob:dateOfBirth bx:bexioId';
}