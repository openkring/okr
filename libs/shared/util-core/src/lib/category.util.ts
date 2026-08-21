import { CategoryListModel, CategoryItemModel } from "@okr/shared-models";
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
  if (!category.i18n || category.i18n.length === 0 || !category.translateItems) return itemName;
  // `category.i18n` already carries the leading '@' scope prefix (e.g. '@task/feature') — that is
  // the convention in every production category document and in the okr-category-select component.
  // Pass it through unchanged; do NOT prepend another '@'. Prepending doubled it to
  // '@@task/feature…', which I18nService.translate strips to scope '@task/feature' → a 404 on
  // assets/i18n/@task/feature/de.json and a blank/failed label. Consumers resolve this key via
  // I18nService.translate (directly or through TranslatePipe), which only translates keys starting
  // with '@' — a bare key is returned as-is (shown untranslated). See i18n.service.ts.
  return `${category.i18n}.${category.name}.${itemName}.label`;
}

/**
 * Return the i18n key of a category item's long description — the `.description` sibling of
 * getItemLabel's `.label` key. Used for legends and help texts; '' if the item is untranslated.
 */
export function getItemDescription(category: CategoryListModel, itemName?: string): string {
  const label = getItemLabel(category, itemName);
  return label.startsWith('@') ? label.replace(/\.label$/, '.description') : '';
}

/**
 * extract the names of category list items as a comma-separated string.
 * This can be used to generate the allChips attribute in okr-chips
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

/**
 * The name of the item AFTER `itemName`, wrapping around at the end — the click-through order
 * for a category rendered as a single tappable icon (e.g. a task's state). Falls back to the
 * first item when `itemName` is unknown (a legacy value), and to '' for an empty category.
 */
export function getNextCategoryName(cat?: CategoryListModel, itemName?: string): string {
  const items = cat?.items ?? [];
  if (items.length === 0) return '';
  const index = items.findIndex(i => i.name === itemName);
  return items[(index + 1) % items.length]?.name ?? '';
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
  return isType(cat, new CategoryItemModel('', ''));
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
  return `n:${category.name}`;
}

  /**
   * Returns a string explaining the structure of the index.
   * This can be used in info boxes on the GUI.
   */
  export function getCategoryIndexInfo(): string {
    return 'n:name';
  }