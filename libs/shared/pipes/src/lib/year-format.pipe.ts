import { Pipe, PipeTransform } from '@angular/core';
import { DateFormat, convertDateFormatToString, warn } from '@bk2/shared-util-core';

@Pipe({
  name: 'yearFormat',
  standalone: true,
})
export class YearFormatPipe implements PipeTransform {
  transform(storeDate: string | undefined): string {
    let fromFormat = DateFormat.StoreDate;
    if (storeDate === undefined) return '';
    switch (storeDate.length) {
      case 0:
        return '';
      case 4:
        fromFormat = DateFormat.Year;
        break;
      case 8:
        fromFormat = DateFormat.StoreDate;
        break;
      case 14:
        fromFormat = DateFormat.StoreDateTime;
        break;
      default:
        warn(`YearFormatPipe: invalid store date format: ${storeDate}`);
        return '';
    }
    return convertDateFormatToString(storeDate, fromFormat, DateFormat.Year, false);
  }
}
