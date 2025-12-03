import { DEFAULT_CURRENCY, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PRICE, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { CategoryItemModel } from '@bk2/shared-models';

export type CategoryListFormModel = {
  bkey: string,
  name: string,
  tags: string,
  isArchived: boolean,
  tenants: string[],
  index: string

  i18nBase: string,
  translateItems: boolean,
  notes: string,
  items: CategoryItemModel[]
};

export const CATEGORY_LIST_FORM_SHAPE: CategoryListFormModel = {
  bkey: DEFAULT_KEY,
  name: DEFAULT_NAME,
  tags: DEFAULT_TAGS,
  isArchived: false,
  tenants: DEFAULT_TENANTS,
  index: DEFAULT_INDEX,
  i18nBase: '',
  translateItems: false,
  notes: DEFAULT_NOTES,
  items: [],
};


export type CategoryItemFormModel = {
  name: string,
  abbreviation: string,
  icon: string,
  state: string,
  price: number,
  currency: string,
  periodicity: string
};

export const CATEGORY_ITEM_FORM_SHAPE: CategoryItemFormModel = {
  name: DEFAULT_NAME,
  abbreviation: '',
  icon: '',
  state: 'active',
  price: DEFAULT_PRICE,
  currency: DEFAULT_CURRENCY,
  periodicity: 'yearly'
};

