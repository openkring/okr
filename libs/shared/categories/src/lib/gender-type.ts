import { CategoryModel, GenderType } from '@bk2/shared-models';
import { getCategoryStringField } from './category.util';

export type GenderTypeCategory = CategoryModel;

export const GenderTypes: GenderTypeCategory[] = [
  {
    id: GenderType.Male,
    abbreviation: 'M',
    name: 'male',
    i18nBase: 'subject.person.gender.male',
    icon: 'gender_male'
  },
  {
    id: GenderType.Female,
    abbreviation: 'F',
    name: 'female',
    i18nBase: 'subject.person.gender.female',
    icon: 'gender_female'
  },
  {
    id: GenderType.Other,
    abbreviation: 'O',
    name: 'other',
    i18nBase: 'subject.person.gender.other',
    icon: 'gender_diverse'
  }
]

export function getSalutation(gender: GenderType): string {
  return `@${getCategoryStringField(GenderTypes, gender, 'i18nBase')}.salutation`;
}
export function getGreeting(gender: GenderType): string {
  return `@${getCategoryStringField(GenderTypes, gender, 'i18nBase')}.greeting`;
}

export function getFormalSalutation(gender: GenderType): string {
  return `@${getCategoryStringField(GenderTypes, gender, 'i18nBase')}.formal`;
}
