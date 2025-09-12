import { CategoryListModel } from "@bk2/shared-models";

export function getItemLabel(category: CategoryListModel, itemName?: string): string {
  if (!itemName) return '';
  if (!category.i18nBase || category.i18nBase.length === 0 || !category.translateItems) return itemName;
  return `@${category.i18nBase}.${category.name}.${itemName}.label`;
}