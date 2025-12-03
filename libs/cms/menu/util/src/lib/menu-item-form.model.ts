import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_MENU_ACTION, DEFAULT_MENUITEMS, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ROLE, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_URL } from '@bk2/shared-constants';
import { BaseProperty } from '@bk2/shared-models';

export type MenuItemFormModel = {
  bkey: string;
  name: string;
  index: string;
  action: string;
  url: string;
  label: string;
  icon: string;
  data: BaseProperty[];
  menuItems: string[];
  roleNeeded: string;
  tenants: string[];
  description: string;
  tags: string;
  isArchived: boolean;
};

export const MENU_ITEM_FORM_SHAPE: MenuItemFormModel = {
  bkey: DEFAULT_KEY,
  name: DEFAULT_NAME,
  index: DEFAULT_INDEX,
  action: DEFAULT_MENU_ACTION,
  url: DEFAULT_URL,
  label: DEFAULT_LABEL,
  icon: '',
  data: [],
  menuItems: DEFAULT_MENUITEMS,
  roleNeeded: DEFAULT_ROLE,
  tenants: DEFAULT_TENANTS,
  description: DEFAULT_NOTES,
  tags: DEFAULT_TAGS,
  isArchived: false,
};
