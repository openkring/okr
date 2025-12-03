import { DEFAULT_GENDER, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PERSONAL_REL, DEFAULT_TAGS, END_FUTURE_DATE_STR } from "@bk2/shared-constants";
import { getTodayStr } from "@bk2/shared-util-core";

export type PersonalRelNewFormModel = {
  tags: string,
  notes: string

  subjectKey: string,
  subjectFirstName: string,
  subjectLastName: string,
  subjectGender: string,

  objectKey: string,
  objectFirstName: string,
  objectLastName: string,
  objectGender: string,

  type: string,
  label: string,
  validFrom: string,
  validTo: string,
};

export const PERSONAL_REL_NEW_FORM_SHAPE: PersonalRelNewFormModel = {
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
