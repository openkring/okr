import { CategoryModel, ReservationState } from '@bk2/shared/models';

export type ReservationStateCategory = CategoryModel;

export const ReservationStates: ReservationStateCategory[] = [
  {
    id: ReservationState.Initial,
    abbreviation: 'INIT',
    name: 'initial',
    i18nBase: 'reservation.state.initial',
    icon: 'bulb_idea'
  },
  {
    id: ReservationState.Applied,
    abbreviation: 'APLD',
    name: 'applied',
    i18nBase: 'reservation.state.applied',
    icon: 'login_enter'
  },
  {
    id: ReservationState.Active,
    abbreviation: 'ACTV',
    name: 'active',
    i18nBase: 'reservation.state.active',
    icon: 'thumbs-up'
  },
  {
    id: ReservationState.Completed,
    abbreviation: 'CMPL',
    name: 'completed',
    i18nBase: 'reservation.state.completed',
    icon: 'checkmark'
  },
  {
    id: ReservationState.Cancelled,
    abbreviation: 'CNCL',
    name: 'cancelled',
    i18nBase: 'reservation.state.cancelled',
    icon: 'close_cancel'
  },
  {
    id: ReservationState.Denied,
    abbreviation: 'DENY',
    name: 'denied',
    i18nBase: 'reservation.state.denied',
    icon: 'thumbs-down'
  }
]
