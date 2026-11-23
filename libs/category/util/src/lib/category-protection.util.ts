import { CategoryListModel } from '@okr/shared-models';

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

/**
 * @param loaded the list the edit started from; a stored one must keep only the protected items it held,
 * so a list that already lacked one stays saveable
 */
export function missingProtectedItems(list: Pick<CategoryListModel, 'name' | 'items'>, isEnabled: (block: string) => boolean, loaded?: Pick<CategoryListModel, 'okey' | 'items'>): string[] {
  const present = new Set((list.items ?? []).map(item => item.name));
  const held = loaded?.okey ? new Set((loaded.items ?? []).map(item => item.name)) : undefined;
  return protectedItems(list.name, isEnabled).filter(name => !present.has(name) && (!held || held.has(name)));
}

export function removalWarning(listName: string, itemName: string, isEnabled: (block: string) => boolean): 'postal' | 'bankaccount' | undefined {
  const block = WARNED[listName]?.[itemName];
  if (!block || !isEnabled(block)) return undefined;
  return itemName as 'postal' | 'bankaccount';
}
