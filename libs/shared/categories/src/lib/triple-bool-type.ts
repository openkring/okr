import { CategoryModel, TripleBoolType } from '@bk2/shared/models';

export type TripleBoolCategory = CategoryModel;

export const TripleBoolTypes: TripleBoolCategory[] = [
    {
        id: TripleBoolType.True,
        abbreviation: 'TRUE',
        name: 'true',
        i18nBase: 'categories.triple-bool.true',
        icon: 'add-circle'
    },
    {
        id: TripleBoolType.False,
        abbreviation: 'FALSE',
        name: 'false',
        i18nBase: 'categories.triple-bool.false',
        icon: 'remove-circle'
    },
    {
        id: TripleBoolType.Both,
        abbreviation: 'BOTH',
        name: 'both',
        i18nBase: 'categories.triple-bool.both',
        icon: 'radio-button-on'
    }
]
