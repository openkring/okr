import { CategoryModel, Periodicity } from '@bk2/shared-models';

export type PeriodicityTypeCategory = CategoryModel;

export const PeriodicityTypes: PeriodicityTypeCategory[] = [
    {
        id: Periodicity.Once,
        abbreviation: 'ONCE',
        name: 'once',
        i18nBase: 'calEvent.periodicity.once',
        icon: 'periodicity_once'
    },
    {
      id: Periodicity.Hourly,
      abbreviation: 'HRLY',
      name: 'hourly',
      i18nBase: 'calEvent.periodicity.hourly',
      icon: 'periodicity_hourly'
    },
    {
        id: Periodicity.Daily,
        abbreviation: 'DAILY',
        name: 'daily',
        i18nBase: 'calEvent.periodicity.daily',
        icon: 'periodicity_daily'
    },
    {
        id: Periodicity.Workdays,
        abbreviation: 'WDAY',
        name: 'workdays',
        i18nBase: 'calEvent.periodicity.workdays',
        icon: 'periodicity_workday'
    },
    {
        id: Periodicity.Weekly,
        abbreviation: 'WEEK',
        name: 'weekly',
        i18nBase: 'calEvent.periodicity.weekly',
        icon: 'periodicity_weekly'
    },
    {
        id: Periodicity.Biweekly,
        abbreviation: 'BIWK',
        name: 'biweekly',
        i18nBase: 'calEvent.periodicity.biweekly',
        icon: 'periodicity_biweekly'
    },
    {
        id: Periodicity.Monthly,
        abbreviation: 'MTH',
        name: 'monthly',
        i18nBase: 'calEvent.periodicity.monthly',
        icon: 'periodicity_monthly'
    },
    {
        id: Periodicity.Quarterly,
        abbreviation: 'QTR',
        name: 'quarterly',
        i18nBase: 'calEvent.periodicity.quarterly',
        icon: 'periodicity_quarterly'
    },
    {
        id: Periodicity.Yearly,
        abbreviation: 'YEAR',
        name: 'yearly',
        i18nBase: 'calEvent.periodicity.yearly',
        icon: 'periodicity_yearly'
    },
    {
        id: Periodicity.Other,
        abbreviation: 'OTHR',
        name: 'other',
        i18nBase: 'calEvent.periodicity.other',
        icon: 'other'
    },

]
