import { BaseProperty, BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';
import { MenuAction } from './enums/menu-action.enum';

export type RoleName = 'none' | 'anonymous' | 'registered' | 'privileged' | 'contentAdmin' | 'resourceAdmin' | 'memberAdmin' | 'eventAdmin' | 'treasurer' | 'admin' | 'public' | 'groupAdmin';

export class MenuItemModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = ''; // unique key of the model in the database
  public name = ''; //  name: e.g. aoc, help, members ...
  public index = ''; // the index of the menu item (to search for)
  public action = MenuAction.Navigate; // the action that should be taken when the menu item is clicked
  public url = ''; // the url that should be navigated to when the menu item is clicked
  public label = ''; // label (i18n), the text that the users sees in the menu
  public icon = 'help-circle'; // the icon that should be displayed in the menu
  public data?: BaseProperty[] = []; // URL parameters that should be passed to the url
  public menuItems?: string[] = []; // the keys of the sub menu items
  public roleNeeded?: RoleName = 'contentAdmin'; // the role that is needed to see the menu item
  public tenants: string[] = []; // the tenants that the menu item is available for
  public description = ''; // a description of the menu item
  public tags = ''; // a list of tags that the menu item is associated with
  public isArchived = false; // whether the menu item is archived

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const MenuItemCollection = 'menuItems';
