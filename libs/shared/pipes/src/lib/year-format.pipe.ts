import { Pipe, PipeTransform } from '@angular/core';
import { DateFormat, convertDateFormatToString, warn } from '@bk2/shared/util';

@Pipe({
  name: 'yearFormat',
})
export class YearFormatPipe implements PipeTransform {

  transform(storeDate: string | undefined): string {
    let _fromFormat = DateFormat.StoreDate;
    if (storeDate === undefined) return '';
    switch (storeDate.length) {
      case 0: return '';
      case 4: _fromFormat = DateFormat.Year; break;
      case 8: _fromFormat = DateFormat.StoreDate; break;
      case 14: _fromFormat = DateFormat.StoreDateTime; break;
      default: 
        warn(`YearFormatPipe: invalid store date format: ${storeDate}`);
        return '';
    }
      return convertDateFormatToString(storeDate, _fromFormat, DateFormat.Year, false);
  }
}
