import { CategoryModel, Language } from '@bk2/shared-models';

export type LanguageCategory = CategoryModel;


export const Languages: LanguageCategory[] = [
  {
    id: Language.GE,
    abbreviation: 'de',
    name: 'german',
    i18nBase: '@shared/categories.language.ge',
    icon: 'german'
  },
  {
    id: Language.EN,
    abbreviation: 'en',
    name: 'english',
    i18nBase: '@shared/categories.language.en',
    icon: 'english'
  },
  {
    id: Language.FR,
    abbreviation: 'fr',
    name: 'french',
    i18nBase: '@shared/categories.language.fr',
    icon: 'french'
  },
  {
    id: Language.ES,
    abbreviation: 'es',
    name: 'spanish',
    i18nBase: '@shared/categories.language.es',
    icon: 'spanish'
  },
  {
    id: Language.IT,
    abbreviation: 'it',
    name: 'italian',
    i18nBase: '@shared/categories.language.it',
    icon: 'italian'
  }
]
