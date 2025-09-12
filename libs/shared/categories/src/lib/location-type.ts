import { CategoryModel, LocationType } from '@bk2/shared-models';

export type LocationTypeCategory = CategoryModel;

export const LocationTypes: LocationTypeCategory[] = [
    {
        id: LocationType.Address,
        abbreviation: 'ADDR',
        name: 'address',
        i18nBase: 'location.type.address',
        icon: 'address'
    },
    {
        id: LocationType.Logbuch,
        abbreviation: 'LOGB',
        name: 'logbuch',
        i18nBase: 'location.type.logbuch',
        icon: 'document-text'
    },
    {
        id: LocationType.Geomarker,
        abbreviation: 'GEO',
        name: 'geomarker',
        i18nBase: 'location.type.geomarker',
        icon: 'location'
    },
    {
        id: LocationType.Other,
        abbreviation: 'OTHR',
        name: 'other',
        i18nBase: 'location.type.other',
        icon: 'navigate'
    }
]
