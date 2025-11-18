import { Router } from '@angular/router';
import { Browser } from '@capacitor/browser';


import { MenuItemModel, RoleName } from '@bk2/shared-models';
import { navigateByUrl } from '@bk2/shared-util-angular';
import { getPropertyValue, isType, warn } from '@bk2/shared-util-core';

import { MenuItemFormModel } from './menu-item-form.model';
import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_LABEL, DEFAULT_MENU_ACTION, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ROLE, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_URL } from '@bk2/shared-constants';

export async function menuActionNavigate(router: Router, menuItem: MenuItemModel): Promise<void> {
  await navigateByUrl(router, menuItem.url, menuItem.data);
}

export function menuActionBrowse(url: string, target = '_blank'): Promise<void> {
  return Browser.open({ url: url, windowName: target });
}

export function getMenuItemTitle(menuItemKey: string | undefined): string {
  const _operation = !menuItemKey ? 'create' : 'update';
  return `@content.menuItem.operation.${_operation}.label`;
}

export function newMenuItemFormModel(): MenuItemFormModel {
  return {
    bkey: DEFAULT_KEY,
    name: DEFAULT_NAME,
    index: DEFAULT_INDEX,
    action: 'navigate',
    url: DEFAULT_URL,
    label: DEFAULT_LABEL,
    icon: 'help-circle',
    data: [],
    menuItems: [],
    roleNeeded: 'none',
    tenants: DEFAULT_TENANTS,
    description: DEFAULT_NOTES,
    tags: DEFAULT_TAGS,
    isArchived: false,
  };
}

export function convertMenuItemToForm(menuItem: MenuItemModel | undefined): MenuItemFormModel {
  if (!menuItem) return newMenuItemFormModel();
  return {
    bkey: menuItem.bkey ?? DEFAULT_KEY,
    name: menuItem.name ?? DEFAULT_NAME,
    index: menuItem.index ?? DEFAULT_INDEX,
    action: menuItem.action ?? DEFAULT_MENU_ACTION,
    url: menuItem.url ?? DEFAULT_URL,
    label: menuItem.label ?? DEFAULT_LABEL,
    icon: menuItem.icon ?? '',
    data: menuItem.data ?? [],
    menuItems: menuItem.menuItems ?? [],
    roleNeeded: menuItem.roleNeeded,
    tenants: menuItem.tenants ?? DEFAULT_TENANTS,
    description: menuItem.description ?? DEFAULT_NOTES,
    tags: menuItem.tags ?? DEFAULT_TAGS,
    isArchived: menuItem.isArchived ?? false,
  };
}

export function convertFormToMenuItem(menuItem: MenuItemModel | undefined, vm: MenuItemFormModel, tenantId: string): MenuItemModel {
  menuItem ??= new MenuItemModel(tenantId);
  menuItem.name = vm.name ?? DEFAULT_NAME;
  menuItem.bkey = !vm.bkey || vm.bkey.length === 0 ? vm.name ?? DEFAULT_NAME : vm.bkey; // we want to use the name as the key of the menu item in the database
  menuItem.action = vm.action ?? DEFAULT_MENU_ACTION;
  menuItem.url = vm.url ?? DEFAULT_URL;
  menuItem.label = vm.label ?? DEFAULT_LABEL;
  menuItem.icon = vm.icon ?? 'help-circle';
  menuItem.data = vm.data ?? [];
  menuItem.menuItems = vm.menuItems ?? [];
  menuItem.roleNeeded = (vm.roleNeeded ?? DEFAULT_ROLE) as RoleName;
  menuItem.tenants = vm.tenants ?? DEFAULT_TENANTS;
  menuItem.description = vm.description ?? DEFAULT_NOTES;
  menuItem.tags = vm.tags ?? DEFAULT_TAGS;
  menuItem.isArchived = vm.isArchived ?? false;
  menuItem.index = getSearchIndex(menuItem);
  return menuItem;
}

export function getTarget(menuItem: MenuItemModel): string {
  const _target = getPropertyValue(menuItem.data, 'target', '_blank');
  if (typeof _target === 'string') {
    return _target;
  } else {
    warn('MenuUtil.getTarget: target=<' + _target + '> is not a string, returning _blank.');
    return '_blank';
  }
}

export function isMenuItem(menuItem: unknown, tenantId: string): menuItem is MenuItemModel {
  return isType(menuItem, new MenuItemModel(tenantId));
}

/*-------------------------- SEARCH --------------------------------*/
export function getSearchIndex(menuItem: MenuItemModel): string {
  return 'n:' + menuItem.name + ' a:' + menuItem.action + ' k:' + menuItem.bkey;
}

export function getSearchIndexInfo(): string {
  return 'n:ame a:ction k:ey';
}
