import {Pipe, PipeTransform } from '@angular/core';
import { ahvn2string } from '@bk2/shared/util';

/**
 * Format a swiss social security number (AHVN13)
 * Takes a string with 13 digits and shows it as
 * 756.1234.5678.97
 * usage:
 *    value | ahvn13
 */
@Pipe({
  name: 'ahvn13',
})
export class Ahvn13Pipe implements PipeTransform {

  transform(ahvn13value: number | string): string {
      return ahvn2string(ahvn13value);
  }
}
