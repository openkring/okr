import { GenderType, OrgType, Periodicity, WorkingRelState, WorkingRelType } from "@bk2/shared/models";
import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

// tbd: in a first phase, we only support persons as subjects; support for org subjects will be added later
export type WorkingRelFormModel = DeepPartial<{
  bkey: string,
  tags: string,
  notes: string

  subjectKey: string,
  subjectName1: string,
  subjectName2: string,
  subjectType: GenderType,

  objectKey: string,
  objectName: string,
  objectType: OrgType,

  type: WorkingRelType,
  label: string,
  validFrom: string,
  validTo: string,
  price: number,
  currency: string,
  periodicity: Periodicity,
  priority: number,
  state: WorkingRelState,
}>;

export const workingRelFormModelShape: DeepRequired<WorkingRelFormModel> = {
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
  validFrom: '',
  validTo: '',
  price: 6000,
  currency: 'CHF',
  periodicity: Periodicity.Monthly,
  priority: 0,
  state: WorkingRelState.Active
};