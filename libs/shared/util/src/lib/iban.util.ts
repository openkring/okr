import * as ibantools from 'ibantools';
import { die } from './log.util';
import { Pipe, PipeTransform } from '@angular/core';

/**
 * see: https://en.wikipedia.org/wiki/International_Bank_Account_Number
 * IBAN = International Bank Account Number , up to 34 chars incl. a country code, 2 check digits, BBAN
 * BBAN = Basic Bank Account Number, max 30 chars, country specific
 * CH IBAN number format is CH93 0076 2011 6238 5295 7 (friendly formatted)
 * We are using ibantools library and support all country specific IBAN numbers.
 */

export enum IbanFormat {
    Electronic,     // no spaces
    Friendly,       // space after 4 chars
}
export enum IbanPart {
    IBAN,
    BBAN,
    CountryCode
}

/**
 * Reads any string and converts it into the electronic format (= internal representation).
 * @param value any string that should be converted into an IBAN number
 * @param allowQrIban, true if QR-IBAN numbers should also be allowed (default)
 * @returns either a valid IBAN in electronic format or an empty string if value is not a valid IBAN number
 */
export function parseIban(value: string | undefined, allowQrIban = true): string {
    if (value === undefined || value === null) {
        console.warn('IbanUtil.parseIban: undefined value; returning empty string');
        return '';
    } 
    if (value.length === 0) return '';    // iban is an optional field

    // since v2.0.0, isValidIBAN is false if there are blanks in the verified iban
    const _iban = ibantools.electronicFormatIBAN(value);
    if (!_iban) {
      console.warn('IbanUtil.parseIban: _iban could not be converted into electronic format; returning empty string');
      return '';
    } 
    if (ibantools.isValidIBAN(_iban, { allowQRIBAN: allowQrIban }) === false) {
      console.warn('IbanUtil.parseIban: <' + _iban + '> is not a valid iban number; returning empty string');
      // show the reason why the IBAN is invalid
      const _errorCodes = ibantools.validateIBAN(value, { allowQRIBAN: allowQrIban }).errorCodes;
      for (const element of _errorCodes) {
        console.log(getIbanValidationError(element) + ' ');
      }
      return '';
    }
    return _iban;
}

export function getIbanValidationError(error: number): string {
  switch(error) {
    case 0: return 'no IBAN provided';
    case 1: return 'no IBAN country';
    case 2: return 'wrong BBAN length';
    case 3: return 'wrong BBAN format';
    case 4: return 'checksum not number';
    case 5: return 'wrong IBAN checksum';
    case 6: return 'wrong Account Bank Branch checksum';
    case 7: return 'QR IBAN not allowed';
    default: return 'unknown error';
  }
}

/**
 * This function takes any string and tries to convert it into either its internal Electronic or the Friendly format.
 * The IBAN number is stored as Electronic format (no spaces) in the database.
 * The IBAN number is shown on the GUI in the Friendly format.
 * @param value  the source string
 * @param ibanFormat  the destination format, either Electronic or Friendly, Friendly being the default
 * @param allowQrIban, true if QR-IBAN numbers should also be allowed (default)
 * @returns the IBAN number in the destination format or an empty string if it is not a valid IBAN number
 */
export function formatIban(value: string | undefined, ibanFormat = IbanFormat.Friendly, allowQrIban = true): string {
    const _iban = parseIban(value, allowQrIban);
    if (_iban.length === 0 || ibanFormat === IbanFormat.Electronic) return _iban;
    // now we are sure that we have a valid IBAN number in Electronic format
    const _friendlyIban = ibantools.friendlyFormatIBAN(_iban);
    if (!_friendlyIban) die('IbanUtil.formatIban: conversion into friendly format failed: ' + _iban); // this should not happen
    return _friendlyIban;
}

/**
 * Extracts a part of the IBAN number from a string that should be an IBAN number
 * @param value the source string
 * @param ibanPart the requested part of the IBAN number:  IBAN, BBAN or Country Code
 * @param allowQrIban, true if QR-IBAN numbers should also be allowed (default)
 * @returns either the part requested or an empty string if no valid IBAN number was given or the IBAn did not contain that part.
 */
export function extractIbanPart(value: string | undefined, ibanPart = IbanPart.CountryCode, allowQrIban = true): string {
    const _iban = parseIban(value, allowQrIban);
    if (_iban.length === 0) return '';
    const _ibanData: ibantools.ExtractIBANResult = ibantools.extractIBAN(_iban);
    switch(ibanPart) {
        case IbanPart.IBAN:         return !_ibanData.iban ?        '' : _ibanData.iban;
        case IbanPart.BBAN:         return !_ibanData.bban ?        '' : _ibanData.bban;
        case IbanPart.CountryCode:  return !_ibanData.countryCode ? '' : _ibanData.countryCode;
    }
}

/**
 * Checks whether a string is representing a valid IBAN number.
 * @param value the string to be checked
 * @param allowQrIban, true if QR-IBAN numbers should also be allowed (default)
 * @returns true if it is a valid IBAN number, false if not.
 */
export function checkIban(value: string, allowQrIban = true): boolean {
    const _iban = parseIban(value, allowQrIban);
    return _iban.length !== 0;
}

/**
 * Formats an IBAN (international bank account number).
 * @param value  the source string
 * @param ibanFormat  the destination format, either Electronic or Friendly, Friendly being the default
 * @param allowQrIban, true if QR-IBAN numbers should also be allowed (default)
 * @returns the IBAN number in the destination format or an empty string if it is not a valid IBAN number
 */
@Pipe({
    name: 'iban'
  })
  export class IbanPipe implements PipeTransform {
  
    transform(value: string, ibanFormat = IbanFormat.Friendly, allowQrIban = true): string {
      return formatIban(value, ibanFormat, allowQrIban);
    }
}
  