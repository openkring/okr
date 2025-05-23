import { CountryCode, PhoneNumber, parsePhoneNumberWithError } from 'libphonenumber-js';
import * as countryDictionary from 'countries-list';
import * as i18nIsoCountries from 'i18n-iso-countries';
import { ICountry } from 'countries-list';
import { die, warn } from '@bk2/shared/util';
 
/*
    This library contains funtions needed to provide internationalization, e.g.
    - conversion of ISO 3166-1 alpha-2 country-code into country name (in different languages)
    - conversion between ISO 3166-1 alpha-2 and alpha-3 country codes
    - ISO 639-1 languages per country
    - capital
    - currency
    - calling code

    all meta data provided by npm library countries-list
    https://preview.npmjs.com/package/countries-list
    is available for all countries. But it only returns country names in native and international (=english) language.

*/

/*--------------------------------------------------------------------------
https://preview.npmjs.com/package/countries-list--------------------------------------------------------------------------*/


const getKeyValue = <T, K extends keyof T>(obj: T, key: K): T[K] => obj[key];

/**
 * Return the name of a continent (in english)
 * @param continentCode the name of the continent in alpha-2 format (e.g. eu for Europe)
 * @returns 
 */
export function getContinentName(continentCode: string): string {
    return getKeyValue(countryDictionary.continents, continentCode as keyof typeof countryDictionary.continents);
}

/**
 * Returns the country flag as Emoji string.
 * @param countryCode in alpha-2 format (e.g. de)
 * @returns 
 */
export function getEmojiFlag(countryCode: string): string {
  return countryDictionary.getEmojiFlag(countryCode.toUpperCase() as countryDictionary.TCountryCode);
}

export function getCountryData(countryCode: string): ICountry {
  return getKeyValue(countryDictionary.countries, countryCode.toUpperCase() as keyof typeof countryDictionary.countries);
}

export function getNativeCountryName(countryCode: string): string {
    return getCountryData(countryCode).native;
}

export function getCallingCode(countryCode: string): string {
    return getCountryData(countryCode).phone[0] + '';
}

export function getContinent(countryCode: string): string {
    return getCountryData(countryCode).continent;
}

export function getCapital(countryCode: string): string {
    return getCountryData(countryCode).capital;
}

export function getCurrency(countryCode: string): string {
    return getCountryData(countryCode).currency[0];
}

export function getLanguages(countryCode: string): string[] {
    return getCountryData(countryCode).languages;
}

/**
 * Returns country flag Emoji string.
 */
 export function getFlagEmojiString(countryCode: string): string {
     return getEmojiFlag(countryCode);
 }
 

/*--------------------------------------------------------------------------
i18n-iso-countries
Country names can be translated based on npm library i18n-iso-countries.
These entries need to match AVAILABLE_LANGS, e.g. ['en', 'de', 'fr'] and each 
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

export function getAlpha3Code(alpha2code: string): string {
    return i18nIsoCountries.alpha2ToAlpha3(alpha2code) ?? '';
}

export function getNumericCode(alpha2code: string): string {
    return i18nIsoCountries.alpha2ToNumeric(alpha2code) ?? '';
}

export function getWikipediaUrl(countryCode: string, languageCode: string): string {
    return `https://${languageCode}.wikipedia.org/wiki/${getCountryName(countryCode, languageCode)}`;
}

/*--------------------------------------------------------------------------
Phone numbers can be parsed from strings with npm library libphonenumber-js.
https://www.npmjs.com/package/libphonenumber-js
--------------------------------------------------------------------------*/

export enum PhoneNumberType {
    Undefined = -1,
    Mobile = 0,
    FixedLine = 1,
    FixedLineOrMobile = 2,
    PremiumRate = 3,
    TollFree = 4,
    SharedCost = 5,
    Voip = 6,
    PersonalNumber = 7,
    Pager = 8,
    Uan = 9,
    Voicemail = 10
}

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


export function getInternationalPhoneNumber(stringifiedPhoneNumber: string, defaultCountry: string): string {
    const _phoneNumber = parsePhoneNumberFromString(stringifiedPhoneNumber, defaultCountry);
    return !_phoneNumber ? '' : _phoneNumber.formatInternational();
}

export function getNationalPhoneNumber(stringifiedPhoneNumber: string, defaultCountry: string): string {
    const _phoneNumber = parsePhoneNumberFromString(stringifiedPhoneNumber, defaultCountry);
    return !_phoneNumber ? '' : _phoneNumber.formatNational();
}

export function getPhoneNumberURI(stringifiedPhoneNumber: string, defaultCountry: string): string {
    const _phoneNumber = parsePhoneNumberFromString(stringifiedPhoneNumber, defaultCountry);
    return !_phoneNumber ? '' : _phoneNumber.getURI();
}

export function getPhoneNumberType(stringifiedPhoneNumber: string, defaultCountry: string): PhoneNumberType {
    const _phoneNumber = parsePhoneNumberFromString(stringifiedPhoneNumber, defaultCountry);
    if (!_phoneNumber) return PhoneNumberType.Undefined;
    switch (_phoneNumber.getType()) {
        case 'MOBILE': return PhoneNumberType.Mobile;
        case 'FIXED_LINE': return PhoneNumberType.FixedLine;
        case 'FIXED_LINE_OR_MOBILE': return PhoneNumberType.FixedLineOrMobile;
        case 'PREMIUM_RATE': return PhoneNumberType.PremiumRate;
        case 'TOLL_FREE': return PhoneNumberType.TollFree;
        case 'SHARED_COST': return PhoneNumberType.SharedCost;
        case 'VOIP': return PhoneNumberType.Voip;
        case 'PERSONAL_NUMBER': return PhoneNumberType.PersonalNumber;
        case 'PAGER': return PhoneNumberType.Pager;
        case 'UAN': return PhoneNumberType.Uan;
        case 'VOICEMAIL': return PhoneNumberType.Voicemail;
        default: 
            warn('internationalization.util/getType(' + stringifiedPhoneNumber + ', ' + defaultCountry + ') -> has invalid type: ' + _phoneNumber.getType());
            return PhoneNumberType.Undefined;
    }
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

