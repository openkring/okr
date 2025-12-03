import { Roles } from '@bk2/shared-models';

export type UserAuthFormModel = {
  roles: Roles;
  useTouchId: boolean;
  useFaceId: boolean;
};

export const USER_AUTH_FORM_SHAPE: UserAuthFormModel = {
  roles: {
    anonymous: false,
    registered: true,
    privileged: false,
    contentAdmin: false,
    resourceAdmin: false,
    eventAdmin: false,
    memberAdmin: false,
    treasurer: false,
    groupAdmin: false,
    admin: false,
  },

  useTouchId: false,
  useFaceId: false,
};
