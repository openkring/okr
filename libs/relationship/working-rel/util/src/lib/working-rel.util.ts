import { END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { GenderType, ModelType, OrgModel, OrgType, Periodicity, PersonModel, UserModel, WorkingRelModel, WorkingRelState, WorkingRelType } from '@bk2/shared-models';
import { addIndexElement, die, getTodayStr, isType } from '@bk2/shared-util-core';

import { WorkingRelFormModel } from './working-rel-form.model';
import { WorkingRelNewFormModel } from './working-rel-new-form.model';

export function newWorkingRelFormModel(): WorkingRelFormModel {
  return {
    bkey: '',
    tags: '',
    notes: '',

    subjectKey: '',
    subjectName1: '',
    subjectName2: '',
    subjectType: GenderType.Male,

    objectKey: '',
    objectName: '',
    objectType: OrgType.LegalEntity,

    type: WorkingRelType.Employee,
    label: '',
    validFrom: getTodayStr(),
    validTo: END_FUTURE_DATE_STR,

    price: 6000,
    currency: 'CHF',
    periodicity: Periodicity.Monthly,
    priority: 0,
    state: WorkingRelState.Active,
  };
}

export function convertWorkingRelToForm(workingRel: WorkingRelModel | undefined): WorkingRelFormModel {
  if (!workingRel) return newWorkingRelFormModel();
  return {
    bkey: workingRel.bkey ?? '',
    tags: workingRel.tags ?? '',
    notes: workingRel.notes ?? '',

    subjectKey: workingRel.subjectKey ?? '',
    subjectName1: workingRel.subjectName1 ?? '',
    subjectName2: workingRel.subjectName2 ?? '',
    subjectType: workingRel.subjectType ?? GenderType.Male,

    objectKey: workingRel.objectKey ?? '',
    objectName: workingRel.objectName ?? '',
    objectType: workingRel.objectType ?? OrgType.LegalEntity,

    type: workingRel.type ?? WorkingRelType.Employee,
    label: workingRel.label ?? '',
    validFrom: workingRel.validFrom ?? getTodayStr(),
    validTo: workingRel.validTo ?? END_FUTURE_DATE_STR,

    price: workingRel.price ?? 6000,
    currency: workingRel.currency ?? 'CHF',
    periodicity: workingRel.periodicity ?? Periodicity.Monthly,
    priority: workingRel.priority ?? 0,
    state: workingRel.state ?? WorkingRelState.Active,
  };
}

/**
 * Only convert back the fields that can be changed by the user.
 * @param reservation the reservation to be updated.
 * @param vm the view model, ie. the form data with the updated values.
 * @returns the updated membership.
 */
export function convertFormToWorkingRel(workingRel: WorkingRelModel | undefined, vm: WorkingRelFormModel, tenantId: string): WorkingRelModel {
  if (!workingRel) {
    workingRel = new WorkingRelModel(tenantId);
    workingRel.bkey = vm.bkey ?? '';
  }
  workingRel.tags = vm.tags ?? '';
  workingRel.notes = vm.notes ?? '';

  workingRel.subjectKey = vm.subjectKey ?? '';
  workingRel.subjectName1 = vm.subjectName1 ?? '';
  workingRel.subjectName2 = vm.subjectName2 ?? '';
  workingRel.subjectModelType = ModelType.Person;
  workingRel.subjectType = vm.subjectType ?? GenderType.Male;

  workingRel.objectKey = vm.objectKey ?? '';
  workingRel.objectName = vm.objectName ?? '';
  workingRel.objectType = vm.objectType ?? OrgType.LegalEntity;

  workingRel.type = vm.type ?? WorkingRelType.Employee;
  workingRel.label = vm.label ?? '';
  workingRel.validFrom = vm.validFrom ?? getTodayStr();
  workingRel.validTo = vm.validTo ?? END_FUTURE_DATE_STR;

  workingRel.price = vm.price ?? 6000;
  workingRel.currency = vm.currency ?? 'CHF';
  workingRel.periodicity = vm.periodicity ?? Periodicity.Monthly;
  workingRel.priority = vm.priority ?? 0;
  workingRel.state = vm.state ?? WorkingRelState.Active;
  return workingRel;
}

export function convertPersonAndOrgToNewForm(subject: PersonModel, object: OrgModel, currentUser?: UserModel): WorkingRelNewFormModel {
  if (!currentUser) die('working-rel.util.convertPersonsToNewForm: currentUser is mandatory');

  return {
    tags: '',
    notes: '',
    subjectKey: subject.bkey,
    subjectName1: subject.firstName,
    subjectName2: subject.lastName,
    subjectType: subject.gender,
    objectKey: object.bkey,
    objectName: object.name,
    objectType: object.type,
    type: WorkingRelType.Employee,
    label: '',
    validFrom: getTodayStr(),
    validTo: END_FUTURE_DATE_STR,
    price: 6000,
    currency: 'CHF',
    periodicity: Periodicity.Monthly,
    priority: 0,
    state: WorkingRelState.Active,
  };
}

export function convertFormToNewWorkingRel(vm: WorkingRelFormModel, tenantId: string): WorkingRelModel {
  const _workingRel = new WorkingRelModel(tenantId);
  _workingRel.tenants = [tenantId];
  _workingRel.isArchived = false;
  _workingRel.tags = vm.tags ?? '';
  _workingRel.notes = vm.notes ?? '';

  _workingRel.subjectKey = vm.subjectKey ?? '';
  _workingRel.subjectName1 = vm.subjectName1 ?? '';
  _workingRel.subjectName2 = vm.subjectName2 ?? '';
  _workingRel.subjectModelType = ModelType.Person;
  _workingRel.subjectType = vm.subjectType ?? GenderType.Male;
  _workingRel.objectKey = vm.objectKey ?? '';
  _workingRel.objectName = vm.objectName ?? '';
  _workingRel.objectType = vm.objectType ?? OrgType.LegalEntity;
  _workingRel.type = vm.type ?? WorkingRelType.Employee;
  _workingRel.label = vm.label ?? '';
  _workingRel.validFrom = vm.validFrom ?? getTodayStr();
  _workingRel.validTo = vm.validTo ?? END_FUTURE_DATE_STR;
  _workingRel.price = vm.price ?? 6000;
  _workingRel.currency = vm.currency ?? 'CHF';
  _workingRel.periodicity = vm.periodicity ?? Periodicity.Monthly;
  _workingRel.priority = vm.priority ?? 0;
  _workingRel.state = vm.state ?? WorkingRelState.Active;
  return _workingRel;
}

export function isWorkingRel(workingRel: unknown, tenantId: string): workingRel is WorkingRelModel {
  return isType(workingRel, new WorkingRelModel(tenantId));
}

export function getWorkingRelSearchIndex(workingRel: WorkingRelModel): string {
  let _index = '';
  _index = addIndexElement(_index, 'sk', workingRel.subjectKey);
  _index = addIndexElement(_index, 'sn', workingRel.subjectName1 + ' ' + workingRel.subjectName2);
  _index = addIndexElement(_index, 'ok', workingRel.objectKey);
  _index = addIndexElement(_index, 'on', workingRel.objectName);
  return _index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getWorkingRelSearchIndexInfo(): string {
  return 'sk:subjectKey, sn:subjectName, ok:objectKey, on:objectName';
}
