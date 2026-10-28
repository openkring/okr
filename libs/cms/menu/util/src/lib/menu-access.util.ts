import { MenuItemModel, UserModel } from '@okr/shared-models';
import { hasRole } from '@okr/shared-util-core';

/**
 * Whether the menu `name` opens for this user: its document is among `menuItems` and the user
 * passes its OWN `roleNeeded` — the same gate `okr-menu` applies to the menu itself.
 *
 * A context-menu button is gated twice: in code (`@if(hasRole('privileged') || …)`) and by the
 * menu document's role. The two drifted apart, so a privileged user saw the «…» button and got
 * an empty popover. Gate the button on this instead: the menu document decides, and a button
 * never shows without something behind it. `undefined` items (still loading) read as closed.
 */
export function canOpenMenu(menuItems: MenuItemModel[] | undefined, name: string | undefined, currentUser: UserModel | undefined): boolean {
  if (!name || !menuItems) return false;
  const item = menuItems.find(i => i.name === name);
  return !!item && hasRole(item.roleNeeded, currentUser);
}
