import { enforce, only, staticSuite, test } from 'vest';

import { WeatherSection, WeatherVariant } from '@okr/shared-models';

import { baseSectionValidations } from './base-section.validations';

/** The variants a weather section may carry — kept in step with `WeatherVariant`. */
const VARIANTS: WeatherVariant[] = [
  'day-horizontal', 'day-vertical', 'forecast_overview', 'forecast_detail',
  'forecast_table', 'hourly_detail', 'map', 'rain_radar'
];

/** `map` reads its locations with a single Firestore `in` query, which caps out at 30. */
export const MAP_MIN_LOCATIONS = 2;
export const MAP_MAX_LOCATIONS = 10;

export const weatherSectionValidations = staticSuite((model: WeatherSection, field?: string) => {
  if (field) only(field);

  baseSectionValidations(model, field);

  test('variant', 'weatherVariant', () => {
    enforce(VARIANTS.includes(model.properties?.variant)).isTruthy();
  });

  test('locationKey', 'weatherLocationRequired', () => {
    // `map` brings its own list; every other variant needs one location, either its own
    // or the page's. An empty key here is only valid when the page supplies one, which the
    // form pre-fills, so an empty value at this point really is unresolved.
    if (model.properties?.variant === 'map') return;
    enforce(model.properties?.locationKey).isNotEmpty();
  });

  test('locationKeys', 'weatherLocationCount', () => {
    if (model.properties?.variant !== 'map') return;
    const count = model.properties?.locationKeys?.length ?? 0;
    enforce(count >= MAP_MIN_LOCATIONS && count <= MAP_MAX_LOCATIONS).isTruthy();
  });

  test('days', 'weatherDaysRange', () => {
    const days = model.properties?.days;
    if (days === undefined) return;   // optional — the widget defaults to 6
    enforce(days >= 1 && days <= 7).isTruthy();
  });
});
