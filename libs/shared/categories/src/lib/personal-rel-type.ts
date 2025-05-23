
import { CategoryModel, PersonalRelType } from '@bk2/shared/models';

export type PersonalRelTypeCategory = CategoryModel;

export const PersonalRelTypes: PersonalRelTypeCategory[] = [
  {
    id: PersonalRelType.Partner,
    abbreviation: 'PRTN',
    name: 'partner',
    i18nBase: 'categories.personal-rel-type.partner',
    icon: 'personal-rel'
  },
  {
    id: PersonalRelType.Husband,
    abbreviation: 'HSBND',
    name: 'husband',
    i18nBase: 'categories.personal-rel-type.husband',
    icon: 'personal-rel'
  },
  {
    id: PersonalRelType.Friend,
    abbreviation: 'FRND',
    name: 'friend',
    i18nBase: 'categories.personal-rel-type.friend',
    icon: 'personal-rel'
  },
  {
    id: PersonalRelType.Neighbor,
    abbreviation: 'NGHB',
    name: 'neighbor',
    i18nBase: 'categories.personal-rel-type.neighbor',
    icon: 'personal-rel'
  },
  {
    id: PersonalRelType.Incompatible,
    abbreviation: 'INCMP',
    name: 'incompatible',
    i18nBase: 'categories.personal-rel-type.incompatible',
    icon: 'personal-rel'
  },
  {
    id: PersonalRelType.Related,
    abbreviation: 'RELD',
    name: 'related',
    i18nBase: 'categories.personal-rel-type.related',
    icon: 'personal-rel'
  },
  {
    id: PersonalRelType.ParentChild,
    abbreviation: 'PACH',
    name: 'parentchild',
    i18nBase: 'categories.personal-rel-type.parentchild',
    icon: 'personal-rel'
  },
  {
    id: PersonalRelType.Sibling,
    abbreviation: 'SIBL',
    name: 'sibling',
    i18nBase: 'categories.personal-rel-type.sibling',
    icon: 'personal-rel'
  },
  {
    id: PersonalRelType.Custom,
    abbreviation: 'CSTM',
    name: 'custom',
    i18nBase: 'categories.personal-rel-type.custom',
    icon: 'personal-rel'
  },
]
