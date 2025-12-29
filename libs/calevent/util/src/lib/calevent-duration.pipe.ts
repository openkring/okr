import { Pipe, PipeTransform } from '@angular/core';

import { CalEventModel } from '@bk2/shared-models';
import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';

@Pipe({
  name: 'calEventDuration',
  standalone: true
})
export class CalEventDurationPipe implements PipeTransform {

  transform(calEvent: CalEventModel): string {
    return formatDateTimeLabel(
      calEvent.startDate,
      calEvent.startTime,
      calEvent.endDate,
      calEvent.endTime
    );
  }
}

/**
 * Formats a date/time range into a readable label.
 *
 * Rules:
 *   SD, ST, ED (>SD), ET → "SD ST - ED ET"
 *   SD, ST, ED (=SD), ET (>ST) → "SD ST - ET"
 *   SD, ST → "SD ST"
 *   ED, ET → "ED ET"
 *   SD → "SD"
 *   ED → "ED"
 *
 * @param startDate  yyyymmdd (string or number)
 * @param startTime  hhmm (string or number, optional)
 * @param endDate    yyyymmdd (string or number, optional)
 * @param endTime    hhmm (string or number, optional)
 * @returns          formatted label
 */
export function formatDateTimeLabel(
  startDate?: string | number | null,
  startTime?: string | number | null,
  endDate?: string | number | null,
  endTime?: string | number | null
): string {
  // Normalise to strings and remove undefined/null/empty
  const sd = String(startDate ?? '').trim();
  const st = String(startTime ?? '').trim();
  const ed = String(endDate ?? '').trim();
  const et = String(endTime ?? '').trim();

  const hasStartDate = sd && sd.length === 8;
  const hasStartTime = st && st.length === 5;
  const hasEndDate   = ed && ed.length === 8;
  const hasEndTime   = et && et.length === 5;

  const sdf = hasStartDate ? convertDateFormatToString(sd, DateFormat.StoreDate, DateFormat.ViewDate, false) : '';
  const edf = hasEndDate ? convertDateFormatToString(ed, DateFormat.StoreDate, DateFormat.ViewDate, false) : '';

  // Only end date/time provided → show just that
  if (!hasStartDate && (hasEndDate || hasEndTime)) {
    if (hasEndDate && hasEndTime) return `${ed} ${et}`;
    if (hasEndDate) return ed;
    return et; // only end time (should never happen, but safe)
  }

  // Both start and end dates present → we have a real range
  if (hasStartDate && hasEndDate) {
    const sameDay = sd === ed;

    if (sameDay) {
      return (hasStartTime && hasEndTime && et > st) ? `${sdf} ${st} - ${et}` : `${sdf} ${st}`;
    } else {
      return (hasStartTime && hasEndTime) ? `${sdf} ${st} - ${edf} ${et}` : `${sdf} - ${edf}`;
    }
  }

  // Only start date/time provided
  if (hasStartDate && !hasEndDate) {
    if (hasEndTime) {
      return hasStartTime ? `${sdf} ${st} - ${et}` : `${sdf} ${et}`;
    }
    return hasStartTime ? `${sdf} ${st}` : sdf;
  }

  // Fallback (should never reach here)
  return '';
}