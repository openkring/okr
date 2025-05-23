import { Roles } from '@bk2/shared/models';
import { DeepRequired } from 'ngx-vest-forms';

export type UserAuthFormModel = {
  roles: Roles,
  useTouchId: boolean,
  useFaceId: boolean  
};

export const userAuthFormModelShape: DeepRequired<UserAuthFormModel> = {
  roles: {
    anonymous: false,
    registered: true,
    privileged: false,
    contentAdmin: false,
    resourceAdmin: false,
    eventAdmin: false,
    memberAdmin: false,
    treasurer: false,
    admin: false
  },

  useTouchId: false,
  useFaceId: false
};