import { Router } from '@angular/router';
import { Browser } from '@capacitor/browser';


import { MenuItemModel } from '@okr/shared-models';
import { navigateByUrl } from '@okr/shared-util-angular';
import { getPropertyValue, isType, warn } from '@okr/shared-util-core';

export async function menuActionNavigate(router: Router, menuItem: MenuItemModel): Promise<void> {
  await navigateByUrl(router, menuItem.url, menuItem.data);
}

export function menuActionBrowse(url: string, target = '_blank'): Promise<void> {
  return Browser.open({ url: url, windowName: target });
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
/**
 * `nn:` (the plain-text `nickName`) is appended only when set, so a row without one keeps the
 * former index. Mirrored in `@okr/tenant-util` (`menuIndex` in menu-seed.util, root-menu.util).
 */
export function getMenuIndex(menuItem: MenuItemModel): string {
  const nickName = menuItem.nickName?.trim();
  return 'n:' + menuItem.name + ' a:' + menuItem.action + ' k:' + menuItem.okey + (nickName ? ' nn:' + nickName : '');
}

export function getMenuIndexInfo(): string {
  return 'n:ame a:ction k:ey nn:ickName';
}
