import { Pipe, PipeTransform } from '@angular/core';
import { prettyFormatDate } from '@bk2/shared/util';

@Pipe({
  name: 'prettyDate',
})
export class PrettyDatePipe implements PipeTransform {

  transform(storeDate: string | undefined, showYear = true): string {
    return  prettyFormatDate(storeDate, showYear);
  }
}
