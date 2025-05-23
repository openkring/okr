import { Router } from '@angular/router';
import { Browser } from '@capacitor/browser';

import { die, getPropertyValue, isType, navigateByUrl, warn } from '@bk2/shared/util';
import { getCategoryAbbreviation, MenuActions, RoleEnums } from '@bk2/shared/categories';
import { RoleName } from '@bk2/shared/config';
import { MenuAction, MenuItemModel, RoleEnum } from '@bk2/shared/models';
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
    isArchived: false
  }
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
    isArchived: menuItem.isArchived ?? false
  }
}

export function convertFormToMenuItem(menuItem: MenuItemModel | undefined, vm: MenuItemFormModel, tenantId: string): MenuItemModel {
  menuItem ??= new MenuItemModel(tenantId);
  menuItem.name = vm.name ?? '';
  menuItem.bkey = (!vm.bkey || vm.bkey.length === 0) ? vm.name ?? '' : vm.bkey; // we want to use the name as the key of the menu item in the database
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

export function convertRoleNameToEnum(roleName?: string): RoleEnum {
  if (!roleName) return RoleEnum.None;
  switch (roleName) {
    case 'none': return RoleEnum.None;
    case 'anonymous': return RoleEnum.Anonymous;
    case 'registered': return RoleEnum.Registered;
    case 'privileged': return RoleEnum.Privileged;
    case 'contentAdmin': return RoleEnum.ContentAdmin;
    case 'resourceAdmin': return RoleEnum.ResourceAdmin;
    case 'memberAdmin': return RoleEnum.MemberAdmin;
    case 'eventAdmin': return RoleEnum.EventAdmin;
    case 'treasurer': return RoleEnum.Treasurer;
    case 'admin': return RoleEnum.Admin;
    default: die('MenuUtil.convertRoleNameToEnum: invalid roleName=' + roleName);
  }
}

export function convertRoleEnumToName(roleEnum?: RoleEnum): RoleName | undefined {
  return roleEnum === undefined ? 'none' : RoleEnums[roleEnum].name as RoleName;
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