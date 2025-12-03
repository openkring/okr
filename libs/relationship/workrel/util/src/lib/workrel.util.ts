import { DEFAULT_CURRENCY, DEFAULT_GENDER, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORDER, DEFAULT_ORG_TYPE, DEFAULT_SALARY, DEFAULT_TAGS, DEFAULT_WORKREL_STATE, DEFAULT_WORKREL_TYPE, END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { OrgModel, PersonModel, UserModel, WorkrelModel } from '@bk2/shared-models';
import { addIndexElement, die, getTodayStr, isType } from '@bk2/shared-util-core';

import { WorkrelFormModel } from './workrel-form.model';
import { WorkrelNewFormModel } from 'libs/relationship/workrel/util/src/lib/workrel-new-form.model';

export function newWorkrelFormModel(): WorkrelFormModel {
  return {
    bkey: DEFAULT_KEY,
    tags: DEFAULT_TAGS,
    notes: DEFAULT_NOTES,

    subjectKey: DEFAULT_KEY,
    subjectName1: DEFAULT_NAME,
    subjectName2: DEFAULT_NAME,
    subjectType: DEFAULT_GENDER,

    objectKey: DEFAULT_KEY,
    objectName: DEFAULT_NAME,
    objectType: DEFAULT_ORG_TYPE,

    type: DEFAULT_WORKREL_TYPE,
    label: DEFAULT_LABEL,
    validFrom: getTodayStr(),
    validTo: END_FUTURE_DATE_STR,

    price: DEFAULT_SALARY,
    currency: DEFAULT_CURRENCY,
    periodicity: 'monthly',
    order: DEFAULT_ORDER,
    state: DEFAULT_WORKREL_STATE,
  };
}

export function convertWorkrelToForm(workrel: WorkrelModel | undefined): WorkrelFormModel {
  if (!workrel) return newWorkrelFormModel();
  return {
    bkey: workrel.bkey ?? DEFAULT_KEY,
    tags: workrel.tags ?? DEFAULT_TAGS,
    notes: workrel.notes ?? DEFAULT_NOTES,

    subjectKey: workrel.subjectKey ?? DEFAULT_KEY,
    subjectName1: workrel.subjectName1 ?? DEFAULT_NAME,
    subjectName2: workrel.subjectName2 ?? DEFAULT_NAME,
    subjectType: workrel.subjectType ?? DEFAULT_GENDER,

    objectKey: workrel.objectKey ?? DEFAULT_KEY,
    objectName: workrel.objectName ?? DEFAULT_NAME,
    objectType: workrel.objectType ?? DEFAULT_ORG_TYPE,

    type: workrel.type ?? DEFAULT_WORKREL_TYPE,
    label: workrel.label ?? DEFAULT_LABEL,
    validFrom: workrel.validFrom ?? getTodayStr(),
    validTo: workrel.validTo ?? END_FUTURE_DATE_STR,

    price: workrel.price ?? DEFAULT_SALARY,
    currency: workrel.currency ?? DEFAULT_CURRENCY,
    periodicity: workrel.periodicity ?? 'monthly',
    order: workrel.order ?? DEFAULT_ORDER,
    state: workrel.state ?? DEFAULT_WORKREL_STATE,
  };
}

/**
 * Only convert back the fields that can be changed by the user.
 * @param reservation the reservation to be updated.
 * @param vm the view model, ie. the form data with the updated values.
 * @returns the updated membership.
 */
export function convertFormToWorkrel(vm?: WorkrelFormModel, workrel?: WorkrelModel): WorkrelModel {
    if (!workrel) die('workrel.util.convertFormToWorkrel: workrel is mandatory.');
  if (!vm) return workrel;
  
  workrel.tags = vm.tags ?? DEFAULT_TAGS;
  workrel.notes = vm.notes ?? DEFAULT_NOTES;

  workrel.subjectKey = vm.subjectKey ?? DEFAULT_KEY;
  workrel.subjectName1 = vm.subjectName1 ?? DEFAULT_NAME;
  workrel.subjectName2 = vm.subjectName2 ?? DEFAULT_NAME;
  workrel.subjectModelType = 'person';
  workrel.subjectType = vm.subjectType ?? DEFAULT_GENDER;

  workrel.objectKey = vm.objectKey ?? DEFAULT_KEY;
  workrel.objectName = vm.objectName ?? DEFAULT_NAME;
  workrel.objectType = vm.objectType ?? DEFAULT_ORG_TYPE;

  workrel.type = vm.type ?? DEFAULT_WORKREL_TYPE;
  workrel.label = vm.label ?? DEFAULT_LABEL;
  workrel.validFrom = vm.validFrom ?? getTodayStr();
  workrel.validTo = vm.validTo ?? END_FUTURE_DATE_STR;

  workrel.price = vm.price ?? DEFAULT_SALARY;
  workrel.currency = vm.currency ?? DEFAULT_CURRENCY;
  workrel.periodicity = vm.periodicity ?? 'monthly';
  workrel.order = vm.order ?? DEFAULT_ORDER;
  workrel.state = vm.state ?? DEFAULT_WORKREL_STATE;
  return workrel;
}

export function convertPersonAndOrgToNewForm(subject: PersonModel, object: OrgModel, currentUser?: UserModel): WorkrelNewFormModel {
  if (!currentUser) die('workrel.util.convertPersonsToNewForm: currentUser is mandatory');

  return {
    tags: DEFAULT_TAGS,
    notes: DEFAULT_NOTES,
    subjectKey: subject.bkey,
    subjectName1: subject.firstName,
    subjectName2: subject.lastName,
    subjectType: subject.gender,
    objectKey: object.bkey,
    objectName: object.name,
    objectType: object.type,
    type: DEFAULT_WORKREL_TYPE,
    label: '',
    validFrom: getTodayStr(),
    validTo: END_FUTURE_DATE_STR,
    price: DEFAULT_SALARY,
    currency: DEFAULT_CURRENCY,
    periodicity: 'monthly',
    order: DEFAULT_ORDER,
    state: DEFAULT_WORKREL_STATE,
  };
}

export function convertFormToNewWorkrel(vm: WorkrelNewFormModel, tenantId: string): WorkrelModel {
  const workRel = new WorkrelModel(tenantId);
  workRel.tenants = [tenantId];
  workRel.isArchived = false;
  workRel.tags = vm.tags ?? '';
  workRel.notes = vm.notes ?? '';

  workRel.subjectKey = vm.subjectKey ?? '';
  workRel.subjectName1 = vm.subjectName1 ?? '';
  workRel.subjectName2 = vm.subjectName2 ?? '';
  workRel.subjectModelType = 'person';
  workRel.subjectType = vm.subjectType ?? DEFAULT_GENDER;
  workRel.objectKey = vm.objectKey ?? '';
  workRel.objectName = vm.objectName ?? '';
  workRel.objectType = vm.objectType ?? DEFAULT_ORG_TYPE;
  workRel.type = vm.type ?? DEFAULT_WORKREL_TYPE;
  workRel.label = vm.label ?? DEFAULT_LABEL;
  workRel.validFrom = vm.validFrom ?? getTodayStr();
  workRel.validTo = vm.validTo ?? END_FUTURE_DATE_STR;
  workRel.price = vm.price ?? DEFAULT_SALARY;
  workRel.currency = vm.currency ?? DEFAULT_CURRENCY;
  workRel.periodicity = vm.periodicity ?? 'monthly';
  workRel.order = vm.order ?? DEFAULT_ORDER;
  workRel.state = vm.state ?? DEFAULT_WORKREL_STATE;
  return workRel;
}

export function isWorkrel(workrel: unknown, tenantId: string): workrel is WorkrelModel {
  return isType(workrel, new WorkrelModel(tenantId));
}


/*-------------------------- search index --------------------------------*/
/**
 * Create an index entry for a given work relationship based on its values.
 * @param workrel the work relationship for which to create the index
 * @returns the index string
 */
export function getWorkrelIndex(workrel: WorkrelModel): string {
  let _index = '';
  _index = addIndexElement(_index, 'sk', workrel.subjectKey);
  _index = addIndexElement(_index, 'sn', workrel.subjectName1 + ' ' + workrel.subjectName2);
  _index = addIndexElement(_index, 'ok', workrel.objectKey);
  _index = addIndexElement(_index, 'on', workrel.objectName);
  return _index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getWorkrelIndexInfo(): string {
  return 'sk:subjectKey, sn:subjectName, ok:objectKey, on:objectName';
}
