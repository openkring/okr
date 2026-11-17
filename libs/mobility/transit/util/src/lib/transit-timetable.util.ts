import type { TransitConnection, TransitLeg } from './transit-connection.model';
import { zurichDateParts } from './transit-links.util';

/** Connections per search page (the `planTrip` maximum). */
export const TIMETABLE_PAGE_SIZE = 5;

const MINUTE_MS = 60_000;

/** Identity of a connection across pages: departure, arrival and the lines of its rides. */
export function connectionKey(c: TransitConnection): string {
  const lines = c.legs.filter((l) => l.kind === 'ride').map((l) => l.line).join(',');
  return `${c.departure}|${c.arrival}|${lines}`;
}

/** Union of two result pages, de-duplicated by key and sorted by departure. */
export function mergeConnections(a: TransitConnection[], b: TransitConnection[]): TransitConnection[] {
  const byKey = new Map<string, TransitConnection>();
  for (const c of [...a, ...b]) if (!byKey.has(connectionKey(c))) byKey.set(connectionKey(c), c);
  return [...byKey.values()].sort((x, y) => Date.parse(x.departure) - Date.parse(y.departure));
}

/** Search instant for the page before the list: first departure minus one minute; '' for none. */
export function earlierAt(cs: TransitConnection[]): string {
  if (cs.length === 0) return '';
  return new Date(Date.parse(cs[0].departure) - MINUTE_MS).toISOString();
}

/** Search instant for the page after the list: last departure plus one minute; '' for none. */
export function laterAt(cs: TransitConnection[]): string {
  if (cs.length === 0) return '';
  return new Date(Date.parse(cs[cs.length - 1].departure) + MINUTE_MS).toISOString();
}

export function firstRide(c: TransitConnection): TransitLeg | undefined {
  return c.legs.find((l) => l.kind === 'ride');
}

/** Position (0..1 of the connection's span) of each change, i.e. of every ride after the first. */
export function changeMarks(c: TransitConnection): number[] {
  const start = Date.parse(c.departure);
  const span = Date.parse(c.arrival) - start;
  if (!(span > 0)) return [];
  return c.legs
    .filter((l) => l.kind === 'ride')
    .slice(1)
    .map((l) => Math.round(((Date.parse(l.departure) - start) / span) * 1000) / 1000);
}

/** Groups by the Zurich StoreDate (YYYYMMDD) of the departure, in list order. */
export function groupByZurichDay(cs: TransitConnection[]): { day: string; connections: TransitConnection[] }[] {
  const groups: { day: string; connections: TransitConnection[] }[] = [];
  for (const c of cs) {
    const p = zurichDateParts(Date.parse(c.departure));
    const day = `${p.year}${p.month}${p.day}`;
    const last = groups[groups.length - 1];
    if (last?.day === day) last.connections.push(c);
    else groups.push({ day, connections: [c] });
  }
  return groups;
}

/** `yyyy-MM-ddTHH:mm` of an instant on the Swiss wall clock, the value of the date/time control; '' ⇒ now. */
export function zurichLocalInput(iso: string): string {
  const ms = Date.parse(iso);
  const p = zurichDateParts(Number.isFinite(ms) ? ms : Date.now());
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * The instant (ISO) of a Swiss wall-clock value `yyyy-MM-ddTHH:mm[:ss]`, whatever the device zone; any trailing
 * offset is ignored. '' when the value cannot be read.
 */
export function zurichLocalToIso(local: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local ?? '');
  if (!m) return '';
  const wanted = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let ms = wanted;
  // two corrections settle the Zurich offset, including the days the clocks change
  for (let i = 0; i < 2; i++) {
    const p = zurichDateParts(ms);
    ms += wanted - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  }
  return new Date(ms).toISOString();
}
