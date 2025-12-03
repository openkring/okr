import { DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_ID, DEFAULT_KEY, DEFAULT_NAME } from '@bk2/shared-constants';

// attributes from PersonModel
export type PersonalDataFormModel = {
  personKey: string,
  firstName: string,
  lastName: string,
  gender: string, 
  dateOfBirth: string,
  ssnId: string
};

export const PERSONAL_DATA_SHAPE: PersonalDataFormModel = {
  personKey: DEFAULT_KEY,
  firstName: DEFAULT_NAME,
  lastName  : DEFAULT_NAME,
  gender: DEFAULT_GENDER,
  dateOfBirth: DEFAULT_DATE,
  ssnId: DEFAULT_ID
};
