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
