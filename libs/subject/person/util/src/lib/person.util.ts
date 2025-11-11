import { DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { AddressModel, AddressUsage, MembershipModel, OrgModel, PersonModel } from '@bk2/shared-models';
import { AhvFormat, formatAhv } from '@bk2/shared-util-angular';
import { die, getTodayStr } from '@bk2/shared-util-core';

import { createFavoriteEmailAddress, createFavoritePhoneAddress, createFavoritePostalAddress, createFavoriteWebAddress } from '@bk2/subject-address-util';

import { PersonFormModel } from './person-form.model';
import { PersonNewFormModel } from './person-new-form.model';

export function convertPersonToForm(person?: PersonModel): PersonFormModel {
  if (!person) return {};
  return {
    bkey: person.bkey, // readonly
    firstName: person.firstName,
    lastName: person.lastName,
    gender: person.gender,
    dateOfBirth: person.dateOfBirth,
    dateOfDeath: person.dateOfDeath,
    ssnId: formatAhv(person.ssnId, AhvFormat.Friendly),
    bexioId: person.bexioId,
    notes: person.notes,
    tags: person.tags,
  };
}

/**
 * Only convert back the fields that can be changed by the user.
 * @param person  the subject to be updated.
 * @param vm  the view model, ie. the form data with the updated values.
 * @returns the updated subject.
 */
export function convertFormToPerson(person: PersonModel | undefined, vm: PersonFormModel, tenantId: string): PersonModel {
  person ??= new PersonModel(tenantId);
  person.firstName = vm.firstName ?? DEFAULT_NAME;
  person.lastName = vm.lastName ?? die('PersonUtil.convertFormToPerson: lastName is mandatory.');
  person.gender = vm.gender ?? DEFAULT_GENDER;
  person.dateOfBirth = vm.dateOfBirth ?? DEFAULT_DATE;
  person.dateOfDeath = vm.dateOfDeath ?? DEFAULT_DATE;
  person.ssnId = formatAhv(vm.ssnId ?? DEFAULT_ID, AhvFormat.Electronic);
  person.notes = vm.notes ?? DEFAULT_NOTES;
  person.bexioId = vm.bexioId ?? DEFAULT_ID;
  person.tags = vm.tags ?? DEFAULT_TAGS;
  return person;
}

// new person
export function createNewPersonFormModel(org?: OrgModel): PersonNewFormModel {
  return {
    firstName: DEFAULT_NAME,
    lastName: '',
    gender: 'male',
    dateOfBirth: '',
    dateOfDeath: '',
    ssnId: '',
    bexioId: '',

    streetName: '',
    streetNumber: '',
    zipCode: '',
    city: '',
    countryCode: 'CH',
    phone: '',
    email: '',
    web: '',

    shouldAddMembership: false,
    orgKey: org?.bkey ?? '',
    orgName: org?.name ?? '',
    membershipCategory: 'active',
    membershipCategoryAbbreviation: 'A',
    dateOfEntry: getTodayStr(),

    notes: '',
    tags: '',
  };
}

export function convertFormToNewPerson(vm: PersonNewFormModel, tenantId: string): PersonModel {
  const person = new PersonModel(tenantId);
  person.bkey = '';
  person.firstName = vm.firstName ?? '';
  person.lastName = vm.lastName ?? '';
  person.gender = vm.gender ?? 'male';
  person.dateOfBirth = vm.dateOfBirth ?? '';
  person.dateOfDeath = vm.dateOfDeath ?? '';
  person.ssnId = vm.ssnId ?? '';
  person.bexioId = vm.bexioId ?? '';

  person.favEmail = vm.email ?? '';
  person.favPhone = vm.phone ?? '';
  person.favStreetName = vm.streetName ?? '';
  person.favStreetNumber = vm.streetNumber ?? '';
  person.favZipCode = vm.zipCode ?? '';
  person.favCity = vm.city ?? '';
  person.favCountryCode = vm.countryCode ?? '';

  person.notes = vm.notes ?? '';
  person.tags = vm.tags ?? '';

  return person;
}

export function convertNewPersonFormToEmailAddress(vm: PersonNewFormModel, tenantId: string): AddressModel {
  return createFavoriteEmailAddress(AddressUsage.Work, vm.email ?? '', tenantId);
}

export function convertNewPersonFormToPhoneAddress(vm: PersonNewFormModel, tenantId: string): AddressModel {
  return createFavoritePhoneAddress(AddressUsage.Work, vm.phone ?? '', tenantId);
}

export function convertNewPersonFormToWebAddress(vm: PersonNewFormModel, tenantId: string): AddressModel {
  return createFavoriteWebAddress(AddressUsage.Work, vm.web ?? '', tenantId);
}

export function convertNewPersonFormToPostalAddress(vm: PersonNewFormModel, tenantId: string): AddressModel {
  return createFavoritePostalAddress(
    AddressUsage.Work, 
    vm.streetName ?? '',
    vm.streetNumber ?? '', 
    vm.zipCode ?? '', 
    vm.city ?? '', 
    vm.countryCode ?? '', 
    tenantId,
  );
}

export function convertNewPersonFormToMembership(vm: PersonNewFormModel, personKey: string, tenantId: string): MembershipModel {
  const member = new MembershipModel(tenantId);
  member.tenants = [tenantId];
  member.isArchived = false;
  member.tags = '';
  member.notes = '';
  member.memberKey = personKey;
  member.memberName1 = vm.firstName ?? '';
  member.memberName2 = vm.lastName ?? '';
  member.memberModelType = 'person';
  member.memberType = vm.gender ?? DEFAULT_GENDER;
  member.memberNickName = '';
  member.memberAbbreviation = '';
  member.memberDateOfBirth = vm.dateOfBirth ?? '';
  member.memberDateOfDeath = vm.dateOfDeath ?? '';
  member.memberZipCode = vm.zipCode ?? '';
  member.memberBexioId = vm.bexioId ?? '';
  member.memberId = '';
  member.orgKey = vm.orgKey ?? die('membership.util.convertFormToNewMembership: orgKey is mandatory');
  member.orgName = vm.orgName ?? '';
  member.dateOfEntry = vm.dateOfEntry ?? getTodayStr();
  member.dateOfExit = END_FUTURE_DATE_STR;
  member.membershipCategory = vm.membershipCategory ?? 'active';
  member.membershipState = 'active';
  member.order = 1;
  member.relLog = member.dateOfEntry + ':' + (vm.membershipCategoryAbbreviation ?? 'A');
  member.relIsLast = true;
  member.price = 0;
  member.currency = 'CHF';
  member.periodicity = 'yearly';
  member.index = 'mn:' + member.memberName1 + ' ' + member.memberName2 + ', mk:' + member.memberKey + ', ok:' + member.orgKey;
  return member;
}
