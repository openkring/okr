import { CountryCode, PhoneNumber, parsePhoneNumberWithError } from 'libphonenumber-js';
import * as i18nIsoCountries from 'i18n-iso-countries';
import deCountries from 'i18n-iso-countries/langs/de.json';
import enCountries from 'i18n-iso-countries/langs/en.json';
import frCountries from 'i18n-iso-countries/langs/fr.json';
import esCountries from 'i18n-iso-countries/langs/es.json';
import itCountries from 'i18n-iso-countries/langs/it.json';
import { die, warn } from './log.util';

/*
  i18n-iso-countries ships no locale data by default: in the browser build, getName()
  returns undefined for every language until the locale is registered. Register the
  five languages of AvailableLanguages (de, en, fr, es, it) once, at module load —
  each langs/*.json is ~6 KB.
*/
for (const locale of [deCountries, enCountries, frCountries, esCountries, itCountries]) {
  i18nIsoCountries.registerLocale(locale as unknown as i18nIsoCountries.LocaleData);
}

/*
    Country names and phone numbers.

    - ISO 3166-1 alpha-2 country code -> localized country name (i18n-iso-countries)
    - parsing / validating phone numbers (libphonenumber-js)

    The countries-list dependency is gone: its metadata half (capital, currency, languages,
    continent, native name, calling code) had no caller left in the repo, and the one Cloud
    Function that still needs the raw country record keeps its own import. That removed 13 KB
    gzip from every browser bundle — see perf-baselines.md, »Die bindende Kante ist das Barrel«.
*/

/*--------------------------------------------------------------------------
i18n-iso-countries
Country names can be translated based on npm library i18n-iso-countries.
These entries need to match AvailableLanguages (@okr/shared-models), e.g. ['de', 'en', 'fr'] and each
language needs to be registered in function registerCountryLanguages().
i18n for ISO 3166-1 country codes. Source is Wikipedia: Officially assigned code elements

Alpha-2 code is the primary country code used (e.g. se, in lowercase). 
It can be converted into 
- numeric code (752)
- Alpha-3 code (SWE)

https://www.npmjs.com/package/i18n-iso-countries
--------------------------------------------------------------------------*/
export function getCountryName(countryCode: string, languageCode: string): string {
    return i18nIsoCountries.getName(countryCode, languageCode, {select: 'official'}) ?? '';
}

/*--------------------------------------------------------------------------
Phone numbers can be parsed from strings with npm library libphonenumber-js.
https://www.npmjs.com/package/libphonenumber-js
--------------------------------------------------------------------------*/


/**
 * Parses a stringified representation of a phone number and returns the PhoneNumber structure.
 * Returns null if the string could not be parsed correctly.
 * @param stringifiedPhoneNumer 
 * @param defaultCountry 
 * @returns 
 */
export function parsePhoneNumberFromString(stringifiedPhoneNumber: string, defaultCountry: string): PhoneNumber | null {
    return parsePhoneNumberWithError(stringifiedPhoneNumber, defaultCountry as CountryCode);
}

export function isValidPhoneNumber(stringifiedPhoneNumber: string, defaultCountry: string): boolean {
    const _phoneNumber = parsePhoneNumberFromString(stringifiedPhoneNumber, defaultCountry);
    return !_phoneNumber ? false : _phoneNumber.isValid();
}

export function isEqualPhoneNumber(stringifiedPhoneNumber1: string, stringifiedPhoneNumber2: string, defaultCountry: string): boolean {
    const _phoneNumber1 = parsePhoneNumberFromString(stringifiedPhoneNumber1, defaultCountry);
    const _phoneNumber2 = parsePhoneNumberFromString(stringifiedPhoneNumber2, defaultCountry);
    if (!_phoneNumber1 || !_phoneNumber2) die('country.util/isEqualPhoneNumber(' + stringifiedPhoneNumber1 + ', ' + stringifiedPhoneNumber2 + ') -> must contain valid two phone numbers');
    return _phoneNumber1.isEqual(_phoneNumber2);
}

export interface CountryOption {
  code: string;   // ISO 3166-1 alpha-2, uppercase
  name: string;   // localized country name
}

/**
 * Returns all ISO 3166-1 alpha-2 countries with their localized names,
 * sorted alphabetically by their country code (AD, AE, AF, ...). Falls back
 * to the native name when a localized name is not available for the given
 * language.
 */
export function getSortedCountries(languageCode: string): CountryOption[] {
  // getNames() returns every ISO 3166-1 alpha-2 country for the requested language; English is
  // the fallback for a language that lacks an entry. This used to read the countries-list
  // dictionary and fall back to the native name — dropping that removed the last browser use of
  // countries-list (13 KB gzip). See perf-baselines.md, »Die bindende Kante ist das Barrel«.
  const localized = i18nIsoCountries.getNames(languageCode, { select: 'official' });
  const english = i18nIsoCountries.getNames('en', { select: 'official' });
  return Object.keys(english)
    .map((code) => ({ code: code.toUpperCase(), name: localized[code] || english[code] }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

