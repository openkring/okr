import { format } from 'date-fns';

import { TripModel } from '@bk2/shared-models';
import { addIndexElement, DateFormat, getCurrentTime, getTodayStr, parseDate } from '@bk2/shared-util-core';

/** Editing of an ended trip is allowed for this long after its endTime. */
export const TRIP_EDIT_WINDOW_MS = 15 * 60 * 1000;

export function newTrip(tenantId: string): TripModel {
  const trip = new TripModel(tenantId);
  trip.startDate = getTodayStr(DateFormat.StoreDate);
  
  trip.startTime = getCurrentTime();
  trip.state = 'draft';
  return trip;
}

/**
 * A trip may be edited while it is not yet ended, or within TRIP_EDIT_WINDOW_MS (15 min) after
 * its endTime. Afterwards it should only be opened read-only.
 */
export function isTripEditable(trip: TripModel, now: number = Date.now()): boolean {
  if (!trip.endDate || !trip.endTime) return true;
  // endTime may be 'HH:mm' (DateFormat.Time, what getCurrentTime emits) or legacy 'HHmm';
  // strip non-digits so both yield the 'HHmm' StoreDateTime expects.
  const endHHmm = trip.endTime.replace(/\D/g, '').padStart(4, '0');
  const endDate = parseDate(`${trip.endDate}${endHHmm}00`, DateFormat.StoreDateTime, false);
  if (!endDate) return true;
  return now - endDate.getTime() <= TRIP_EDIT_WINDOW_MS;
}

export function newTripName(trip: TripModel): string {
  return `${trip.startDate}${trip.startTime}${trip.resource?.name1 ?? ''}`;
}

export function getTripIndex(trip: TripModel): string {
  let index = '';
  index = addIndexElement(index, 'r', trip.resource?.name2 ?? '');
  index = addIndexElement(index, 'd', trip.startDate);
  const participants = (trip.participants ?? [])
    .map((p) => `${p.name1} ${p.name2}`.trim())
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
    .map(([date, trips]) => ({ date, trips }));
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
