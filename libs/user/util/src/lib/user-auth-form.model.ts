import { Roles } from '@bk2/shared-models';

export type UserAuthFormModel = {
  roles: Roles;
  useTouchId: boolean;
  useFaceId: boolean;
};
