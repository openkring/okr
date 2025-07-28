import { CategoryModel, RowingBoatUsage } from "@bk2/shared/models";

export type RowingBoatUsageCategory = CategoryModel;

export const RowingBoatUsages: RowingBoatUsageCategory[] = [
  {
    id: RowingBoatUsage.Kandidierende,
    abbreviation: 'Kand',
    name: 'kandidierende',
    i18nBase: 'resource.boat.usage.kandidierende',
    icon: 'rocket-startup'
  },
  {
    id: RowingBoatUsage.Breitensport,
    abbreviation: 'BSP',
    name: 'breitensport',
    i18nBase: 'resource.boat.usage.breitensport',
    icon: 'heart'
  },
  {
    id: RowingBoatUsage.Routinierte,
    abbreviation: 'ROUT',
    name: 'routinierte',
    i18nBase: 'resource.boat.usage.routinierte',
    icon: 'star'
  },
  {
    id: RowingBoatUsage.Leistungssport,
    abbreviation: 'LSP',
    name: 'leistungssport',
    i18nBase: 'resource.boat.usage.leistungssport',
    icon: 'medal'
  },
  {
    id: RowingBoatUsage.Private,
    abbreviation: 'PRIV',
    name: 'private',
    i18nBase: 'resource.boat.usage.private',
    icon: 'lock-closed'
  }
]
