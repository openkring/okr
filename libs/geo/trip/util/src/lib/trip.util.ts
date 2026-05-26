import { format } from 'date-fns';

import { TripModel } from '@bk2/shared-models';
import { addIndexElement, DateFormat, getTodayStr } from '@bk2/shared-util-core';

export function newTrip(tenantId: string): TripModel {
  const trip = new TripModel(tenantId);
  trip.startDate = getTodayStr(DateFormat.StoreDate);
  trip.startTime = format(new Date(), 'HHmm');
  trip.state = 'draft';
  return trip;
}

export function newTripName(trip: TripModel): string {
  return `${trip.startDate}${trip.startTime}${trip.resource?.name1 ?? ''}`;
}

export function getTripIndex(trip: TripModel): string {
  let index = '';
  index = addIndexElement(index, 'b', trip.resource?.name1 ?? '');
  index = addIndexElement(index, 'd', trip.startDate);
  for (const p of trip.participants) {
    index = addIndexElement(index, 'p', `${p.name1} ${p.name2}`.trim());
  }
  return index;
}

export function groupTripsByDay(trips: TripModel[]): { date: string; trips: TripModel[] }[] {
  const map = new Map<string, TripModel[]>();
  for (const trip of trips) {
    const key = trip.startDate;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(trip);
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
