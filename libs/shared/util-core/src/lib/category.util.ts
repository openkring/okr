import { CategoryListModel } from "@bk2/shared-models";

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