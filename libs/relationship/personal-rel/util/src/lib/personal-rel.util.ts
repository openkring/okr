import { DEFAULT_GENDER, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PERSONAL_REL, DEFAULT_TAGS, END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { PersonalRelModel, PersonModel, UserModel } from '@bk2/shared-models';
import { addIndexElement, die, getTodayStr } from '@bk2/shared-util-core';
import { PersonalRelFormModel } from './personal-rel-form.model';

import { PersonalRelNewFormModel } from './personal-rel-new-form.model';

export function newPersonalRelFormModel(): PersonalRelFormModel {
  return {
    bkey: DEFAULT_KEY,
    tags: DEFAULT_TAGS,
    notes: DEFAULT_NOTES,

    subjectKey: DEFAULT_KEY,
    subjectFirstName: DEFAULT_NAME,
    subjectLastName: DEFAULT_NAME,
    subjectGender: DEFAULT_GENDER,

    objectKey: DEFAULT_KEY,
    objectFirstName: DEFAULT_NAME,
    objectLastName: DEFAULT_NAME,
    objectGender: DEFAULT_GENDER,

    type: DEFAULT_PERSONAL_REL,
    label: DEFAULT_LABEL,
    validFrom: getTodayStr(),
    validTo: END_FUTURE_DATE_STR,
  };
}

export function convertPersonalRelToForm(personalRel: PersonalRelModel | undefined): PersonalRelFormModel {
  if (!personalRel) return newPersonalRelFormModel();
  return {
    bkey: personalRel.bkey ?? DEFAULT_KEY,
    tags: personalRel.tags ?? DEFAULT_TAGS,
    notes: personalRel.notes ?? DEFAULT_NOTES,

    subjectKey: personalRel.subjectKey ?? DEFAULT_KEY,
    subjectFirstName: personalRel.subjectFirstName ?? DEFAULT_NAME,
    subjectLastName: personalRel.subjectLastName ?? DEFAULT_NAME,
    subjectGender: personalRel.subjectGender ?? DEFAULT_GENDER,

    objectKey: personalRel.objectKey ?? DEFAULT_KEY,
    objectFirstName: personalRel.objectFirstName ?? DEFAULT_NAME,
    objectLastName: personalRel.objectLastName ?? DEFAULT_NAME,
    objectGender: personalRel.objectGender ?? DEFAULT_GENDER,

    type: personalRel.type ?? DEFAULT_PERSONAL_REL,
    label: personalRel.label ?? DEFAULT_LABEL,
    validFrom: personalRel.validFrom ?? getTodayStr(),
    validTo: personalRel.validTo ?? END_FUTURE_DATE_STR,
  };
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
    personalRel.bkey = vm.bkey ?? DEFAULT_KEY;
  }
  personalRel.tags = vm.tags ?? DEFAULT_TAGS;
  personalRel.notes = vm.notes ?? DEFAULT_NOTES;

  personalRel.subjectKey = vm.subjectKey ?? DEFAULT_KEY;
  personalRel.subjectFirstName = vm.subjectFirstName ?? DEFAULT_NAME;
  personalRel.subjectLastName = vm.subjectLastName ?? DEFAULT_NAME;
  personalRel.subjectGender = vm.subjectGender ?? DEFAULT_GENDER;

  personalRel.objectKey = vm.objectKey ?? DEFAULT_KEY;
  personalRel.objectFirstName = vm.objectFirstName ?? DEFAULT_NAME;
  personalRel.objectLastName = vm.objectLastName ?? DEFAULT_NAME;
  personalRel.objectGender = vm.objectGender ?? DEFAULT_GENDER;

  personalRel.type = vm.type ?? DEFAULT_PERSONAL_REL;
  personalRel.label = vm.label ?? DEFAULT_LABEL;
  personalRel.validFrom = vm.validFrom ?? getTodayStr();
  personalRel.validTo = vm.validTo ?? END_FUTURE_DATE_STR;
  return personalRel;
}

export function convertPersonsToNewForm(subject: PersonModel, object: PersonModel, currentUser?: UserModel): PersonalRelNewFormModel {
  if (!currentUser) die('personal-rel.util.convertPersonsToNewForm: currentUser is mandatory');

  return {
    tags: DEFAULT_TAGS,
    notes: DEFAULT_NOTES,
    subjectKey: subject.bkey,
    subjectFirstName: subject.firstName,
    subjectLastName: subject.lastName,
    subjectGender: subject.gender,
    objectKey: object.bkey,
    objectFirstName: object.firstName,
    objectLastName: object.lastName,
    objectGender: object.gender,
    type: DEFAULT_PERSONAL_REL,
    label: DEFAULT_LABEL,
    validFrom: getTodayStr(),
    validTo: END_FUTURE_DATE_STR,
  };
}

export function convertFormToNewPersonalRel(vm: PersonalRelFormModel, tenantId: string): PersonalRelModel {
  const _personalRel = new PersonalRelModel(tenantId);
  _personalRel.tenants = [tenantId];
  _personalRel.isArchived = false;
  _personalRel.tags = vm.tags ?? DEFAULT_TAGS;
  _personalRel.notes = vm.notes ?? DEFAULT_NOTES;

  _personalRel.subjectKey = vm.subjectKey ?? DEFAULT_KEY;
  _personalRel.subjectFirstName = vm.subjectFirstName ?? DEFAULT_NAME;
  _personalRel.subjectLastName = vm.subjectLastName ?? DEFAULT_NAME;
  _personalRel.subjectGender = vm.subjectGender ?? DEFAULT_GENDER;
  _personalRel.objectKey = vm.objectKey ?? DEFAULT_KEY;
  _personalRel.objectFirstName = vm.objectFirstName ?? DEFAULT_NAME;
  _personalRel.objectLastName = vm.objectLastName ?? DEFAULT_NAME;
  _personalRel.objectGender = vm.objectGender ?? DEFAULT_GENDER;
  _personalRel.type = vm.type ?? DEFAULT_PERSONAL_REL;
  _personalRel.label = vm.label ?? DEFAULT_LABEL;
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
