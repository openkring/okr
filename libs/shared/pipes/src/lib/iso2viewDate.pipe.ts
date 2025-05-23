import {Pipe, PipeTransform } from '@angular/core';
import { convertDateFormatToString, DateFormat } from '@bk2/shared/util';

/**
 * Convert a date in IsoFormat to View Date Format
 * usage:
 *    value | iso2viewDateFormat
 */
@Pipe({
  name: 'iso2viewDateFormat',
})
export class Iso2viewDateFormatPipe implements PipeTransform {

  transform(dateStr: string): string {
      return convertDateFormatToString(dateStr, DateFormat.IsoDate, DateFormat.ViewDate, false);
  }
}
