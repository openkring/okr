import { Pipe, PipeTransform } from '@angular/core';
import { die } from './log.util';

export enum AhvFormat {
  Electronic,     // no special chars, only 13 digits: 7561234123412
  Friendly,       // 756.1234.1234.12
}

export function ahvn2string(ahvn13value: number | string): string {
    if (!ahvn13value) {
        console.warn(`ahv.util.ahvn2string(${ahvn13value}) is not a valid ahv number (empty or null).`);
        return '';
    }
    const _ahvstr = ahvn13value.toString();

    // Remove all non-digit characters from the string
    const _digits = _ahvstr.replace(/\D/g, '');
    if (_digits.length !== 13) {
        console.warn(`ahv.util.ahvn2string(${_digits}) must contain 13 digits.`);
        return '';
    }

    // Split the string into groups of 3, 4, 4, and 2 digits
    const _parts = [
        _digits.substring(0, 3),
        _digits.substring(3, 7),
        _digits.substring(7, 11),
        _digits.substring(11)
    ];

    // Join the groups with dots and return the result
    return _parts.join('.');
}

export function checkAhv(ahvn13value: number | string): boolean {
  if (!ahvn13value) {
    console.warn(`ahv.util.checkAhv(${ahvn13value}) is not a valid ahv number (empty or null).`);
    return false;
  }
  const _ahvstr = ahvn13value.toString();
  // Remove all non-digit characters from the string
  const _ahvn13value = _ahvstr.replace(/\D/g, '');

  if (_ahvn13value.length !== 13) {
      console.warn(`ahv.util.checkAhv(${_ahvn13value}) must contain 13 digits.`);
      return false;
  }
  if (!_ahvn13value.startsWith('756')) {
    console.warn(`ahv.util.checkAhv(${_ahvn13value}) must start with Swiss country code 756.`);
    return false;
  }
  const _checksum = computeAhvn13checkDigit(_ahvn13value);
  if(_checksum === parseInt(_ahvn13value.substring(12, 13))) {
    return true;
  } else {
    console.warn(`ahv.util.checkAhv(${_ahvn13value}) has invalid checksum.`);
    return false; 
  }
}

export function computeAhvn13checkDigit(ahvn13str: string): number {
    // EAN13: remove non-digits, remove last character, reverse the order of the string
    const _chars = ahvn13str.replace(/\D/g, '').split('').slice(0, 12).reverse();

    // EAN13: first*3 + second + third*3 + fourth etc.
    let _crosssum = 0;
    for (let i = 0; i < _chars.length; i++) {
        if (0 == i % 2) { // even
            _crosssum += parseInt(_chars[i]) * 3;
        } else { // odd
            _crosssum += parseInt(_chars[i]);
        }
    }

    // EAN13: checkdigit is the difference of crosssum to the next multiple of 10
    return (10 - (_crosssum % 10));
}

/**
 * AHV (Swiss social security number) format is 756.nnnn.nnnn.nx (friendly format) or 756nnnnnnnnnx (electronic format).
 * AHV number is saved in the database in electronic format.
 * It is shown on the UI in friendly format with the help of the maskito library.
 * This function converts the inserted string (sourceAhv) into the formatted string (friendly = default, or electronic).
 * e.g. 7561234123412 -> 756.1234.1234.12
 * @param sourceAhv the inserted string
 * @param format the destination format, either Electronic or Friendly, Friendly being the default
 * @returns the formatted ahv number
 */
export function formatAhv(sourceAhv: string, format = AhvFormat.Friendly): string {
  if (sourceAhv === undefined || sourceAhv === null) die(`ahv.util.formatAhv(${sourceAhv}) is not a valid ahv number (null or undefined).`);
  if (sourceAhv.length === 0) return ''; // empty string is ok (ahv is an optional field)
  const _src = sourceAhv.trim().replace(/\./g, '');
  if (_src.length !== 13 && _src.length !== 0) die(`ahv.util.formatAhv(${_src}) is not a valid ahv number (needs to be 13 digits).`);

  if (format === AhvFormat.Electronic) {
    return _src;
  } else {    // Friendly
    return `756.${_src.substring(3,7)}.${_src.substring(7, 11)}.${_src.substring(11,13)}`;
  }
}

@Pipe({ 
    name: 'ahvMask',
  })
  export class AhvMaskPipe implements PipeTransform {
    transform(value: string): string {
      return formatAhv(value);
    }
  }
