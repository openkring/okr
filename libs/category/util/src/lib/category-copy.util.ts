import { CategoryItemModel, CategoryListModel } from '@okr/shared-models';
import { completeLabels, copyStatus, getItemLabel, isOwnedBy, ListCopyStatus, toI18nRef } from '@okr/shared-util-core';

import { CategoryItemLabel } from './category-item-label.validations';

/**
 * How the tenant holds this list. Judged on the list as loaded, so that typing «gender» into a new
 * list changes nothing; `items` are the edited ones and only move `missing`, never `shared`.
 * Any kind but `own` keeps its name, i18n scope and translateItems: code and labels find it by them.
 * @param allCategories the undeduplicated lists (`AppStore.allCategories()`)
 */
export function categoryCopyStatus(
  loaded: CategoryListModel, allCategories: readonly CategoryListModel[], tenantId: string, items = loaded.items,
): ListCopyStatus<CategoryListModel> {
  // a shared list is shared, even while the app still holds a copy that was just given up
  const others = isOwnedBy(loaded, tenantId)
    ? allCategories.filter(cat => cat.name === loaded.name && cat.okey !== loaded.okey) : [];
  const namesOf = (cat: CategoryListModel) => (cat.items ?? []).map(item => item.name);
  const { missing } = copyStatus([{ ...loaded, items }, ...others], tenantId, namesOf);
  return { ...copyStatus([loaded, ...others], tenantId, namesOf), missing };
}

/** The items plus a deep copy of one item of the shared list. */
export function withSharedItem(
  items: CategoryItemModel[], shared: CategoryListModel | undefined, name: string,
): CategoryItemModel[] {
  const item = shared?.items?.find(i => i.name === name);
  return !item || items.some(i => i.name === name) ? items : [...items, structuredClone(item)];
}

/** The i18n key an own item is labelled by; undefined when it needs no label (untranslated list, shared item). */
export function itemLabelKey(list: CategoryListModel, name: string, shared: CategoryListModel | undefined): string | undefined {
  const key = getItemLabel(list, name);
  return toI18nRef(key) && !shared?.items?.some(item => item.name === name) ? key : undefined;
}

/**
 * The labels to store with a saved list: one per item that was added, complete in all languages.
 * @param entered what the admin typed, by item name
 */
export function newItemLabels(
  list: CategoryListModel, loaded: CategoryListModel, shared: CategoryListModel | undefined,
  entered: Readonly<Record<string, CategoryItemLabel>>,
): { key: string; labels: Record<string, string> }[] {
  const before = new Set((loaded.items ?? []).map(item => item.name));
  return (list.items ?? [])
    .filter(({ name }) => entered[name] || !before.has(name))
    .flatMap(({ name }) => {
      const key = itemLabelKey(list, name, shared);
      return key ? [{ key, labels: completeLabels({ ...entered[name] }, name) }] : [];
    });
}
