import { CategoryModel, Importance } from '@bk2/shared-models';

export type ImportanceCategory = CategoryModel;

export const Importances: ImportanceCategory[] = [
  {
    id: Importance.Low,
    abbreviation: 'I3',
    name: 'low',
    i18nBase: 'categories.importance.low',
    icon: 'chevron-down'
  },
  {
    id: Importance.Medium,
    abbreviation: 'I2',
    name: 'medium',
    i18nBase: 'categories.importance.medium',
    icon: 'chevron-expand'
  },
  {
    id: Importance.High,
    abbreviation: 'I1',
    name: 'high',
    i18nBase: 'categories.importance.high',
    icon: 'chevron-up'
  }
]
