import type { TransitDeparture, TransitSituation } from './transit-departure.model';

/** Walking speed behind the default walking time: 80 m a minute, about 4.8 km/h (spec 1.130 §4). */
const WALK_M_PER_MINUTE = 80;
/** After this long without a fresh answer the board greys its rows (spec 1.130 §6.3). */
export const DEPARTURES_STALE_MS = 5 * 60_000;

/** Minutes on foot for a straight-line distance; 0 for none. */
export function walkMinutes(distanceM: number | undefined): number {
  const d = Number(distanceM);
  return Number.isFinite(d) && d > 0 ? Math.round(d / WALK_M_PER_MINUTE) : 0;
}

/** When the departure actually leaves, as epoch ms: the realtime estimate if there is one. */
export function departureMs(d: TransitDeparture): number {
  return Date.parse(d.estimatedAt || d.plannedAt);
}

/** Realtime delay in whole minutes (negative = early); 0 without realtime data. */
export function delayMinutes(d: TransitDeparture): number {
  if (!d.estimatedAt) return 0;
  const delay = Math.round((Date.parse(d.estimatedAt) - Date.parse(d.plannedAt)) / 60_000);
  return Number.isFinite(delay) ? delay : 0;
}

/** Whole minutes until the departure leaves, never negative. */
export function minutesUntil(d: TransitDeparture, now: number): number {
  return Math.max(0, Math.floor((departureMs(d) - now) / 60_000));
}

/**
 * The departures still worth showing: those you can reach on foot (leaving at least `walk` minutes from
 * `now`), in the order they actually leave, at most `limit`. A cancelled one is kept by its timetabled time,
 * so «fällt aus» stays visible until it would have left.
 */
export function visibleDepartures(all: TransitDeparture[], now: number, walk: number, limit: number): TransitDeparture[] {
  const earliest = now + Math.max(0, walk) * 60_000;
  return all
    .filter((d) => (d.cancelled ? Date.parse(d.plannedAt) : departureMs(d)) >= earliest)
    .sort((a, b) => departureMs(a) - departureMs(b))
    .slice(0, Math.max(0, limit));
}

/** True when the last fresh answer is older than five minutes. */
export function departuresStale(fetchedAt: string, now: number): boolean {
  const ms = Date.parse(fetchedAt);
  return !Number.isFinite(ms) || now - ms > DEPARTURES_STALE_MS;
}

/** The situations to show above the board: those in force first; announced ones only on request. */
export function shownSituations(all: TransitSituation[], includeUpcoming: boolean): TransitSituation[] {
  return includeUpcoming ? all : all.filter((s) => s.active);
}
