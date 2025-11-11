import { DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_KEY, DEFAULT_NAME } from '@bk2/shared-constants';
import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

// attributes from PersonModel
export type PersonalDataFormModel = DeepPartial<{
  // person attributes
  personKey: string,
  firstName: string,
  lastName: string,
  gender: string, 
  dateOfBirth: string,
  ssnId: string
}>;

export const personalDataFormModelShape: DeepRequired<PersonalDataFormModel> = {
  personKey: DEFAULT_KEY,
  firstName: DEFAULT_NAME,
  lastName  : DEFAULT_NAME,
  gender: DEFAULT_GENDER,
  dateOfBirth: DEFAULT_DATE,
  ssnId: DEFAULT_ID
};