import type { LatLng, TransitConnection } from './transit-connection.model';

/** Rough WGS84 box around Switzerland and Liechtenstein — the area OJP covers (same box as the backend). */
const CH_BOX = { minLat: 45.8, maxLat: 47.85, minLng: 5.9, maxLng: 10.55 };

export function inSwitzerland(p: LatLng): boolean {
  return p.lat >= CH_BOX.minLat && p.lat <= CH_BOX.maxLat && p.lng >= CH_BOX.minLng && p.lng <= CH_BOX.maxLng;
}

/** The point of a location, or undefined when it has no coordinates (`0/0` is the model's default). */
export function locationPoint(loc: { latitude?: number; longitude?: number } | undefined): LatLng | undefined {
  const lat = Number(loc?.latitude);
  const lng = Number(loc?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return undefined;
  return { lat, lng };
}

/** Number of changes: rides minus one, never negative. */
export function transfers(c: TransitConnection): number {
  return Math.max(0, c.legs.filter((l) => l.kind === 'ride').length - 1);
}

/** The lines of the rides, e.g. «S8 · Bus 912». */
export function lineSummary(c: TransitConnection): string {
  return c.legs.filter((l) => l.kind === 'ride' && l.line).map((l) => l.line).join(' · ');
}

/** Realtime delay of the first ride's departure in minutes; 0 without realtime data. */
export function firstDelay(c: TransitConnection): number {
  return c.legs.find((l) => l.kind === 'ride')?.departureDelay ?? 0;
}

/** The expected arrival (timetabled plus the last ride's arrival delay), as epoch ms. */
export function expectedArrivalMs(c: TransitConnection): number {
  const rides = c.legs.filter((l) => l.kind === 'ride');
  const delay = rides.length ? rides[rides.length - 1].arrivalDelay : 0;
  return Date.parse(c.arrival) + delay * 60_000;
}

/** With an arrive-by search: true when the connection arrives after `at`. */
export function arrivesLate(c: TransitConnection, at: string): boolean {
  const limit = Date.parse(at);
  return Number.isFinite(limit) && expectedArrivalMs(c) > limit;
}

/** True when any ride of the connection is cancelled. */
export function isCancelled(c: TransitConnection): boolean {
  return c.legs.some((l) => l.cancelled);
}

const clockFormat = new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** `HH:mm` of an ISO instant on the Swiss wall clock (timetables are read there); '' when unreadable. */
export function clockTime(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? clockFormat.format(new Date(ms)) : '';
}

/** A duration as the timetables write it: «43'», «1 h 32'». */
export function durationLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return m < 60 ? `${m}'` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}'`;
}
