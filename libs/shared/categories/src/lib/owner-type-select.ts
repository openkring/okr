import { CategoryModel, OwnerTypeSelect } from '@bk2/shared/models';

export type OwnerTypeCategory = CategoryModel;

export const OwnerTypes: OwnerTypeCategory[] = [
  {
      id: OwnerTypeSelect.Persons,
      abbreviation: 'PERS',
      name: 'persons',
      i18nBase: 'ownership.ownerType.persons',
      icon: 'person'
  },
  {
      id: OwnerTypeSelect.Men,
      abbreviation: 'MEN',
      name: 'men',
      i18nBase: 'ownership.ownerType.men',
      icon: 'gender_male'
  },
  {
      id: OwnerTypeSelect.Women,
      abbreviation: 'WOMEN',
      name: 'women',
      i18nBase: 'ownership.ownerType.women',
      icon: 'gender_female'
  },
  {
      id: OwnerTypeSelect.Org,
      abbreviation: 'ORG',
      name: 'orgs',
      i18nBase: 'ownership.ownerType.orgs',
      icon: 'org'
  }
]
