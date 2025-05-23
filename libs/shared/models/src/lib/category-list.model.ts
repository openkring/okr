import { BkModel, NamedModel, PersistedModel, SearchableModel, TaggedModel } from "./base.model";

/**
 * A category (CategoryList) consists of some metadata and a list of items.
 * The metadata is used to describe the category.
 * The items are the selectable labels that are shown in the UI
 * 
 * This enables to save categories in the database and make them dynamically adjustable by the user.
 * The categories are defined as types/interfaces instead of using enums.
 * 
 * If i18nBase is not defined, name is shown as the label.
 * Otherwise, '@${i18nBase}.${name}.label' is translated and shown as the label.
 */
export class CategoryListModel implements BkModel, NamedModel, PersistedModel, SearchableModel, TaggedModel {
  bkey = '';
  name = '';
  tags = '';
  isArchived = false;
  tenants: string[] = [];
  index = '';

  i18nBase = '';
  translateItems = false;
  notes = '';
  items: CategoryItemModel[] = [];

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export class CategoryItemModel {
  name = '';
  abbreviation = '';
  icon = '';
  state = 'active';
  price = 0;
  currency = 'CHF';
  periodicity = 'yearly';

  constructor(name: string, abbreviation: string, icon: string, state = 'active', price = 0, currency = 'CHF', periodicity = 'yearly') {
    this.name = name;
    this.abbreviation = abbreviation;
    this.icon = icon;
    this.state = state;
    this.price = price;
    this.currency = currency;
    this.periodicity = periodicity;
  }
}

export const CategoryCollection = 'categories';

export function getDefaultMembershipCategory(tenantId: string): CategoryListModel {
  const _cat = new CategoryListModel(tenantId);
  _cat.name = 'mcat_default';
  _cat.tags = '';
  _cat.i18nBase = 'membership.category';
  _cat.translateItems = true;
  _cat.notes = 'Default membership categories';
  _cat.items = [
    new CategoryItemModel('active', 'A', 'member_active', 'active', 30, 'CHF', 'yearly'),
    new CategoryItemModel('junior', 'J', 'member_junior', 'active', 10, 'CHF', 'yearly'),
    new CategoryItemModel('passive', 'P', 'member_passive', 'passive', 20, 'CHF', 'yearly')
  ];
  return _cat;
}