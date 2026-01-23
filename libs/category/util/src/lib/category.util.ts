import { CategoryItemModel, CategoryListModel } from '@bk2/shared-models';
import { addIndexElement, isType } from '@bk2/shared-util-core';

export function isCategoryList(task: unknown, tenantId: string): task is CategoryListModel {
  return isType(task, new CategoryListModel(tenantId));
}

export function isCategoryItem(cat: unknown): cat is CategoryItemModel {
  return isType(cat, new CategoryItemModel('', '', ''));
}

export function getCategoryAttribute(cat: CategoryListModel, catName: string, attributeName: keyof CategoryItemModel): string | number {
  const _item = cat.items.find(i => i.name === catName);
  if (!_item) return '';
  return _item[attributeName] ?? '';
}

export function getCategoryIcon(cat: CategoryListModel | undefined, catName: string): string {
  if (!cat) return '';
  return getCategoryAttribute(cat, catName, 'icon') + '';
}

export function getCatAbbreviation(cat: CategoryListModel | undefined, catName: string): string {
  if (!cat) return '';
  return getCategoryAttribute(cat, catName, 'abbreviation') + '';
}

/**
 * Create an index entry for a given category based on its values.
 * @param category 
 * @returns the index string
 */
export function getCategoryIndex(category: CategoryListModel): string {
  let _index = '';
  _index = addIndexElement(_index, 'n', category.name);
  return _index;
}

  /**
   * Returns a string explaining the structure of the index.
   * This can be used in info boxes on the GUI.
   */
  export function getCategoryIndexInfo(): string {
    return 'n:name';
  }