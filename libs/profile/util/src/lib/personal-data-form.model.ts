import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

import { GenderType } from '@bk2/shared-models';

// attributes from PersonModel
export type PersonalDataFormModel = DeepPartial<{
  // person attributes
  personKey: string,
  firstName: string,
  lastName: string,
  gender: GenderType, 
  dateOfBirth: string,
  ssnId: string
}>;

export const personalDataFormModelShape: DeepRequired<PersonalDataFormModel> = {
  personKey: '',
  firstName: '',
  lastName  : '',
  gender: GenderType.Male,
  dateOfBirth: '',
  ssnId: ''
};