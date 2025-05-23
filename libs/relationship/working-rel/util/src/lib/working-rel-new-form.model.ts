import { END_FUTURE_DATE_STR } from "@bk2/shared/config";
import { GenderType, OrgType, Periodicity, WorkingRelState, WorkingRelType } from "@bk2/shared/models";
import { getTodayStr } from "@bk2/shared/util";
import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

export type WorkingRelNewFormModel = DeepPartial<{
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
  state: WorkingRelState
}>;

export const workingRelNewFormModelShape: DeepRequired<WorkingRelNewFormModel> = {
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
  state: WorkingRelState.Active
};
