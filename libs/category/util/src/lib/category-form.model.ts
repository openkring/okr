import { CategoryItemModel } from '@bk2/shared/models';
import { DeepRequired } from 'ngx-vest-forms';

// a form model is always deep partial because angular will create it over time organically
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
  items: CategoryItemModel[],

};

export const categoryListFormModelShape: DeepRequired<CategoryListFormModel> = {
  bkey: '',
  name: '',
  tags: '',
  isArchived: false,
  tenants: [],
  index: '',

  i18nBase: '',
  translateItems: false,
  notes: '',
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

export const categoryItemFormModelShape: DeepRequired<CategoryItemFormModel> = {
  name: '',
  abbreviation: '',
  icon: '',
  state: 'active',
  price: 0,
  currency: 'CHF',
  periodicity: 'yearly'
};

