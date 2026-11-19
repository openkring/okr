/**
 * A city/postal-code entry usable for address lookup, independent of country.
 * Structurally compatible with SwissCity (see swisscities.model.ts); the existing
 * swissCities array is assignable to City[].
 */
export interface City {
  zipCode: string;
  name: string;
  stateCode: string;
  countryCode: string;
}

/** Countries for which a city/zip dataset exists (CH in-bundle, rest lazy-fetched). */
export const SUPPORTED_CITY_COUNTRIES = ['CH', 'DE', 'AT', 'IT', 'FR', 'US', 'GB'] as const;
export type SupportedCityCountry = (typeof SUPPORTED_CITY_COUNTRIES)[number];
