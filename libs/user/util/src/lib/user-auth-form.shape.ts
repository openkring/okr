// libs/user/util/src/lib/user-auth-form.shape.ts
import { UserAuthFormModel } from './user-auth-form.model';

// This is the shape Vest expects: ALL properties required + no undefined
// if we do not have the 'as any', Vest complains about the roles property, because the type Roles has optional properties
export const USER_AUTH_FORM_SHAPE = {
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
} as any;