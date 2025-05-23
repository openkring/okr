import { CategoryModel, ReservationType } from '@bk2/shared/models';

export type ReservationTypeCategory = CategoryModel;

export const ReservationTypes: ReservationTypeCategory[] = [
    {
        id: ReservationType.Booking,
        abbreviation: 'BOOK',
        name: 'booking',
        i18nBase: 'reservation.type.booking',
        icon: 'calendar_booking'
    },
    {
        id: ReservationType.Registration,
        abbreviation: 'REG',
        name: 'registration',
        i18nBase: 'reservation.type.registration',
        icon: 'registration_form'
    },
    {
        id: ReservationType.Reservation,
        abbreviation: 'RES',
        name: 'reservation',
        i18nBase: 'reservation.type.reservation',
        icon: 'reservation'
    }
]
