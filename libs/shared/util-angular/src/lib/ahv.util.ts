import { Pipe, PipeTransform } from '@angular/core';

export enum AhvFormat {
  Electronic, // no special chars, only 13 digits: 7561234123412
  Friendly, // 756.1234.1234.12
}

export function ahvn2string(ahvn13value: number | string): string {
  if (!ahvn13value) {
    console.warn(`ahv.util.ahvn2string(${ahvn13value}) is not a valid ahv number (empty or null).`);
    return '';
  }
  const _ahvstr = ahvn13value.toString();

  // Remove all non-digit characters from the string
  const digits = _ahvstr.replace(/\D/g, '');
  if (digits.length !== 13) {
    console.warn(`ahv.util.ahvn2string(${digits}) must contain 13 digits.`);
    return '';
  }

  // Split the string into groups of 3, 4, 4, and 2 digits
  const parts = [digits.substring(0, 3), digits.substring(3, 7), digits.substring(7, 11), digits.substring(11)];

  // Join the groups with dots and return the result
  return parts.join('.');
}

/**
 * Whether the given value is a valid Swiss AHV number: 13 digits, country code 756, EAN13 checksum.
 * A silent predicate — it is the Vest ssn suite's test (ssnValidations), so it runs on every
 * keystroke and must not narrate the user's half-typed number into the console. An invalid value
 * surfaces where it belongs: as the field's validation error.
 */
export function checkAhv(ahvn13value: number | string): boolean {
  if (!ahvn13value) return false;
  const ahvstr = ahvn13value.toString();
  // Remove all non-digit characters from the string
  const ahvn13valueStr = ahvstr.replace(/\D/g, '');

  if (ahvn13valueStr.length !== 13) return false;
  if (!ahvn13valueStr.startsWith('756')) return false;
  return computeAhvn13checkDigit(ahvn13valueStr) === parseInt(ahvn13valueStr.substring(12, 13));
}

export function computeAhvn13checkDigit(ahvn13str: string): number {
  // EAN13: remove non-digits, remove last character, reverse the order of the string
  const chars = ahvn13str.replace(/\D/g, '').split('').slice(0, 12).reverse();

  // EAN13: first*3 + second + third*3 + fourth etc.
  let crosssum = 0;
  for (let i = 0; i < chars.length; i++) {
    if (0 == i % 2) {
      // even
      crosssum += parseInt(chars[i]) * 3;
    } else {
      // odd
      crosssum += parseInt(chars[i]);
    }
  }

  // EAN13: checkdigit is the difference of crosssum to the next multiple of 10
  return 10 - (crosssum % 10);
}

/**
 * AHV (Swiss social security number) format is 756.nnnn.nnnn.nx (friendly format) or 756nnnnnnnnnx (electronic format).
 * AHV number is saved in the database in electronic format.
 * It is shown on the UI in friendly format with the help of the maskito library.
 * This function converts the inserted string (sourceAhv) into the formatted string (friendly = default, or electronic).
 * e.g. 7561234123412 -> 756.1234.1234.12
 *
 * PURELY A FORMATTER — it never throws and never judges the value. Every ssn field binds it
 * inside a `linkedSignal` over live form data, so it sees every intermediate keystroke
 * ('7562', '75629', …). Rejecting those with die() aborted template rendering mid-change-detection,
 * which is why the field silently froze instead of showing its validation error. Incomplete input
 * is handed back verbatim — reformatting it would fight the maskito mask under the user's cursor —
 * and judging it is the Vest suite's job (ssnValidations → checkAhv), which surfaces the error note
 * and keeps the save button hidden until the number is complete and valid.
 *
 * @param sourceAhv the inserted string
 * @param format the destination format, either Electronic or Friendly, Friendly being the default
 * @returns the formatted ahv number, or the input unchanged when it is not (yet) 13 digits long
 */
export function formatAhv(sourceAhv: string | undefined | null, format = AhvFormat.Friendly): string {
  if (!sourceAhv) return ''; // empty/absent is ok (ahv is an optional field)
  const trimmed = sourceAhv.trim();
  const src = trimmed.replace(/\D/g, '');
  if (src.length !== 13) return trimmed; // still typing (or garbage) — hand it back, let Vest flag it

  if (format === AhvFormat.Electronic) {
    return src;
  } else {
    // Friendly
    return `756.${src.substring(3, 7)}.${src.substring(7, 11)}.${src.substring(11, 13)}`;
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
