import { CategoryModel, WeatherCondition } from '@bk2/shared/models';

export type WeatherConditionCategory = CategoryModel;

export const WeatherConditions: WeatherConditionCategory[] = [
    {
        id: WeatherCondition.Thunderstorm,
        abbreviation: 'THNDR',
        name: 'thunderstorm',
        i18nBase: 'weather.condition.thunderstorm',
        icon: 'cloud-bolt-regular'
    },
    {
        id: WeatherCondition.Drizzle,
        abbreviation: 'DRZL',
        name: 'drizzle',
        i18nBase: 'weather.condition.drizzle',
        icon: 'cloud-drizzle-regular'
    },
    {
        id: WeatherCondition.Rain,
        abbreviation: 'RAIN',
        name: 'rain',
        i18nBase: 'weather.condition.rain',
        icon: 'cloud-sun-rain-regular'
    },
    {
        id: WeatherCondition.Hail,
        abbreviation: 'HAIL',
        name: 'hail',
        i18nBase: 'weather.condition.hail',
        icon: 'cloud-hail-regular'
    },
    {
        id: WeatherCondition.Shower,
        abbreviation: 'SHWR',
        name: 'shower',
        i18nBase: 'weather.condition.shower',
        icon: 'cloud-showers-regular'
    },
    {
        id: WeatherCondition.Snow,
        abbreviation: 'SNOW',
        name: 'snow',
        i18nBase: 'weather.condition.snow',
        icon: 'snowflakes-regular'
    },
    {
        id: WeatherCondition.Fog,
        abbreviation: 'FOG',
        name: 'fog',
        i18nBase: 'weather.condition.fog',
        icon: 'cloud-fog-regular'
    },
    {
        id: WeatherCondition.Clear,
        abbreviation: 'CLEAR',
        name: 'clear',
        i18nBase: 'weather.condition.clear',
        icon: 'sun-bright-regular'
    },
    {
        id: WeatherCondition.FewClouds,
        abbreviation: 'CLDS',
        name: 'fewClouds',
        i18nBase: 'weather.condition.fewClouds',
        icon: 'sun-cloud-regular'
    },
    {
        id: WeatherCondition.ScatteredClouds,
        abbreviation: 'SCTR',
        name: 'scatteredClouds',
        i18nBase: 'weather.condition.scatteredClouds',
        icon: 'cloud-regular'
    },
    {
        id: WeatherCondition.OvercastClouds,
        abbreviation: 'OCST',
        name: 'overcastClouds',
        i18nBase: 'weather.condition.overcastClouds',
        icon: 'clouds-regular'
    }
];