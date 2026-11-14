import { CategoryModel, StartPage } from '@okr/shared-models';

export type StartPageCategory = CategoryModel;

/** The choices of the profile setting «Startseite». Which of them a tenant offers: `isStartPageAvailable`. */
export const StartPages: StartPageCategory[] = [
  { id: StartPage.Default, abbreviation: 'DEF', name: 'default', i18nBase: '@shared/categories.startPage.default', icon: 'home' },
  { id: StartPage.Welcome, abbreviation: 'WEL', name: 'welcome', i18nBase: '@shared/categories.startPage.welcome', icon: 'home' },
  { id: StartPage.Members, abbreviation: 'MEM', name: 'members', i18nBase: '@shared/categories.startPage.members', icon: 'people' },
  { id: StartPage.MyCalendar, abbreviation: 'CAL', name: 'myCalendar', i18nBase: '@shared/categories.startPage.myCalendar', icon: 'calendar' },
  { id: StartPage.MyTasks, abbreviation: 'TSK', name: 'myTasks', i18nBase: '@shared/categories.startPage.myTasks', icon: 'todo' },
  { id: StartPage.Dashboard, abbreviation: 'DSH', name: 'dashboard', i18nBase: '@shared/categories.startPage.dashboard', icon: 'home' },
  { id: StartPage.Emergency, abbreviation: 'SOS', name: 'emergency', i18nBase: '@shared/categories.startPage.emergency', icon: 'sos' },
  { id: StartPage.Logbuch, abbreviation: 'LOG', name: 'logbuch', i18nBase: '@shared/categories.startPage.logbuch', icon: 'track' },
];
