import { Roles } from '@okr/shared-models';

export type UserAuthFormModel = {
  roles: Roles;
  useTouchId: boolean;
  useFaceId: boolean;
};
