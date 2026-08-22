import { format } from 'date-fns';

import { TripModel } from '@okr/shared-models';
import { addIndexElement, convertDateFormatToString, DateFormat, getCurrentTime, getTodayStr, parseDate } from '@okr/shared-util-core';

/** Editing of an ended trip is allowed for this long after its endTime. */
export const TRIP_EDIT_WINDOW_MS = 15 * 60 * 1000;
/** Default distance (km) of a new trip. */
export const DEFAULT_TRIP_DISTANCE_KM = 1;
/** Highest distance (km) accepted for a trip. */
export const MAX_TRIP_DISTANCE_KM = 500;

export function newTrip(tenantId: string, type = ''): TripModel {
  const trip = new TripModel(tenantId);
  trip.type = type;
  trip.startDate = getTodayStr(DateFormat.StoreDate);

  trip.startTime = getCurrentTime();
  trip.state = 'draft';
  trip.distance = DEFAULT_TRIP_DISTANCE_KM;
  return trip;
}

/** Whether `now` still lies within `windowMs` after the trip's endTime (true while it is not ended). */
function isWithinEndWindow(trip: TripModel, windowMs: number, now: number): boolean {
  if (!trip.endDate || !trip.endTime) return true;
  // endTime may be 'HH:mm' (DateFormat.Time, what getCurrentTime emits) or legacy 'HHmm';
  // strip non-digits so both yield the 'HHmm' StoreDateTime expects.
  const endHHmm = trip.endTime.replace(/\D/g, '').padStart(4, '0');
  const endDate = parseDate(`${trip.endDate}${endHHmm}00`, DateFormat.StoreDateTime, false);
  if (!endDate) return true;
  return now - endDate.getTime() <= windowMs;
}

/**
 * The single time gate of the Logbuch: a trip stays actionable while it is not yet ended, and for
 * TRIP_EDIT_WINDOW_MS (15 min) after its endTime. Afterwards the kiosk only gets the read-only
 * view — there is no per-action window any more, edit and delete share this one. Admins are exempt.
 *
 * Called once, before the ActionSheet is built (see the `trips` skill, Rule 0).
 */
export function isTripEditable(trip: TripModel, isAdmin = false, now: number = Date.now()): boolean {
  return isAdmin || isWithinEndWindow(trip, TRIP_EDIT_WINDOW_MS, now);
}

/**
 * The trip as a human reads it: 'dd.MM.yyyy HH:mm'. `newTripName` builds a SORTABLE key
 * ('2026081907:24Gig'), which is what lands in trip.name — unreadable the moment it shows up in
 * a task title or a notification, so anything user-facing formats the trip through here.
 */
export function getTripLabel(trip?: TripModel): string {
  if (!trip) return '';
  const date = convertDateFormatToString(trip.startDate, DateFormat.StoreDate, DateFormat.ViewDate, false);
  // startTime is stored as 'HHmm' by the form and as 'HH:mm' by getCurrentTime — formatTripTime
  // normalises the first and passes the second through unchanged.
  const time = formatTripTime(trip.startTime);
  return [date, time].filter(part => part.length > 0).join(' ');
}

export function newTripName(trip: TripModel): string {
  return `${trip.startDate}${trip.startTime}${trip.resource?.name1 ?? ''}`;
}

export function getTripIndex(trip: TripModel): string {
  let index = '';
  index = addIndexElement(index, 'r', trip.resource?.name2 ?? '');
  index = addIndexElement(index, 'd', trip.startDate);
  const participants = (trip.participants ?? [])
    // a keyless participant is a guest: index the keyword in both languages so 'guest'
    // and 'Gast' find the trip, plus the name if one was entered
    .map((p) => [p.key ? '' : 'guest Gast', `${p.name1} ${p.name2}`.trim()].filter(Boolean).join(' '))
    .filter((name) => name.length > 0)
    .join(',');
  index = addIndexElement(index, 'p', participants);
  return index;
}

export function groupTripsByDay(trips: TripModel[]): { date: string; trips: TripModel[] }[] {
  const map = new Map<string, TripModel[]>();
  for (const trip of trips) {
    const key = trip.startDate;
    const bucket = map.get(key) ?? [];
    map.set(key, [...bucket, trip]);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    // trips within a day sort like the days themselves: newest first.
    // startTime is 'HH:mm' or legacy 'HHmm' — strip non-digits so both compare correctly.
    .map(([date, trips]) => ({
      date,
      trips: [...trips].sort((a, b) => startTimeKey(b).localeCompare(startTimeKey(a))),
    }));
}

function startTimeKey(trip: TripModel): string {
  return (trip.startTime ?? '').replace(/\D/g, '').padStart(4, '0');
}

/** A trip is open (boat is out on the water) while its state is 'open' or a variant of it ('open.rev'). */
export function isTripOpen(trip: TripModel): boolean {
  return (trip.state ?? '').startsWith('open');
}

/**
 * The still-open trip that already uses this boat, if any — a boat can only be taken out again
 * once the previous trip is closed. `excludeTripKey` skips the trip being edited itself.
 */
export function findOpenTripForBoat(trips: TripModel[], resourceKey: string, excludeTripKey = ''): TripModel | undefined {
  if (!resourceKey) return undefined;
  return trips.find(trip => isTripOpen(trip) && trip.resource?.key === resourceKey && trip.okey !== excludeTripKey);
}

export function matchesStateFilter(state: string, filter: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'revised') return state.endsWith('.rev');
  if (filter === 'corrected') return state.endsWith('.corr');
  return state === filter;
}

export function compareTripDate(a: TripModel, b: TripModel): number {
  const keyA = a.startDate + a.startTime;
  const keyB = b.startDate + b.startTime;
  return keyA > keyB ? -1 : keyA < keyB ? 1 : 0;
}

export function formatTripTime(time: string): string {
  if (!time || time.length !== 4) return time ?? '';
  return `${time.substring(0, 2)}:${time.substring(2, 4)}`;
}
