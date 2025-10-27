import { END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { AddressModel, AddressUsage, GenderType, MembershipModel, ModelType, OrgModel, Periodicity, PersonModel } from '@bk2/shared-models';
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
  person.firstName = vm.firstName ?? '';
  person.lastName = vm.lastName ?? die('PersonUtil.convertFormToPerson: lastName is mandatory.');
  person.gender = Number(vm.gender ?? GenderType.Female);
  person.dateOfBirth = vm.dateOfBirth ?? '';
  person.dateOfDeath = vm.dateOfDeath ?? '';
  person.ssnId = formatAhv(vm.ssnId ?? '', AhvFormat.Electronic);
  person.notes = vm.notes ?? '';
  person.bexioId = vm.bexioId ?? '';
  person.tags = vm.tags ?? '';
  return person;
}

// new person
export function createNewPersonFormModel(org?: OrgModel): PersonNewFormModel {
  return {
    firstName: '',
    lastName: '',
    gender: GenderType.Male,
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
  person.gender = vm.gender ?? GenderType.Male;
  person.dateOfBirth = vm.dateOfBirth ?? '';
  person.dateOfDeath = vm.dateOfDeath ?? '';
  person.ssnId = vm.ssnId ?? '';
  person.bexioId = vm.bexioId ?? '';

  person.fav_email = vm.email ?? '';
  person.fav_phone = vm.phone ?? '';
  person.fav_street_name = vm.streetName ?? '';
  person.fav_street_number = vm.streetNumber ?? '';
  person.fav_zip_code = vm.zipCode ?? '';
  person.fav_city = vm.city ?? '';
  person.fav_country_code = vm.countryCode ?? '';

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
  member.memberModelType = ModelType.Person;
  member.memberType = vm.gender;
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
  member.priority = 1;
  member.relLog = member.dateOfEntry + ':' + (vm.membershipCategoryAbbreviation ?? 'A');
  member.relIsLast = true;
  member.price = 0;
  member.currency = 'CHF';
  member.periodicity = Periodicity.Yearly;
  member.index = 'mn:' + member.memberName1 + ' ' + member.memberName2 + ', mk:' + member.memberKey + ', ok:' + member.orgKey;
  console.log('convertNewPersonFormToMembership: ' + JSON.stringify(member));
  return member;
}
