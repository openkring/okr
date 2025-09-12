import { CategoryModel, NameDisplay } from '@bk2/shared-models';

export type NameDisplayCategory = CategoryModel;

export const NameDisplays: NameDisplayCategory[] = [
  {
    id: NameDisplay.FirstLast,
    abbreviation: 'FL',
    name: 'firstLast',
    i18nBase: 'categories.nameDisplay.firstLast',
    icon: 'arrow-forward-circle'
  },
  {
    id: NameDisplay.LastFirst,
    abbreviation: 'LF',
    name: 'lastFirst',
    i18nBase: 'categories.nameDisplay.lastFirst',
    icon: 'arrow-back-circle'
  },
  {
    id: NameDisplay.FirstOnly,
    abbreviation: 'FO',
    name: 'firstOnly',
    i18nBase: 'categories.nameDisplay.firstOnly',
    icon: 'arrow-up-circle'
  },
  {
    id: NameDisplay.LastOnly,
    abbreviation: 'LO',
    name: 'lastOnly',
    i18nBase: 'categories.nameDisplay.lastOnly',
    icon: 'arrow-down-circle'
  }
]
