import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_MENU_ACTION, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_URL } from '@okr/shared-constants';
import { BaseProperty, OkrModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

export type RoleName = 'none' | 'anonymous' | 'registered' | 'privileged' | 'contentAdmin' | 'resourceAdmin' | 'memberAdmin' | 'eventAdmin' | 'treasurer' | 'admin' | 'public' | 'groupAdmin' | 'kiosk' | 'auditor' | 'tester';

export class MenuItemModel implements OkrModel, NamedModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY; // unique key of the model in the database
  public name = DEFAULT_NAME; //  name: e.g. aoc, help, members ...
  public index = DEFAULT_INDEX; // the index of the menu item (to search for)
  public action = DEFAULT_MENU_ACTION; // the action that should be taken when the menu item is clicked
  public url = DEFAULT_URL; // the url that should be navigated to when the menu item is clicked
  public label = ''; // label (i18n), the text that the users sees in the menu
  public icon = 'help-circle'; // the icon that should be displayed in the menu
  // action 'toggle' only: the alternate icon/label shown while the toggled state is active (true).
  // The base icon/label are shown while it is inactive (false).
  public iconAlt?: string; // alternate icon for the active toggle state (e.g. eye-off)
  public labelAlt?: string; // alternate label (i18n) for the active toggle state
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
