import { CountryCode, ParseError, PhoneNumber, getCountryCallingCode, isSupportedCountry, isValidPhoneNumber, parsePhoneNumberFromString, parsePhoneNumberWithError } from 'libphonenumber-js';
import { Pipe, PipeTransform } from '@angular/core';
import { die, warn } from './log.util';

/*---------------------------------------- PHONENUMBER -------------------------------------------------------*/
/**
 * We are using a simpler and smaller rewrite of Google Android's libphonenumber:
 * see https://www.npmjs.com/package/libphonenumber-js
 */

export enum PhoneNumberFormat {
    International, // e.g. +1 213 373 4253, +41 79 123 1234
    National,   // e.g. (213) 373-4253, 079 123 1234
    URI, // e.g. tel:+12133734253
}

/**
 * Reads any string and returns a valid PhoneNumber.
 * @param value any string that could be converted into a phone number
 * @param countryCode the country code of the phone number, default is CH
 * @returns either a valid PhoneNumber or undefined if the value is not a valid phone number.
 */
export function parsePhoneNumber(value: string, countryCode = 'CH'): PhoneNumber | undefined {
    try {
        const _phoneNumber = parsePhoneNumberWithError(value, countryCode as CountryCode);
        return _phoneNumber.isValid() ? _phoneNumber : undefined;
      } catch (error) {
        if (error instanceof ParseError) {
          // Not a phone number, non-existent country, etc.
          warn(`phone.util/parsePhoneNumber: ${error.message}`)
        } else {
          console.warn('phone.util/parsePhoneNumber: ', error);
        }
        return undefined;
      }
}

/**
 * Formats a phone number into international format.
 * Takes a string or number and returns it as a string in international format,
 * e.g. +41 79 123 12 34 (if countryCode is CH).
 * That is how it is stored in the database.
 * The number can be inserted as 41791231234, 0791231234, 079 123 1234, ++41 79 123 1234, +41791231234 or in the formatted format.
 * @param phoneNumber the inserted string
 * @param countryCode the country code of the phone number, default is CH
 * @returns the formatted phone number or the same stringified input.
 */
/**
 */
export function formatPhoneNumber(phoneNumber: number | string, countryCode = 'CH'): string {
    if (!phoneNumber) return '';
    if (!isSupportedCountry(countryCode)) die(`phone.util.phonePrettyPrint() -> ERROR: countryCode ${countryCode} is not supported.`);
    const _stringPhone = phoneNumber + '';
    const _phoneNumber = parsePhoneNumberFromString(_stringPhone, countryCode);
    if (!_phoneNumber?.isValid()) {
        warn(`phone.util.phonePrettyPrint() -> ERROR: ${_stringPhone} is not a valid phone number.`);
        return phoneNumber + '';
    }
    return _phoneNumber.formatInternational();
}

/**
 * Returns the international phone number prefix for a given country.
 * @param countryCode the country code of the phone number, default is CH
 * @returns the international phone number prefix for a given country, for CH it is '+41'
 */
export function getCountryPrefix(countryCode = 'CH'): string {
    if (!isSupportedCountry(countryCode)) die(`phone.util.phonePrettyPrint() -> ERROR: countryCode ${countryCode} is not supported.`);
    return getCountryCallingCode(countryCode) as string;
}

/**
 * Checks whether a given string or number is a valid phone number.
 * @param phoneNumber the phone number to check
 * @param countryCode the country code of the phone number, default is CH
 * @returns true if the phone number is valid, false otherwise
 */
export function isPhoneNumberValid(phoneNumber: number | string, countryCode = 'CH'): boolean {
    if (!phoneNumber) {
      warn(`phone.util.isPhoneNumberValid() -> ERROR: phoneNumber is empty.`);
      return false;
    }
    if (!isSupportedCountry(countryCode)) {
      warn(`phone.util.isPhoneNumberValid() -> ERROR: countryCode ${countryCode} is not supported.`);
      return false;
    }
    const _stringifiedPhoneNumber = phoneNumber + '';
    return isValidPhoneNumber(_stringifiedPhoneNumber, countryCode);
}
  
/**
 * This pipe converts an input into the international phone number format.
 * usage:
 *    value | phone
 */
@Pipe({
  name: 'phone',
})
export class PhonePipe implements PipeTransform {
  transform(phoneValue: number | string): string {
      return formatPhoneNumber(phoneValue);
  }
}
