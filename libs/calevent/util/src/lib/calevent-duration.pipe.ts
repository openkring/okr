import { Pipe, PipeTransform } from '@angular/core';

import { CalEventModel } from '@bk2/shared-models';
import { addTime, convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';

@Pipe({
  name: 'calEventDuration',
  standalone: true
})
export class CalEventDurationPipe implements PipeTransform {

  transform(calEvent: CalEventModel): string {
    return formatDateTimeLabel(
      calEvent.startDate,
      calEvent.startTime,
      calEvent.durationMinutes,
    );
  }
}

/**
 * Formats a date/time range into a readable label.
 *
 * Rules:
 *   SD, ST, DM → "SD ST - ET"
 *   SD, ST, DM = 0 → "SD ST"
 *   SD → "SD" (full day event)
 *
 * @param startDate  yyyymmdd (string or number)
 * @param startTime  hhmm (string or number, optional)
 * @param durationMinutes number (optional)
 * @returns          formatted label
 */
export function formatDateTimeLabel(
  startDate?: string | number | null,
  startTime?: string | number | null,
  durationMinutes?: string | number | null,
): string {
  // Normalise to strings and remove undefined/null/empty
  const sd = String(startDate ?? '').trim();
  const st = String(startTime ?? '').trim();
  const dm = String(durationMinutes ?? '').trim();
  const et = addTime(st, 0, Number(dm) || 0);
  
  const hasStartDate = sd && sd.length === 8;
  const hasStartTime = st && st.length === 5;
  const hasEndTime   = et && et.length === 5;

  const sdf = hasStartDate ? convertDateFormatToString(sd, DateFormat.StoreDate, DateFormat.ViewDate, false) : '';

  if (hasStartDate && hasStartTime && hasEndTime) {
    return `${sdf} ${st} - ${et}`;
  }
  if (hasStartDate && hasStartTime && !hasEndTime) {
    return `${sdf} ${st}`;
  }
  if (hasStartDate && !hasStartTime) {
    return sdf;
  }
  return '??';
}