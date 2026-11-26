import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_MENU_ACTION, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_URL } from '@okr/shared-constants';
import { BaseProperty, OkrModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

/**
 * The role a user needs to see something. 'public' = everyone, logged in or not; 'anonymous' = only someone who
 * is NOT logged in. The former 'none' meant the same as 'public' and was merged into it on 2026-11-22 (all
 * sections and menu items migrated); readers still treat a stray legacy 'none' as 'public' (see hasRole).
 */
export type RoleName = 'anonymous' | 'registered' | 'privileged' | 'contentAdmin' | 'resourceAdmin' | 'memberAdmin' | 'eventAdmin' | 'treasurer' | 'admin' | 'public' | 'groupAdmin' | 'kiosk' | 'tripAdmin' | 'auditor' | 'tester';

/** How a tenant's main menu is laid out; absent on the root document means 'left'. */
export type MenuType = 'left' | 'right' | 'top' | 'segmented' | 'static';

export type StaticMenuBulletShape = 'square' | 'round' | 'none';
export type StaticMenuActiveStyle = 'bold' | 'color' | 'underline';
export type StaticMenuChildrenVisibility = 'always' | 'active';
export type StaticMenuChildrenDirection = 'horizontal' | 'vertical';

/** Look of the `static` main menu (spec 1.163). Absent fields mean the defaults. */
export interface StaticMenuConfig {
  bulletColor?: string; // Ionic colour name or #rgb / #rrggbb; default 'primary'
  bulletShape?: StaticMenuBulletShape; // default 'square'
  bulletSize?: number; // px, default 12
  activeStyle?: StaticMenuActiveStyle; // default 'bold'
  childrenVisibility?: StaticMenuChildrenVisibility; // default 'active'
  childrenDirection?: StaticMenuChildrenDirection; // default 'horizontal'
}

export class MenuItemModel implements OkrModel, NamedModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY; // unique key of the model in the database
  public name = DEFAULT_NAME; //  name: e.g. aoc, help, members ...
  public index = DEFAULT_INDEX; // the index of the menu item (to search for)
  public action = DEFAULT_MENU_ACTION; // the action that should be taken when the menu item is clicked
  public url = DEFAULT_URL; // the url that should be navigated to when the menu item is clicked
  public label = ''; // label (i18n), the text that the users sees in the menu
  /**
   * Optional plain-text search words (not an i18n key), e.g. 'Logbuch Fahrten Ruderbuch'. Written into
   * `index` by `getMenuIndex`, so the main-menu search finds the row by the club's own words as well as
   * by its translated label. Absent on legacy docs — coalesce on read.
   */
  public nickName?: string;
  public icon = 'help-circle'; // the icon that should be displayed in the menu
  // action 'toggle' only: the alternate icon/label shown while the toggled state is active (true).
  // The base icon/label are shown while it is inactive (false).
  public iconAlt?: string; // alternate icon for the active toggle state (e.g. eye-off)
  public labelAlt?: string; // alternate label (i18n) for the active toggle state
  // optional info text, plain or an i18n key ('@…'); when set, the menu row shows an
  // info-circle on its right that opens the text in a popover
  public info?: string;
  /**
   * Set when a tenant customised a globally shared, catalogue-owned menu item: the doc
   * was copied, the tenant removed from the shared doc's `tenants[]`, and this points at
   * the shared original. A fork keeps its own label/icon/order; catalogue structural
   * fixes no longer reach it automatically (D-BB-8).
   */
  public forkedFrom?: string;
  /**
   * Structural fields (`url` | `action` | `roleNeeded`) this tenant owns DELIBERATELY —
   * set through «Fixieren» in `/tenant/features` (D-BB-16). A field listed here is never
   * written by the catalogue (`applyCatalogueValue` refuses until it is released again)
   * and is reported as "eigener Wert" rather than as drift by `pnpm catalogue:check`.
   *
   * On a SHARED document the pin applies to every tenant of that document — which is
   * correct, because the value on a shared document is the same for all of them. A tenant
   * that needs a different value than the others forks the document in the menu editor
   * (D-BB-8) and pins on the fork.
   */
  public ownedFields?: string[];
  public data?: BaseProperty[] = []; // URL parameters that should be passed to the url
  public menuItems?: string[] = []; // the keys of the sub menu items
  /** action 'main' only: how this tenant's main menu is laid out. Absent means 'left'. */
  public menuType?: MenuType;
  /** action 'main' only: indent of submenu rows and gap below a dropdown, in px. Absent means DEFAULT_SUBMENU_OFFSET. */
  public submenuOffset?: number;
  /** action 'main' + menuType 'static' only: look of the static menu. Absent fields mean defaults. */
  public staticMenu?: StaticMenuConfig;
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
