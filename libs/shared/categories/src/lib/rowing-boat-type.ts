import { CategoryModel, RowingBoatType } from "@bk2/shared/models";

export type RowingBoatTypeCategory = CategoryModel;

export const RowingBoatTypes: RowingBoatTypeCategory[] = [
    {
        id: RowingBoatType.b1x,
        abbreviation: '1x',
        name: 'b1x',
        i18nBase: 'resource.boat.type.b1x',
        icon: 'b1x'
    },
    {
        id: RowingBoatType.b2m,
        abbreviation: '2-',
        name: 'b2m',
        i18nBase: 'resource.boat.type.b2m',
        icon: 'b2-'
    },
    {
        id: RowingBoatType.b2x,
        abbreviation: '2x',
        name: 'b2x',
        i18nBase: 'resource.boat.type.b2x',
        icon: 'b2x'
    },
    {
        id: RowingBoatType.b2p,
        abbreviation: '2+',
        name: 'b2p',
        i18nBase: 'resource.boat.type.b2p',
        icon: 'b2+'
    },
    {
        id: RowingBoatType.b2mx,
        abbreviation: '2-/2x',
        name: 'b2mx',
        i18nBase: 'resource.boat.type.b2mx',
        icon: 'b2-x'
    },
    {
        id: RowingBoatType.b3x,
        abbreviation: '3x',
        name: 'b3x',
        i18nBase: 'resource.boat.type.b3x',
        icon: 'b3x'
    },
    {
        id: RowingBoatType.b4m,
        abbreviation: '4-',
        name: 'b4m',
        i18nBase: 'resource.boat.type.b4m',
        icon: 'b4-'
    },
    {
        id: RowingBoatType.b4x,
        abbreviation: '4x',
        name: 'b4x',
        i18nBase: 'resource.boat.type.b4x',
        icon: 'b4x'
    },
    {
        id: RowingBoatType.b5x,
        abbreviation: '5x',
        name: 'b5x',
        i18nBase: 'resource.boat.type.b5x',
        icon: 'b5x'
    },
    {
        id: RowingBoatType.b8p,
        abbreviation: '8+',
        name: 'b8p',
        i18nBase: 'resource.boat.type.b8p',
        icon: 'b8+'
    },

]
