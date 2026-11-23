import { CategoryItemModel, CategoryListModel } from '@okr/shared-models';
import { copyStatus, ListCopyStatus } from '@okr/shared-util-core';

/**
 * How the tenant holds this list. Judged on the list as loaded, so that typing «gender» into a new
 * list changes nothing; `items` are the edited ones, so `missing` follows what is added or removed.
 * Any kind but `own` keeps its name, i18n scope and translateItems: code and labels find it by them.
 * @param allCategories the undeduplicated lists (`AppStore.allCategories()`)
 */
export function categoryCopyStatus(
  loaded: CategoryListModel, allCategories: readonly CategoryListModel[], tenantId: string, items = loaded.items,
): ListCopyStatus<CategoryListModel> {
  const others = allCategories.filter(cat => cat.name === loaded.name && cat.okey !== loaded.okey);
  return copyStatus([{ ...loaded, items }, ...others], tenantId, cat => (cat.items ?? []).map(item => item.name));
}

/** The items plus a deep copy of one item of the shared list. */
export function withSharedItem(
  items: CategoryItemModel[], shared: CategoryListModel | undefined, name: string,
): CategoryItemModel[] {
  const item = shared?.items?.find(i => i.name === name);
  return !item || items.some(i => i.name === name) ? items : [...items, structuredClone(item)];
}
