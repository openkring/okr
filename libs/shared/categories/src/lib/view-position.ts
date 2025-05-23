import { CategoryModel, HorizontalPosition, VerticalPosition, ViewPosition } from '@bk2/shared/models';

export type ViewPositionCategory = CategoryModel;

export const ViewPositions: ViewPositionCategory[] = [
    {
        id: ViewPosition.None,
        abbreviation: 'NONE',
        name: 'none',
        i18nBase: 'categories.view-position.none',
        icon: 'close_cancel'
    },
    {
        id: ViewPosition.Top,
        abbreviation: 'TOP',
        name: 'top',
        i18nBase: 'categories.view-position.top',
        icon: 'chevron-up'
    },
    {
        id: ViewPosition.Bottom,
        abbreviation: 'BOTTOM',
        name: 'bottom',
        i18nBase: 'categories.view-position.bottom',
        icon: 'chevron-down'
    },
    {
        id: ViewPosition.Left,
        abbreviation: 'LEFT',
        name: 'left',
        i18nBase: 'categories.view-position.left',
        icon: 'chevron-back'
    },
    {
        id: ViewPosition.Right,
        abbreviation: 'RIGHT',
        name: 'right',
        i18nBase: 'categories.view-position.right',
        icon: 'chevron-forward'
    }
]

export type HorizontalPositionCategory = CategoryModel;

export const HorizontalPositions: HorizontalPositionCategory[] = [
  {
      id: HorizontalPosition.None,
      abbreviation: 'NONE',
      name: 'none',
      i18nBase: 'categories.view-position.none',
      icon: 'close_cancel'
  },
  {
      id: HorizontalPosition.Left,
      abbreviation: 'LEFT',
      name: 'left',
      i18nBase: 'categories.view-position.left',
      icon: 'chevron-back'
  },
  {
      id: HorizontalPosition.Right,
      abbreviation: 'RIGHT',
      name: 'right',
      i18nBase: 'categories.view-position.right',
      icon: 'chevron-forward'
  }
]

export type VerticalPositionCategory = CategoryModel;

export const VerticalPositions: VerticalPositionCategory[] = [
  {
      id: VerticalPosition.None,
      abbreviation: 'NONE',
      name: 'none',
      i18nBase: 'categories.view-position.none',
      icon: 'close_cancel'
  },
  {
      id: VerticalPosition.Top,
      abbreviation: 'TOP',
      name: 'top',
      i18nBase: 'categories.view-position.top',
      icon: 'chevron-up'
  },
  {
      id: VerticalPosition.Bottom,
      abbreviation: 'BOTTOM',
      name: 'bottom',
      i18nBase: 'categories.view-position.bottom',
      icon: 'chevron-down'
  }
]