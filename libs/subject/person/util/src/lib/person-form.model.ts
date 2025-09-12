import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

import { GenderType } from '@bk2/shared-models';

export type PersonFormModel = DeepPartial<{
  bkey: string,
  firstName: string,
  lastName: string,
  gender: GenderType,
  dateOfBirth: string,
  dateOfDeath: string,
  ssnId: string,
  notes: string,
  tags: string,
  bexioId: string,
  tenants: string[]
}>;

export const personFormModelShape: DeepRequired<PersonFormModel> = {
  bkey: '',
  firstName: '',
  lastName: '',
  gender: GenderType.Male,
  dateOfBirth: '',
  dateOfDeath: '',
  ssnId: '',
  notes: '',
  tags: '',
  bexioId: '',
  tenants: []
};