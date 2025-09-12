import { CategoryItemModel, CategoryListModel } from '@bk2/shared-models';
import { isType } from '@bk2/shared-util-core';

import { CategoryItemFormModel, CategoryListFormModel } from './category-form.model';

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

export function convertFormToCategoryList(cat: CategoryListModel | undefined, vm: CategoryListFormModel, tenantId: string): CategoryListModel {
  cat ??= new CategoryListModel(tenantId);
  cat.name = vm.name ?? '';
  cat.tags = vm.tags ?? '';

  cat.i18nBase = vm.i18nBase ?? '';
  cat.translateItems = vm.translateItems ?? false;
  cat.notes = vm.notes ?? '';
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
    state: cat.state,
    price: cat.price,
    currency: cat.currency,
    periodicity: cat.periodicity,
  };
}

export function convertFormToCategoryItem(cat: CategoryItemModel | undefined, vm: CategoryItemFormModel): CategoryItemModel {
  cat ??= new CategoryItemModel('', '', '');
  cat.name = vm.name ?? '';
  cat.abbreviation = vm.abbreviation ?? '';
  cat.icon = vm.icon ?? '';
  cat.state = vm.state ?? 'active';
  cat.price = vm.price ?? 0;
  cat.currency = vm.currency ?? 'CHF';
  cat.periodicity = vm.periodicity ?? 'yearly';
  return cat;
}

export function isCategoryItem(cat: unknown): cat is CategoryItemModel {
  return isType(cat, new CategoryItemModel('', '', ''));
}

export function getCategoryAttribute(cat: CategoryListModel, catName: string, attributeName: keyof CategoryItemModel): string | number {
  const _item = cat.items.find(i => i.name === catName);
  if (!_item) return '';
  return _item[attributeName];
}
