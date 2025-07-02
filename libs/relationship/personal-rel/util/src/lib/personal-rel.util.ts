import { END_FUTURE_DATE_STR } from "@bk2/shared/constants";
import { addIndexElement, die, getTodayStr } from "@bk2/shared/util-core";
import { PersonalRelFormModel } from "./personal-rel-form.model";
import { GenderType, PersonalRelModel, PersonalRelType, PersonModel, UserModel } from "@bk2/shared/models";
import { PersonalRelNewFormModel } from "./personal-rel-new-form.model";

export function newPersonalRelFormModel(): PersonalRelFormModel {
  return {
    bkey: '',
    tags: '',
    notes: '',

    subjectKey: '',
    subjectFirstName: '',
    subjectLastName: '',
    subjectGender: GenderType.Male,

    objectKey: '',
    objectFirstName: '',
    objectLastName: '',
    objectGender: GenderType.Male,

    type: PersonalRelType.Partner,
    label: '',
    validFrom: getTodayStr(),
    validTo: END_FUTURE_DATE_STR
  }
}

export function convertPersonalRelToForm(personalRel: PersonalRelModel | undefined): PersonalRelFormModel {
  if (!personalRel) return newPersonalRelFormModel();
  return {
    bkey: personalRel.bkey ?? '',
    tags: personalRel.tags ?? '',
    notes: personalRel.notes ?? '',

    subjectKey: personalRel.subjectKey ?? '',
    subjectFirstName: personalRel.subjectFirstName ?? '',
    subjectLastName: personalRel.subjectLastName ?? '',
    subjectGender: personalRel.subjectGender ?? GenderType.Male,

    objectKey: personalRel.objectKey ?? '',
    objectFirstName: personalRel.objectFirstName ?? '',
    objectLastName: personalRel.objectLastName ?? '',
    objectGender: personalRel.objectGender ?? GenderType.Male,

    type: personalRel.type ?? PersonalRelType.Partner,
    label: personalRel.label ?? '',
    validFrom: personalRel.validFrom ?? getTodayStr(),
    validTo: personalRel.validTo ?? END_FUTURE_DATE_STR,
  }
}

/**
 * Only convert back the fields that can be changed by the user.
 * @param reservation the reservation to be updated.
 * @param vm the view model, ie. the form data with the updated values.
 * @returns the updated membership.
 */
export function convertFormToPersonalRel(personalRel: PersonalRelModel | undefined, vm: PersonalRelFormModel, tenantId: string): PersonalRelModel {
  if (!personalRel) { 
    personalRel = new PersonalRelModel(tenantId);
    personalRel.bkey = vm.bkey ?? '';
  }
  personalRel.tags = vm.tags ?? '';
  personalRel.notes = vm.notes ?? '';

  personalRel.subjectKey = vm.subjectKey ?? '';
  personalRel.subjectFirstName = vm.subjectFirstName ?? '';
  personalRel.subjectLastName = vm.subjectLastName ?? '';
  personalRel.subjectGender = vm.subjectGender ?? GenderType.Male;

  personalRel.objectKey = vm.objectKey ?? '';
  personalRel.objectFirstName = vm.objectFirstName ?? '';
  personalRel.objectLastName = vm.objectLastName ?? '';
  personalRel.objectGender = vm.objectGender ?? GenderType.Male;

  personalRel.type = vm.type ?? PersonalRelType.Partner;
  personalRel.label = vm.label ?? '';
  personalRel.validFrom = vm.validFrom ?? getTodayStr();
  personalRel.validTo = vm.validTo ?? END_FUTURE_DATE_STR;
  return personalRel;
}

export function convertPersonsToNewForm(subject: PersonModel, object: PersonModel, currentUser?: UserModel): PersonalRelNewFormModel {  
  if (!currentUser) die('personal-rel.util.convertPersonsToNewForm: currentUser is mandatory');

  return {
    tags: '',
    notes: '',
    subjectKey: subject.bkey,
    subjectFirstName: subject.firstName,
    subjectLastName: subject.lastName,
    subjectGender: subject.gender,
    objectKey: object.bkey,
    objectFirstName: object.firstName,
    objectLastName: object.lastName,
    objectGender: object.gender,
    type: PersonalRelType.Partner,
    label: '',
    validFrom: getTodayStr(),
    validTo: END_FUTURE_DATE_STR
  }
}

export function convertFormToNewPersonalRel(vm: PersonalRelFormModel, tenantId: string): PersonalRelModel {
  const _personalRel = new PersonalRelModel(tenantId);
  _personalRel.tenants = [tenantId];
  _personalRel.isArchived = false;
  _personalRel.tags = vm.tags ?? '';
  _personalRel.notes = vm.notes ?? '';

  _personalRel.subjectKey = vm.subjectKey ?? '';
  _personalRel.subjectFirstName = vm.subjectFirstName ?? '';
  _personalRel.subjectLastName = vm.subjectLastName ?? '';
  _personalRel.subjectGender = vm.subjectGender ?? GenderType.Male;
  _personalRel.objectKey = vm.objectKey ?? '';
  _personalRel.objectFirstName = vm.objectFirstName ?? '';
  _personalRel.objectLastName = vm.objectLastName ?? '';
  _personalRel.objectGender = vm.objectGender ?? GenderType.Male;
  _personalRel.type = vm.type ?? PersonalRelType.Partner;
  _personalRel.label = vm.label ?? '';
  _personalRel.validFrom = vm.validFrom ?? getTodayStr();
  _personalRel.validTo = vm.validTo ?? END_FUTURE_DATE_STR;
  return _personalRel;
}

export function getPersonalRelSearchIndex(personalRel: PersonalRelModel): string {
  let _index = '';
  _index = addIndexElement(_index, 'sk', personalRel.subjectKey);
  _index = addIndexElement(_index, 'sn', personalRel.subjectFirstName + ' ' + personalRel.subjectLastName);
  _index = addIndexElement(_index, 'ok', personalRel.objectKey);
  _index = addIndexElement(_index, 'on', personalRel.objectFirstName + ' ' + personalRel.objectLastName);
  return _index;  
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getPersonalRelSearchIndexInfo(): string {
  return 'sk:subjectKey, sn:subjectName, ok:objectKey, on:objectName';
}