import { GenderType } from '@bk2/shared/models';
import { DeepPartial, DeepRequired} from 'ngx-vest-forms';

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