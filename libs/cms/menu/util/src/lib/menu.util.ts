import { Router } from '@angular/router';
import { Browser } from '@capacitor/browser';

import { getCategoryAbbreviation, MenuActions, RoleEnums } from '@bk2/shared-categories';
import { MenuAction, MenuItemModel, RoleEnum, RoleName } from '@bk2/shared-models';
import { navigateByUrl } from '@bk2/shared-util-angular';
import { getPropertyValue, isType, warn } from '@bk2/shared-util-core';

import { MenuItemFormModel } from './menu-item-form.model';

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
    bkey: '',
    name: '',
    index: '',
    action: MenuAction.Navigate,
    url: '',
    label: '',
    icon: 'help-circle',
    data: [],
    menuItems: [],
    roleNeeded: RoleEnum.None,
    tenants: [],
    description: '',
    tags: '',
    isArchived: false,
  };
}

export function convertMenuItemToForm(menuItem: MenuItemModel | undefined): MenuItemFormModel {
  if (!menuItem) return newMenuItemFormModel();
  return {
    bkey: menuItem.bkey ?? '',
    name: menuItem.name ?? '',
    index: menuItem.index ?? '',
    action: menuItem.action ?? MenuAction.Navigate,
    url: menuItem.url ?? '',
    label: menuItem.label ?? '',
    icon: menuItem.icon ?? '',
    data: menuItem.data ?? [],
    menuItems: menuItem.menuItems ?? [],
    roleNeeded: convertRoleNameToEnum(menuItem.roleNeeded),
    tenants: menuItem.tenants ?? [],
    description: menuItem.description ?? '',
    tags: menuItem.tags ?? '',
    isArchived: menuItem.isArchived ?? false,
  };
}

export function convertFormToMenuItem(menuItem: MenuItemModel | undefined, vm: MenuItemFormModel, tenantId: string): MenuItemModel {
  menuItem ??= new MenuItemModel(tenantId);
  menuItem.name = vm.name ?? '';
  menuItem.bkey = !vm.bkey || vm.bkey.length === 0 ? vm.name ?? '' : vm.bkey; // we want to use the name as the key of the menu item in the database
  menuItem.action = vm.action ?? MenuAction.Navigate;
  menuItem.url = vm.url ?? '';
  menuItem.label = vm.label ?? '';
  menuItem.icon = vm.icon ?? 'help-circle';
  menuItem.data = vm.data ?? [];
  menuItem.menuItems = vm.menuItems ?? [];
  const _roleNeeded = convertRoleEnumToName(vm.roleNeeded);
  if (_roleNeeded) menuItem.roleNeeded = _roleNeeded;
  menuItem.tenants = vm.tenants ?? [];
  menuItem.description = vm.description ?? '';
  menuItem.tags = vm.tags ?? '';
  menuItem.isArchived = vm.isArchived ?? false;
  menuItem.index = getSearchIndex(menuItem);
  return menuItem;
}

/**
 * Map a role name to its corresponding RoleEnum value by searching the RoleEnums array (from @bk2/shared-categories) 
 * for an entry where the name property matches the input roleName. It is primarily used in the convertMenuItemToForm function to 
 * transform a MenuItemModel’s roleNeeded field into a RoleEnum for the MenuItemFormModel. If the input roleName is invalid, 
 * it logs a warning using warn (from @bk2/shared-util-core) and returns RoleEnum.None, ensuring graceful error handling.
 * @param roleName The corresponding RoleEnum value from the RoleEnums array (e.g., RoleEnum.Admin, RoleEnum.Registered).
 * @returns Returns RoleEnum.None if the role name is invalid or not found.
 */
export function convertRoleNameToEnum(roleName?: string): RoleEnum {
  if (!roleName) return RoleEnum.None;

  const _role = RoleEnums.find(enumItem => enumItem.name === roleName);
  if (!_role) {
    warn(`MenuUtil.convertRoleNameToEnum: invalid roleName=${roleName}, defaulting to RoleEnum.None`);
    return RoleEnum.None;
  }
  return _role.id;
}

/**
 * Map a RoleEnum value to its role name by searching the RoleEnums array (from @bk2/shared-categories)
 * @param roleEnum the RoleEnum value
 * @returns the corresponding role name of the role value
 */
export function convertRoleEnumToName(roleEnum?: RoleEnum): RoleName | undefined {
  console.log('MenuUtil.convertRoleEnumToName: roleEnum=' + roleEnum);
  return roleEnum === undefined ? 'none' : (RoleEnums[roleEnum].name as RoleName);
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
  return 'n:' + menuItem.name + ' m:' + getCategoryAbbreviation(MenuActions, menuItem.action) + ' k:' + menuItem.bkey;
}

export function getSearchIndexInfo(): string {
  return 'n:ame m:enuAction k:ey';
}
