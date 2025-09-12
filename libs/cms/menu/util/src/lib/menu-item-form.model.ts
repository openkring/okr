import { BaseProperty, MenuAction, RoleEnum } from '@bk2/shared-models';
import { DeepRequired } from 'ngx-vest-forms';

// can not use the DeepPartial from ngx-vest-forms because it is not compatible with BaseProperty[].
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DeepPartial<T> = T extends any[]
  ? T
  : T extends Record<string, unknown>
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

export type MenuItemFormModel = DeepPartial<{
  bkey: string;
  name: string;
  index: string;
  action: MenuAction;
  url: string;
  label: string;
  icon: string;
  data: BaseProperty[];
  menuItems: string[];
  roleNeeded: RoleEnum;
  tenants: string[];
  description: string;
  tags: string;
  isArchived: boolean;
}>;

export const menuItemFormModelShape: DeepRequired<MenuItemFormModel> = {
  bkey: '',
  name: '',
  index: '',
  action: MenuAction.Navigate,
  url: '',
  label: '',
  icon: '',
  data: [],
  menuItems: [],
  roleNeeded: RoleEnum.None,
  tenants: [],
  description: '',
  tags: '',
  isArchived: false,
};
