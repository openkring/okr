import { CalEventModel } from '@okr/shared-models';

// ponytail: same hardcoded zone as buildICS in apps/functions/src/calendar/index.ts.
const TZID = 'Europe/Zurich';

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * StoreDate (+ StoreTime + minutes) → `yyyyMMdd` or `yyyyMMddTHHmmss`, pure wall-clock arithmetic:
 * local Date constructor, local getters (see the calendar skill — never getUTC* here).
 */
function wallClock(storeDate: string, storeTime?: string, plusMinutes = 0, plusDays = 0): string {
  const y = parseInt(storeDate.substring(0, 4), 10);
  const m = parseInt(storeDate.substring(4, 6), 10);
  const d = parseInt(storeDate.substring(6, 8), 10);
  if (storeTime === undefined) {
    const dt = new Date(y, m - 1, d + plusDays);
    return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}`;
  }
  const [hh, mm] = storeTime.split(':').map(v => parseInt(v, 10));
  const dt = new Date(y, m - 1, d, hh || 0, (mm || 0) + plusMinutes);
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
}

/**
 * "Add event" link for Google Calendar — no file involved; on Android it opens the Google
 * Calendar app with the event pre-filled. Times are local wall-clock values labelled with `ctz`
 * (no `Z`, same contract as the ICS export); a full-day end is exclusive like ICS `DTEND`.
 * Returns undefined when the event has no valid start date.
 */
export function buildGoogleCalendarUrl(calevent: CalEventModel): string | undefined {
  const start = calevent.startDate ?? '';
  if (!/^\d{8}$/.test(start)) return undefined;

  const fullDay = calevent.fullDay === true || !/^\d{1,2}:\d{2}$/.test(calevent.startTime ?? '');
  let dates: string;
  if (fullDay) {
    const last = /^\d{8}$/.test(calevent.endDate ?? '') ? calevent.endDate : start;
    dates = `${start}/${wallClock(last, undefined, 0, 1)}`;
  } else {
    const minutes = calevent.durationMinutes > 0 ? calevent.durationMinutes : 60;
    dates = `${wallClock(start, calevent.startTime)}/${wallClock(start, calevent.startTime, minutes)}`;
  }

  const params = new URLSearchParams({ action: 'TEMPLATE', text: calevent.name ?? '', dates, ctz: TZID });
  if (calevent.description) params.set('details', calevent.description);
  const location = (calevent.locationKey ?? '').split('@')[0];   // 'name@key'
  if (location) params.set('location', location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
