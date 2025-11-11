import { DEFAULT_CURRENCY, DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORDER, DEFAULT_ORG_TYPE, DEFAULT_TAGS, DEFAULT_WORKREL_STATE, DEFAULT_WORKREL_TYPE } from '@bk2/shared-constants';
import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

// tbd: in a first phase, we only support persons as subjects; support for org subjects will be added later
export type WorkrelFormModel = DeepPartial<{
  bkey: string,
  tags: string,
  notes: string

  subjectKey: string,
  subjectName1: string,
  subjectName2: string,
  subjectType: string,

  objectKey: string,
  objectName: string,
  objectType: string,

  type: string,
  label: string,
  validFrom: string,
  validTo: string,
  price: number,
  currency: string,
  periodicity: string,
  order: number,
  state: string,
}>;

export const workrelFormModelShape: DeepRequired<WorkrelFormModel> = {
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
  validFrom: DEFAULT_DATE,
  validTo: DEFAULT_DATE,
  price: 6000,
  currency: DEFAULT_CURRENCY,
  periodicity: 'monthly',
  order: DEFAULT_ORDER,
  state: DEFAULT_WORKREL_STATE
};