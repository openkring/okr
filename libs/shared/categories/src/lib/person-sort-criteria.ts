import { CategoryModel, PersonSortCriteria } from '@bk2/shared/models';

export type PersonSortCriteriaCategory = CategoryModel;

// name can also be used as the fieldName for the sort
export const PersonSortCriterias: PersonSortCriteriaCategory[] = [
  {
    id: PersonSortCriteria.Firstname,
    abbreviation: 'FN',
    name: 'firstName',
    i18nBase: 'categories.sortCriteria.firstname',
    icon: 'arrow-back-circle'
  },
  {
    id: PersonSortCriteria.Lastname,
    abbreviation: 'LN',
    name: 'lastName',
    i18nBase: 'categories.sortCriteria.lastname',
    icon: 'arrow-forward-circle'
  },
  {
    id: PersonSortCriteria.Fullname,
    abbreviation: 'FU',
    name: 'name',
    i18nBase: 'categories.sortCriteria.fullname',
    icon: 'arrow-up-circle'
  },
  {
    id: PersonSortCriteria.DateOfBirth,
    abbreviation: 'DOB',
    name: 'dateOfBirth',
    i18nBase: 'categories.sortCriteria.dob',
    icon: 'birthday'
  },
  {
    id: PersonSortCriteria.Key,
    abbreviation: 'KEY',
    name: 'bkey',
    i18nBase: 'categories.sortCriteria.key',
    icon: 'resource_key'
  }
]
