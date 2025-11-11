import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

export type PersonFormModel = DeepPartial<{
  bkey: string,
  firstName: string,
  lastName: string,
  gender: string,
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
  gender: 'male',
  dateOfBirth: '',
  dateOfDeath: '',
  ssnId: '',
  notes: '',
  tags: '',
  bexioId: '',
  tenants: []
};