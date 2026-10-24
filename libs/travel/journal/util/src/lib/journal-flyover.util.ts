import type { TransportMode } from '@okr/shared-models';

/**
 * The flyover of a journal (spec 1.113 phase 2, design 2026-10-24): from the footprints and the photo positions a
 * timeline of legs — each leg ends at a footprint, takes that footprint's transport and gets about the same time,
 * so the whole flight lasts 1–2 minutes however long the trip was. Paths are [lng, lat] (MapLibre order).
 */
export interface FlyStop { key: string; lat: number; lng: number; at: string; thumb?: string; transport?: TransportMode; title: string }
export interface FlyPoint { lat: number; lng: number; at: string }
export interface FlyLeg { to: FlyStop; transport?: TransportMode; path: [number, number][]; durationMs: number }
export interface FlyTimeline { start: FlyStop; legs: FlyLeg[]; totalMs: number }

export const OPENING_MS = 4000;
export const CLOSING_MS = 3000;
const LEGS_MS = 100_000;
const LEG_MIN_MS = 800;
const LEG_MAX_MS = 4000;
const TOTAL_MAX_MS = 125_000;
const ARC_STEPS = 48;

const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/**
 * Points on the great circle from a to b (both [lng, lat]); longitudes are unwrapped so the line never jumps at
 * ±180° (MapLibre draws a longitude of 190 east of the date line).
 */
export function greatCircle(a: [number, number], b: [number, number], steps: number): [number, number][] {
  const [lng1, lat1] = [toRad(a[0]), toRad(a[1])];
  const [lng2, lat2] = [toRad(b[0]), toRad(b[1])];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2));
  if (d === 0) return [a, b];
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    let lng = toDeg(Math.atan2(y, x));
    const prev = out[out.length - 1]?.[0] ?? a[0];
    while (lng - prev > 180) lng -= 360;
    while (lng - prev < -180) lng += 360;
    out.push([lng, toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }
  out[0] = [a[0], a[1]];
  return out;
}

/** A footprint's StoreDate + 'HH:mm' as a sortable local timestamp; a day without time counts as noon. */
export function stopTime(date: string, time: string): string {
  if (!/^\d{8}$/.test(date)) return '';
  const t = /^\d{2}:\d{2}$/.test(time) ? time : '12:00';
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${t}`;
}

/**
 * The legs between consecutive stops (stops in travel order). A plane leg is a great-circle arc; any other leg
 * follows the photo positions taken after the previous stop and up to this one. Each leg gets
 * `clamp(100 s / legs, 0.8 s, 4 s)`; the two-minute limit wins over the floor on very long trips.
 */
export function flyoverTimeline(stops: FlyStop[], points: FlyPoint[]): FlyTimeline | undefined {
  if (stops.length < 2) return undefined;
  const dated = points.filter((p) => p.at !== '').sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const count = stops.length - 1;
  let perLeg = Math.round(Math.min(LEG_MAX_MS, Math.max(LEG_MIN_MS, LEGS_MS / count)));
  if (OPENING_MS + CLOSING_MS + perLeg * count > TOTAL_MAX_MS) perLeg = Math.floor((TOTAL_MAX_MS - OPENING_MS - CLOSING_MS) / count);
  const legs: FlyLeg[] = [];
  for (let i = 1; i < stops.length; i++) {
    const from = stops[i - 1];
    const to = stops[i];
    const ends: [number, number][] = [[from.lng, from.lat], [to.lng, to.lat]];
    let path: [number, number][];
    if (to.transport === 'plane') {
      path = greatCircle(ends[0], ends[1], ARC_STEPS);
    } else {
      const between = from.at && to.at ? dated.filter((p) => p.at > from.at && p.at <= `${to.at}￿`) : [];
      path = [ends[0], ...between.map((p) => [p.lng, p.lat] as [number, number]), ends[1]];
    }
    legs.push({ to, transport: to.transport, path, durationMs: perLeg });
  }
  return { start: stops[0], legs, totalMs: OPENING_MS + CLOSING_MS + perLeg * count };
}
