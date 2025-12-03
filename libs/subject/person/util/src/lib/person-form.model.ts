export type PersonFormModel = {
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
};

export const PERSON_FORM_SHAPE: PersonFormModel = {
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