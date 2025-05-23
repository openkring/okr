import { CategoryModel, RelationshipState } from '@bk2/shared/models';

export type RelationshipStateCategory = CategoryModel;

export const RelationshipStates: RelationshipStateCategory[] = [
  {
    id: RelationshipState.Applied,
    abbreviation: 'APLD',
    name: 'applied',
    i18nBase: 'ownership.state.applied',
    icon: 'login_enter'
  },{
    id: RelationshipState.Active,
    abbreviation: 'ACT',
    name: 'active',
    i18nBase: 'ownership.state.active',
    icon: 'checkmark-circle'
  }
]
