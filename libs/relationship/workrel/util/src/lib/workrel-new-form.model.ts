import { DEFAULT_CURRENCY, DEFAULT_GENDER, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORDER, DEFAULT_ORG_TYPE, DEFAULT_TAGS, DEFAULT_WORKREL_STATE, DEFAULT_WORKREL_TYPE, END_FUTURE_DATE_STR } from "@bk2/shared-constants";
import { getTodayStr } from "@bk2/shared-util-core";

export type WorkrelNewFormModel = {
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
  state: string
};

export const WORKREL_NEW_FORM_SHAPE: WorkrelNewFormModel = {
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
  price: 6000,
  currency: DEFAULT_CURRENCY,
  periodicity: 'monthly',
  order: DEFAULT_ORDER,
  state: DEFAULT_WORKREL_STATE
};
