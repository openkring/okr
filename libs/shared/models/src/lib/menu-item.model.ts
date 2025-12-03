import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_MENU_ACTION, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_URL } from '@bk2/shared-constants';
import { BaseProperty, BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

export type RoleName = 'none' | 'anonymous' | 'registered' | 'privileged' | 'contentAdmin' | 'resourceAdmin' | 'memberAdmin' | 'eventAdmin' | 'treasurer' | 'admin' | 'public' | 'groupAdmin';

export class MenuItemModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY; // unique key of the model in the database
  public name = DEFAULT_NAME; //  name: e.g. aoc, help, members ...
  public index = DEFAULT_INDEX; // the index of the menu item (to search for)
  public action = DEFAULT_MENU_ACTION; // the action that should be taken when the menu item is clicked
  public url = DEFAULT_URL; // the url that should be navigated to when the menu item is clicked
  public label = ''; // label (i18n), the text that the users sees in the menu
  public icon = 'help-circle'; // the icon that should be displayed in the menu
  public data?: BaseProperty[] = []; // URL parameters that should be passed to the url
  public menuItems?: string[] = []; // the keys of the sub menu items
  public roleNeeded?: RoleName = 'contentAdmin'; // the role that is needed to see the menu item
  public tenants: string[] = DEFAULT_TENANTS; // the tenants that the menu item is available for
  public description = DEFAULT_NOTES; // a description of the menu item
  public tags = DEFAULT_TAGS; // a list of tags that the menu item is associated with
  public isArchived = false; // whether the menu item is archived

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const MenuItemCollection = 'menuItems';
export const MenuItemModelName = 'menuItem';
