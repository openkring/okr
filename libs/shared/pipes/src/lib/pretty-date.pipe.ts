import { Pipe, PipeTransform } from '@angular/core';
import { getWeekdayI18nKey, prettyFormatDate } from '@bk2/shared-util-core';

@Pipe({
  name: 'prettyDate',
  standalone: true
})
export class PrettyDatePipe implements PipeTransform {

  transform(storeDate: string | undefined, showYear = true): string {
    return  prettyFormatDate(storeDate, showYear);
  }
}


@Pipe({
  name: 'weekday',
  standalone: true
})
export class WeekdayPipe implements PipeTransform {

  transform(storeDate: string | undefined, shortWeekday = true): string {
    if (!storeDate) return '';
    return '@' + getWeekdayI18nKey(storeDate, shortWeekday);
  }
}