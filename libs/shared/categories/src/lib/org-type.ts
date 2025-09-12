import { CategoryModel, OrgType } from '@bk2/shared-models';

export type OrgTypeCategory = CategoryModel;

export const OrgTypes: OrgTypeCategory[] = [
  {
      id: OrgType.Association,
      abbreviation: 'ASSOC',
      name: 'association',
      i18nBase: 'subject.org.type.association',
      icon: 'assembly'
  },
  {
      id: OrgType.LegalEntity,
      abbreviation: 'LE',
      name: 'legalEntity',
      i18nBase: 'subject.org.type.legalEntity',
      icon: 'legal'
  },
  {
      id: OrgType.Authority,
      abbreviation: 'AUTH',
      name: 'authority',
      i18nBase: 'subject.org.type.authority',
      icon: 'school'
  },
  {
      id: OrgType.Other,
      abbreviation: 'OTHR',
      name: 'other',
      i18nBase: 'subject.org.type.other',
      icon: 'other'
  }
]
