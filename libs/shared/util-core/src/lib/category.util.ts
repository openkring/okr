import { CategoryListModel, CategoryItemModel } from "@bk2/shared-models";
import { isType } from "./type.util";
import { addIndexElement } from "./base-model.util";

/**
 * Return the label of a given category list item.
 * @param category the CategoryListModel
 * @param itemName the item name
 * @returns the label of the item
 */
export function getItemLabel(category: CategoryListModel, itemName?: string): string {
  if (!itemName) return '';
  if (!category.i18nBase || category.i18nBase.length === 0 || !category.translateItems) return itemName;
  return `@${category.i18nBase}.${itemName}.label`;
}

/**
 * extract the names of category list items as a comma-separated string.
 * This can be used to generate the allChips attribute in bk-chips
 * @param cat 
 * @returns 
 */
export function getCategoryItemNames(cat?: CategoryListModel): string {
  if (!cat) return '';
  return cat.items.map(i => i.name).join(', ');
}

export function getCategoryIcon(cat?: CategoryListModel, itemName?: string): string {
  return cat?.items.find(i => i.name === itemName)?.icon ?? '';
}

// we use the first item as the default item
export function getDefaultCategoryName(cat?: CategoryListModel): string {
  return cat?.items[0]?.name ?? '';
}

export function getDefaultCategoryAbbreviation(cat?: CategoryListModel): string {
  return cat?.items[0]?.abbreviation ?? '';
}

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