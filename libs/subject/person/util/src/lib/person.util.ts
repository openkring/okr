import { AddressModel, AddressUsage, GenderType, MembershipModel, ModelType, OrgModel, Periodicity, PersonModel } from "@bk2/shared/models";
import { PersonFormModel } from "./person-form.model";
import { die, getTodayStr } from "@bk2/shared/util-core";
import { AhvFormat, formatAhv } from "@bk2/shared/util-angular";
import { PersonNewFormModel } from "./person-new-form.model";
import { createFavoriteEmailAddress, createFavoritePhoneAddress, createFavoritePostalAddress, createFavoriteWebAddress } from "@bk2/address/util";
import { END_FUTURE_DATE_STR } from "@bk2/shared/constants";

export function convertPersonToForm(person?: PersonModel): PersonFormModel {
  if (!person) return {};
  return {
      bkey: person.bkey,                     // readonly
      firstName: person.firstName,
      lastName: person.lastName,
      gender: person.gender,
      dateOfBirth: person.dateOfBirth,
      dateOfDeath: person.dateOfDeath,
      ssnId: formatAhv(person.ssnId, AhvFormat.Friendly),
      bexioId: person.bexioId,
      notes: person.notes,
      tags: person.tags
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
  
    street: '',
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
  const _person = new PersonModel(tenantId);
  _person.bkey = '';
  _person.firstName = vm.firstName ?? '';
  _person.lastName = vm.lastName ?? '';
  _person.gender = vm.gender ?? GenderType.Male;
  _person.dateOfBirth = vm.dateOfBirth ?? '';
  _person.dateOfDeath = vm.dateOfDeath ?? '';
  _person.ssnId = vm.ssnId ?? '';
  _person.bexioId = vm.bexioId ?? '';

  _person.fav_email = vm.email ?? '';
  _person.fav_phone = vm.phone ?? '';
  _person.fav_street = vm.street ?? '';
  _person.fav_zip = vm.zipCode ?? '';
  _person.fav_city = vm.city ?? '';
  _person.fav_country = vm.countryCode ?? '';

  _person.notes = vm.notes ?? '';
  _person.tags = vm.tags ?? '';

  return _person;
}

export function convertNewPersonFormToEmailAddress(vm: PersonNewFormModel, tenantId: string): AddressModel {
  return createFavoriteEmailAddress(AddressUsage.Work,  vm.email ?? '', tenantId);
}

export function convertNewPersonFormToPhoneAddress(vm: PersonNewFormModel, tenantId: string): AddressModel {
  return createFavoritePhoneAddress(AddressUsage.Work,  vm.phone ?? '', tenantId);
}

export function convertNewPersonFormToWebAddress(vm: PersonNewFormModel, tenantId: string): AddressModel {
  return createFavoriteWebAddress(AddressUsage.Work,  vm.web ?? '', tenantId);
}

export function convertNewPersonFormToPostalAddress(vm: PersonNewFormModel, tenantId: string): AddressModel {
  return createFavoritePostalAddress(AddressUsage.Work,  vm.street ?? '', vm.zipCode ?? '', vm.city ?? '', vm.countryCode ?? '', tenantId);
}

export function convertNewPersonFormToMembership(vm: PersonNewFormModel, personKey: string, tenantId: string): MembershipModel {
  const _m = new MembershipModel(tenantId);
    _m.tenants = [tenantId];
    _m.isArchived = false;
    _m.tags = '';
    _m.notes = '';
    _m.memberKey = personKey;
    _m.memberName1 = vm.firstName ?? '';
    _m.memberName2 = vm.lastName ?? '';
    _m.memberModelType = ModelType.Person;
    _m.memberType = vm.gender;
    _m.memberNickName = '';
    _m.memberAbbreviation = '';
    _m.memberDateOfBirth = vm.dateOfBirth ?? '';
    _m.memberDateOfDeath = vm.dateOfDeath ?? '';
    _m.memberZipCode = vm.zipCode ?? '';
    _m.memberBexioId = vm.bexioId ?? '';
    _m.memberId = '';
    _m.orgKey = vm.orgKey ?? die('membership.util.convertFormToNewMembership: orgKey is mandatory');
    _m.orgName = vm.orgName ?? '';
    _m.dateOfEntry = vm.dateOfEntry ?? getTodayStr();
    _m.dateOfExit = END_FUTURE_DATE_STR;
    _m.membershipCategory = vm.membershipCategory ?? 'active';
    _m.membershipState = 'active';
    _m.priority = 1;
    _m.relLog = _m.dateOfEntry + ':' + (vm.membershipCategoryAbbreviation ?? 'A');
    _m.relIsLast = true;
    _m.price = 0;
    _m.currency = 'CHF';
    _m.periodicity = Periodicity.Yearly;
    _m.index = 'mn:' + _m.memberName1 + ' ' + _m.memberName2 + ', mk:' + _m.memberKey + ', ok:' + _m.orgKey;
    console.log('convertNewPersonFormToMembership: ' + JSON.stringify(_m));
    return _m;
}
