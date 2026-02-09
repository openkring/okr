import { DEFAULT_CURRENCY, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_MSTATE, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PERIODICITY, DEFAULT_PRICE, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { BkModel, NamedModel, PersistedModel, SearchableModel, TaggedModel } from './base.model';

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
  bkey = DEFAULT_KEY;
  name = DEFAULT_NAME;
  tags = DEFAULT_TAGS;
  isArchived = false;
  tenants: string[] = DEFAULT_TENANTS;
  index = DEFAULT_INDEX;

  i18nBase = '';
  translateItems = false;
  notes = DEFAULT_NOTES;
  items: CategoryItemModel[] = [];

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export class CategoryItemModel {
  name = DEFAULT_NAME;
  abbreviation = '';
  icon = '';
  state = DEFAULT_MSTATE;
  price = DEFAULT_PRICE;
  currency = DEFAULT_CURRENCY;
  periodicity = DEFAULT_PERIODICITY;

  constructor(name: string, abbreviation: string, icon: string, state?: string, price?: number, currency?: string, periodicity?: string) {
    this.name = name;
    this.abbreviation = abbreviation;
    this.icon = icon;
    this.state = state ?? DEFAULT_MSTATE;
    this.price = price ?? DEFAULT_PRICE;
    this.currency = currency ?? DEFAULT_CURRENCY;
    this.periodicity = periodicity ?? DEFAULT_PERIODICITY ;
  }
}

export const CategoryCollection = 'categories';
export const CategoryModelName = 'category';

