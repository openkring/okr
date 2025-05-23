import { CategoryModel, CalEventType } from "@bk2/shared/models";


export type CalEventTypeCategory = CategoryModel;

export const CalEventTypes: CalEventTypeCategory[] = [
  {
    id: CalEventType.GeneralAssembly,
    abbreviation: 'GA',
    name: 'generalAssembly',
    i18nBase: 'calEvent.type.generalAssembly',
    icon: 'assembly'
  },
  {
    id: CalEventType.BoardMeeting,
    abbreviation: 'BRD',
    name: 'boardMeeting',
    i18nBase: 'calEvent.type.boardMeeting',
    icon: 'board'
  },
  {
    id: CalEventType.ProjectMeeting,
    abbreviation: 'PROJ',
    name: 'projectMeeting',
    i18nBase: 'calEvent.type.projectMeeting',
    icon: 'help'
  },
  {
    id: CalEventType.Training,
    abbreviation: 'TRAIN',
    name: 'training',
    i18nBase: 'calEvent.type.training',
    icon: 'training'
  },
  {
    id: CalEventType.Competition,
    abbreviation: 'COMP',
    name: 'competition',
    i18nBase: 'calEvent.type.competition',
    icon: 'competition'
  },
  {
    id: CalEventType.SocialEvent,
    abbreviation: 'SOC',
    name: 'socialEvent',
    i18nBase: 'calEvent.type.socialEvent',
    icon: 'social_drink_wine'
  },
  {
    id: CalEventType.SportEvent,
    abbreviation: 'SPORT',
    name: 'sportEvent',
    i18nBase: 'calEvent.type.sportEvent',
    icon: 'row_2x_side'
  },
  {
    id: CalEventType.BusinessEvent,
    abbreviation: 'BIZ',
    name: 'businessEvent',
    i18nBase: 'calEvent.type.businessEvent',
    icon: 'business'
  },
  {
    id: CalEventType.Todo,
    abbreviation: 'TODO',
    name: 'todo',
    i18nBase: 'calEvent.type.todo',
    icon: 'todo'
  },
  {
    id: CalEventType.Offtime,
    abbreviation: 'OFF',
    name: 'off',
    i18nBase: 'calEvent.type.off',
    icon: 'vacation'
  },
  {
    id: CalEventType.Reservation,
    abbreviation: 'RES',
    name: 'reservation',
    i18nBase: 'calEvent.type.reservation',
    icon: 'reservation'
  },
  {
    id: CalEventType.Retrospective,
    abbreviation: 'RETRO',
    name: 'retro',
    i18nBase: 'calEvent.type.retro',
    icon: 'retro_history'
  },
  {
    id: CalEventType.Daily,
    abbreviation: 'DAILY',
    name: 'daily',
    i18nBase: 'calEvent.type.daily',
    icon: 'meeting_daily'
  },
  {
    id: CalEventType.Planning,
    abbreviation: 'PLAN',
    name: 'planning',
    i18nBase: 'calEvent.type.planning',
    icon: 'planning'
  },
  {
    id: CalEventType.Grooming,
    abbreviation: 'GROOM',
    name: 'grooming',
    i18nBase: 'calEvent.type.grooming',
    icon: 'process'
  },
  {
    id: CalEventType.Sync,
    abbreviation: 'SYNC',
    name: 'sync',
    i18nBase: 'calEvent.type.sync',
    icon: 'sync-circle'
  },
  {
    id: CalEventType.Presentation,
    abbreviation: 'PRES',
    name: 'presentation',
    i18nBase: 'calEvent.type.presentation',
    icon: 'presentation'
  },
  {
    id: CalEventType.Teammeeting,
    abbreviation: 'TM',
    name: 'team',
    i18nBase: 'calEvent.type.team',
    icon: 'people-group'
  },
  {
    id: CalEventType.Other,
    abbreviation: 'OTHR',
    name: 'other',
    i18nBase: 'calEvent.type.other',
    icon: 'other'
  }
]
