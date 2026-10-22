import { CalendarSmallScreenView, CategoryModel } from '@okr/shared-models';

export type CalendarSmallScreenViewCategory = CategoryModel;

export const CalendarSmallScreenViews: CalendarSmallScreenViewCategory[] = [
  {
    id: CalendarSmallScreenView.List,
    abbreviation: 'LIST',
    name: 'list',
    i18nBase: '@shared/categories.calendarSmallScreenView.list',
    icon: 'list'
  },
  {
    id: CalendarSmallScreenView.Calendar,
    abbreviation: 'CAL',
    name: 'calendar',
    i18nBase: '@shared/categories.calendarSmallScreenView.calendar',
    icon: 'calendar'
  }
]
