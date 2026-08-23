import { Pipe, PipeTransform } from '@angular/core';
import { getWeekdayI18nKey, prettyFormatDate, prettyFormatDateTime } from '@okr/shared-util-core';

@Pipe({
  name: 'prettyDate',
  standalone: true
})
export class PrettyDatePipe implements PipeTransform {

  transform(storeDate: string | undefined, showYear = true): string {
    return  prettyFormatDate(storeDate, showYear);
  }
}


/**
 * Renders a StoreDateTime (yyyyMMddHHmmss) as '5.9.2026 14:30'. A legacy 8-char StoreDate
 * degrades to the date alone — see prettyFormatDateTime.
 */
@Pipe({
  name: 'prettyDateTime',
  standalone: true
})
export class PrettyDateTimePipe implements PipeTransform {

  transform(storeDateTime: string | undefined, showYear = true): string {
    return prettyFormatDateTime(storeDateTime, showYear);
  }
}


@Pipe({
  name: 'weekday',
  standalone: true
})
export class WeekdayPipe implements PipeTransform {

  transform(storeDate: string | undefined, shortWeekday = true): string {
    if (!storeDate) return '';
    return getWeekdayI18nKey(storeDate, shortWeekday);
  }
}