import { MENU_BAR_ACCOUNT_KEYS } from '@okr/shared-constants';
import { MenuType } from '@okr/shared-models';

/** `top` and `segmented` lay the main menu out as a bar; `left`, `right` and absent as a sidebar. */
export function isBarMenuType(type: MenuType | undefined): boolean {
  return type === 'top' || type === 'segmented';
}

/** The stored rows of a root menu that sit in the account area (login, logout, profile). */
export function barAccountKeys(menuItems: string[] | undefined): string[] {
  return (menuItems ?? []).filter(key => MENU_BAR_ACCOUNT_KEYS.includes(key));
}

/** The stored rows that count against `MAX_MENU_BAR_ITEMS`: everything but the account rows. */
export function countBarItems(menuItems: string[] | undefined): number {
  return (menuItems ?? []).length - barAccountKeys(menuItems).length;
}

/**
 * Whether the menu bar is what renders the main menu. `segmented` keeps its bar on every width,
 * `top` falls back to the sidebar on a narrow screen.
 */
export function isBarActive(type: MenuType | undefined, isWide: boolean): boolean {
  return type === 'segmented' || (type === 'top' && isWide);
}
