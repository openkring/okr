import { END_FUTURE_DATE_STR } from "@bk2/shared/constants";
import { GenderType, PersonalRelType } from "@bk2/shared/models";
import { getTodayStr } from "@bk2/shared/util-core";
import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

export type PersonalRelNewFormModel = DeepPartial<{
  tags: string,
  notes: string

  subjectKey: string,
  subjectFirstName: string,
  subjectLastName: string,
  subjectGender: GenderType,

  objectKey: string,
  objectFirstName: string,
  objectLastName: string,
  objectGender: GenderType,

  type: PersonalRelType,
  label: string,
  validFrom: string,
  validTo: string,
}>;

export const personalRelNewFormModelShape: DeepRequired<PersonalRelNewFormModel> = {
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
  validTo: END_FUTURE_DATE_STR,
};
