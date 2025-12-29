import { Router } from '@angular/router';
import { Browser } from '@capacitor/browser';


import { MenuItemModel } from '@bk2/shared-models';
import { navigateByUrl } from '@bk2/shared-util-angular';
import { getPropertyValue, isType, warn } from '@bk2/shared-util-core';

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
export function getMenuIndex(menuItem: MenuItemModel): string {
  return 'n:' + menuItem.name + ' a:' + menuItem.action + ' k:' + menuItem.bkey;
}

export function getMenuIndexInfo(): string {
  return 'n:ame a:ction k:ey';
}
