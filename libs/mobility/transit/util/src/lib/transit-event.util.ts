import { zurichWallClockMs } from '@okr/mobility-tracker-util';

/** Arrive this long before an event starts (spec 1.131 §8 q3: fixed, no per-event field). */
export const ARRIVAL_BUFFER_MINUTES = 10;
/** A full-day event has no start time; the search aims at this one. */
export const FULL_DAY_ARRIVAL = '09:00';

export interface EventTransitTimes {
  /** latest arrival (ISO instant) */
  at: string;
  /** earliest departure of the way back (ISO instant); '' for full-day events, whose end is unknown */
  returnAt: string;
}

/**
 * The search times of an event (spec 1.131 §4.2). Its dates are StoreDate/StoreTime on the Swiss
 * wall clock (`calendar` skill), so they are read in Europe/Zurich whatever the device's zone.
 * Undefined when the event is over (`now` after its end) or its date is unreadable.
 */
export function eventTransitTimes(
  e: { startDate: string; startTime: string; fullDay: boolean; durationMinutes: number; endDate?: string },
  now = Date.now(),
): EventTransitTimes | undefined {
  if (!/^\d{8}$/.test(e.startDate ?? '')) return undefined;
  if (e.fullDay || !e.startTime) {
    const lastDay = /^\d{8}$/.test(e.endDate ?? '') && (e.endDate ?? '') > e.startDate ? (e.endDate as string) : e.startDate;
    if (zurichWallClockMs(lastDay, '23:59') < now) return undefined;
    return { at: new Date(zurichWallClockMs(e.startDate, FULL_DAY_ARRIVAL)).toISOString(), returnAt: '' };
  }
  const start = zurichWallClockMs(e.startDate, e.startTime);
  if (!Number.isFinite(start)) return undefined;
  const end = start + Math.max(0, e.durationMinutes || 0) * 60_000;
  if (end < now) return undefined;
  return {
    at: new Date(start - ARRIVAL_BUFFER_MINUTES * 60_000).toISOString(),
    returnAt: new Date(end).toISOString(),
  };
}
