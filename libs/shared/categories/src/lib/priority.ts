import { CategoryModel, Priority } from '@bk2/shared-models';

export type PriorityCategory = CategoryModel;

export const Priorities: PriorityCategory[] = [
  {
    id: Priority.Low,
    abbreviation: 'P3',
    name: 'low',
    i18nBase: 'categories.priority.low',
    icon: 'chevron-down'
  },
  {
    id: Priority.Medium,
    abbreviation: 'P2',
    name: 'medium',
    i18nBase: 'categories.priority.medium',
    icon: 'chevron-expand'
  },
  {
    id: Priority.High,
    abbreviation: 'P1',
    name: 'high',
    i18nBase: 'categories.priority.high',
    icon: 'chevron-up'
  }
]
