import { CategoryModel, ReservationReason } from '@bk2/shared/models';

export type ReservationReasonCategory = CategoryModel;

export const ReservationReasons: ReservationReasonCategory[] = [
    {
        id: ReservationReason.SocialEvent,
        abbreviation: 'SOC',
        name: 'socialEvent',
        i18nBase: 'reservation.type.socialEvent',
        icon: 'social_drink_wine'
    },
    {
        id: ReservationReason.Maintenance,
        abbreviation: 'MAINT',
        name: 'maintenance',
        i18nBase: 'reservation.type.maintenance',
        icon: 'cog'
    },
    {
        id: ReservationReason.SportsEvent,
        abbreviation: 'SPORT',
        name: 'sportsEvent',
        i18nBase: 'reservation.type.sportsEvent',
        icon: 'training'
    },
    {
        id: ReservationReason.BusinessEvent,
        abbreviation: 'BIZ',
        name: 'businessEvent',
        i18nBase: 'reservation.type.businessEvent',
        icon: 'business'
    },
    {
        id: ReservationReason.PrivateEvent,
        abbreviation: 'PRIV',
        name: 'privateEvent',
        i18nBase: 'reservation.type.privateEvent',
        icon: 'lock-closed'
    },
    {
        id: ReservationReason.PublicEvent,
        abbreviation: 'PUB',
        name: 'publicEvent',
        i18nBase: 'reservation.type.publicEvent',
        icon: 'lock-open'
    },
    {
        id: ReservationReason.StoragePlace,
        abbreviation: 'STORE',
        name: 'storagePlace',
        i18nBase: 'reservation.type.storagePlace',
        icon: 'location'
    },
    {
      id: ReservationReason.ClubEvent,
      abbreviation: 'CLUB',
      name: 'clubEvent',
      i18nBase: 'reservation.type.clubEvent',
      icon: 'people_group'
  },
  {
    id: ReservationReason.Course,
    abbreviation: 'CRSE',
    name: 'course',
    i18nBase: 'reservation.type.course',
    icon: 'education'
},
    {
      id: ReservationReason.Workshop,
      abbreviation: 'WS',
      name: 'workshop',
      i18nBase: 'reservation.type.workshop',
      icon: 'assembly'
  },
  {
    id: ReservationReason.Meeting,
    abbreviation: 'MEET',
    name: 'meeting',
    i18nBase: 'reservation.type.meeting',
    icon: 'meeting'
},
{
  id: ReservationReason.Party,
  abbreviation: 'PARTY',
  name: 'party',
  i18nBase: 'reservation.type.party',
  icon: 'party'
}
]
