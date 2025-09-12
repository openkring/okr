import { CategoryModel, OwnershipState } from '@bk2/shared-models';

export type OwnershipStateCategory = CategoryModel;

export const OwnershipStates: OwnershipStateCategory[] = [
  {
    id: OwnershipState.Initial,
    abbreviation: 'INIT',
    name: 'initial',
    i18nBase: 'ownership.state.initial',
    icon: 'bulb_idea'
  },
  {
    id: OwnershipState.Planned,
    abbreviation: 'PLND',
    name: 'planned',
    i18nBase: 'ownership.state.planned',
    icon: 'planning'
  },
  {
    id: OwnershipState.Applied,
    abbreviation: 'APLD',
    name: 'applied',
    i18nBase: 'ownership.state.applied',
    icon: 'login_enter'
  },
  {
    id: OwnershipState.Active,
    abbreviation: 'ACTV',
    name: 'active',
    i18nBase: 'ownership.state.active',
    icon: 'active'
  },
  {
    id: OwnershipState.Passive,
    abbreviation: 'PSSV',
    name: 'passive',
    i18nBase: 'ownership.state.completed',
    icon: 'passive'
  },
  {
    id: OwnershipState.Terminated,
    abbreviation: 'DENY',
    name: 'denied',
    i18nBase: 'ownership.state.denied',
    icon: 'stop-circle'
  },
  {
    id: OwnershipState.Cancelled,
    abbreviation: 'CNCL',
    name: 'cancelled',
    i18nBase: 'ownership.state.cancelled',
    icon: 'close_cancel'
  }
]
