import { CategoryItemModel, CategoryListModel } from '@bk2/shared-models';
import { addIndexElement, die, isType } from '@bk2/shared-util-core';

import { CategoryItemFormModel, CategoryListFormModel } from './category-form.model';
import { DEFAULT_CURRENCY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PRICE, DEFAULT_TAGS } from '@bk2/shared-constants';

export function convertCategoryListToForm(cat: CategoryListModel): CategoryListFormModel {
  return {
    bkey: cat.bkey,
    name: cat.name,
    tags: cat.tags,
    isArchived: cat.isArchived,
    tenants: cat.tenants,
    index: cat.index,

    i18nBase: cat.i18nBase,
    translateItems: cat.translateItems,
    notes: cat.notes,
    items: cat.items,
  };
}

export function convertFormToCategoryList(vm?: CategoryListFormModel, cat?: CategoryListModel): CategoryListModel {
  if (!cat) die('category.util.convertFormToCategoryList: category list is mandatory.');
  if (!vm) return cat;

  cat.name = vm.name ?? DEFAULT_NAME;
  cat.tags = vm.tags ?? DEFAULT_TAGS;

  cat.i18nBase = vm.i18nBase ?? '';
  cat.translateItems = vm.translateItems ?? false;
  cat.notes = vm.notes ?? DEFAULT_NOTES;
  cat.items = vm.items;
  return cat;
}

export function isCategoryList(task: unknown, tenantId: string): task is CategoryListModel {
  return isType(task, new CategoryListModel(tenantId));
}

export function convertCategoryItemToForm(cat: CategoryItemModel): CategoryItemFormModel {
  return {
    name: cat.name,
    abbreviation: cat.abbreviation,
    icon: cat.icon,
    state: cat.state ?? '',
    price: cat.price ?? 0,
    currency: cat.currency ?? '',
    periodicity: cat.periodicity ?? '',
  };
}

export function convertFormToCategoryItem(cat: CategoryItemModel | undefined, vm: CategoryItemFormModel): CategoryItemModel {
  cat ??= new CategoryItemModel('', '', '');
  cat.name = vm.name ?? DEFAULT_NAME;
  cat.abbreviation = vm.abbreviation ?? '';
  cat.icon = vm.icon ?? '';
  cat.state = vm.state ?? 'active';
  cat.price = vm.price ?? DEFAULT_PRICE;
  cat.currency = vm.currency ?? DEFAULT_CURRENCY;
  cat.periodicity = vm.periodicity ?? 'yearly';
  return cat;
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

export function getCategoryAbbreviation(cat: CategoryListModel | undefined, catName: string): string {
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