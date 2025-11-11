import { DEFAULT_EMAIL, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';
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

  bkey: DEFAULT_KEY,
  personKey: DEFAULT_KEY,
  firstName: DEFAULT_NAME,
  lastName: DEFAULT_NAME,
  loginEmail: DEFAULT_EMAIL,
  gravatarEmail: DEFAULT_EMAIL,
  tenants: DEFAULT_TENANTS,
  notes: DEFAULT_NOTES,
  tags: DEFAULT_TAGS,
};