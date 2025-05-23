import { DeepRequired } from 'ngx-vest-forms';

export type UserModelFormModel = {
  bkey: string,         // user key
  personKey: string,
  firstName: string,
  lastName: string,
  loginEmail: string,
  gravatarEmail: string,
  tenants: string[],       // user has always exactly one tenant
  notes: string,
  tags: string,
};


export const userModelFormModelShape: DeepRequired<UserModelFormModel> = {

  bkey: '',
  personKey: '',
  firstName: '',
  lastName: '',
  loginEmail: '',
  gravatarEmail: '',
  tenants: [],
  notes: '',
  tags: '',
};