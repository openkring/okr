import { CategoryListModel } from '@okr/shared-models';
import { isOwnedBy } from '@okr/shared-util-core';

/** Items that code compares by name; removing or renaming one breaks the feature that reads it. */
const PROTECTED: Readonly<Record<string, readonly string[]>> = {
  address_channel: ['email', 'phone'],
  address_usage: ['home', 'custom'],
  gender: ['male', 'female'],
  org_type: ['association', 'legalEntity', 'other'],
  resource_type: ['other'],
};

/** Items that may go, but that a switched-on block still offers; value = the block. */
const WARNED: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  address_channel: { postal: 'finance', bankaccount: 'finance' },
};

export function protectedItems(listName: string, isEnabled: (block: string) => boolean): readonly string[] {
  const names = PROTECTED[listName] ?? [];
  // the boat register reads rboat, so it is only held while the Logbuch is on
  return listName === 'resource_type' && isEnabled('trip') ? [...names, 'rboat'] : names;
}

export function missingProtectedItems(list: Pick<CategoryListModel, 'name' | 'items'>, isEnabled: (block: string) => boolean): string[] {
  const present = new Set((list.items ?? []).map(item => item.name));
  return protectedItems(list.name, isEnabled).filter(name => !present.has(name));
}

export function removalWarning(listName: string, itemName: string, isEnabled: (block: string) => boolean): 'postal' | 'bankaccount' | undefined {
  const block = WARNED[listName]?.[itemName];
  if (!block || !isEnabled(block)) return undefined;
  return itemName as 'postal' | 'bankaccount';
}

/**
 * A list whose name, i18n scope and translateItems must stay as they are: it is shared with other
 * tenants, or it is the tenant's copy of a system list (code finds it by that name).
 * Judge the list as loaded, not as typed — otherwise typing «gender» into a new list would lock the field.
 */
export function isLockedList(
  list: Pick<CategoryListModel, 'name' | 'tenants'>,
  tenantId: string,
  allCategories: readonly Pick<CategoryListModel, 'name' | 'tenants'>[],
): boolean {
  if (!isOwnedBy(list, tenantId)) return true;
  return allCategories.some(cat => cat.name === list.name && (cat.tenants ?? []).includes('system'));
}
