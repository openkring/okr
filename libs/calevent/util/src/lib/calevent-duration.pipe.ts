import { Pipe, PipeTransform } from '@angular/core';
import { CalEventModel } from '@bk2/shared/models';
import { convertDateFormatToString, DateFormat } from '@bk2/shared/util-core';

@Pipe({
  name: 'calEventDuration',
})
export class CalEventDurationPipe implements PipeTransform {

  transform(calEvent: CalEventModel): string {
    let _fromDateTime = '';
    if (calEvent.startDate && calEvent.startDate.length > 0) {
      _fromDateTime = convertDateFormatToString(calEvent.startDate, DateFormat.StoreDate, DateFormat.ViewDate, false);
    }
    if (calEvent.startTime && calEvent.startTime.length > 0) {
      _fromDateTime =  _fromDateTime.length > 0 ? _fromDateTime + ' ' + calEvent.startTime : calEvent.startTime;
    }

    let _toDateTime = '';
    if (calEvent.endDate && calEvent.endDate.length > 0 && !calEvent.startDate.startsWith(calEvent.endDate)) {
      _toDateTime = convertDateFormatToString(calEvent.endDate, DateFormat.StoreDate, DateFormat.ViewDate, false);
    }
    if (calEvent.endTime && calEvent.endTime.length > 0) {
      _toDateTime = _toDateTime.length > 0 ? _toDateTime + ' ' + calEvent.endTime : calEvent.endTime;
    }
    return _fromDateTime + ' - ' + _toDateTime;
  }
}