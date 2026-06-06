import { CategoryModel, QuadBoolType } from '@bk2/shared-models';

export type QuadBoolCategory = CategoryModel;

export const QuadBoolTypes: QuadBoolCategory[] = [
    {
        id: QuadBoolType.True,
        abbreviation: 'TRUE',
        name: 'true',
        i18nBase: '@shared/categories.quad-bool.true',
        icon: 'add-circle'
    },
    {
        id: QuadBoolType.False,
        abbreviation: 'FALSE',
        name: 'false',
        i18nBase: '@shared/categories.quad-bool.false',
        icon: 'remove-circle'
    },
    {
        id: QuadBoolType.Both,
        abbreviation: 'BOTH',
        name: 'both',
        i18nBase: '@shared/categories.quad-bool.both',
        icon: 'radio-button-on'
    },
    {
        id: QuadBoolType.None,
        abbreviation: 'NONE',
        name: 'none',
        i18nBase: '@shared/categories.quad-bool.none',
        icon: 'radio-button-off'
    }
]
