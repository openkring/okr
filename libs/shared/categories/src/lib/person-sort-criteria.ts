import { CategoryModel, PersonSortCriteria } from '@okr/shared-models';

export type PersonSortCriteriaCategory = CategoryModel;

// name can also be used as the fieldName for the sort
export const PersonSortCriterias: PersonSortCriteriaCategory[] = [
  {
    id: PersonSortCriteria.Firstname,
    abbreviation: 'FN',
    name: 'firstName',
    i18nBase: '@shared/categories.sortCriteria.firstname',
    icon: 'arrow-back-circle'
  },
  {
    id: PersonSortCriteria.Lastname,
    abbreviation: 'LN',
    name: 'lastName',
    i18nBase: '@shared/categories.sortCriteria.lastname',
    icon: 'arrow-forward-circle'
  },
  {
    id: PersonSortCriteria.Fullname,
    abbreviation: 'FU',
    name: 'name',
    i18nBase: '@shared/categories.sortCriteria.fullname',
    icon: 'arrow-up-circle'
  },
  // DateOfBirth was removed as a selectable criterion: person.dateOfBirth was
  // stripped in privacy 1.19 Phase 4 (the enum value stays for stored user prefs).
  {
    id: PersonSortCriteria.Key,
    abbreviation: 'KEY',
    name: 'okey',
    i18nBase: '@shared/categories.sortCriteria.key',
    icon: 'key'
  }
]
