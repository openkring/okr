import { CategoryModel, Language, LanguageCodes } from '@okr/shared-models';

export type LanguageCategory = CategoryModel;

/**
 * Compile-time parity guard: one entry per code in `LanguageCodes` (@okr/shared-models), in the
 * same order, with each `abbreviation` pinned to its code. Adding, removing or reordering a
 * language on either side is a type error here — the code list has exactly one source of truth.
 */
type PinAbbreviations<T extends readonly string[]> = {
  -readonly [K in keyof T]: LanguageCategory & { abbreviation: T[K] };
};
type LanguageCategories = PinAbbreviations<typeof LanguageCodes>;

const LanguageEntries: LanguageCategories = [
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
];

// Exported with the plain CategoryModel[] type consumers expect; the guard lives on LanguageEntries.
export const Languages: LanguageCategory[] = LanguageEntries;
