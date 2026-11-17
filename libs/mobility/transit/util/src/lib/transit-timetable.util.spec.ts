import { describe, expect, it } from 'vitest';
import type { TransitConnection, TransitLeg } from './transit-connection.model';
import {
  TIMETABLE_PAGE_SIZE,
  changeMarks,
  connectionKey,
  earlierAt,
  firstRide,
  groupByZurichDay,
  laterAt,
  mergeConnections,
  zurichLocalInput,
  zurichLocalToIso,
} from './transit-timetable.util';
import { zurichDateParts } from './transit-links.util';

function leg(kind: TransitLeg['kind'], line: string, departure: string, arrival: string): TransitLeg {
  return {
    kind, line, ptMode: kind === 'ride' ? 'rail' : '', from: 'A', to: 'B', departure, arrival,
    departureDelay: 0, arrivalDelay: 0, platform: '', direction: '', durationMinutes: 0, cancelled: false,
  };
}

function conn(dep: string, arr: string, lines: string[]): TransitConnection {
  return {
    departure: dep, arrival: arr, durationMinutes: 0,
    legs: lines.map((l) => leg('ride', l, dep, arr)),
  };
}

describe('transit-timetable.util', () => {
  it('page size is 5', () => expect(TIMETABLE_PAGE_SIZE).toBe(5));

  it('connectionKey joins departure, arrival and ride lines', () => {
    const c = conn('2026-11-15T10:00:00Z', '2026-11-15T11:00:00Z', ['S8', 'IR16']);
    c.legs.unshift(leg('walk', '', '', ''));
    expect(connectionKey(c)).toBe('2026-11-15T10:00:00Z|2026-11-15T11:00:00Z|S8,IR16');
  });

  it('mergeConnections de-duplicates and sorts by departure', () => {
    const A = conn('2026-11-15T10:00:00Z', '2026-11-15T11:00:00Z', ['S8']);
    const B = conn('2026-11-15T10:30:00Z', '2026-11-15T11:30:00Z', ['S8']);
    const C = conn('2026-11-15T11:00:00Z', '2026-11-15T12:00:00Z', ['S8']);
    const r = mergeConnections([B, A], [B, C]);
    expect(r).toHaveLength(3);
    expect(r.map((x) => x.departure)).toEqual([A.departure, B.departure, C.departure]);
  });

  it('earlierAt / laterAt step one minute', () => {
    const cs = [conn('2026-11-15T15:18:00Z', '2026-11-15T16:00:00Z', ['S8']), conn('2026-11-15T15:48:00Z', '2026-11-15T16:30:00Z', ['S8'])];
    expect(earlierAt(cs)).toBe('2026-11-15T15:17:00.000Z');
    expect(laterAt(cs)).toBe('2026-11-15T15:49:00.000Z');
    expect(earlierAt([])).toBe('');
    expect(laterAt([])).toBe('');
  });

  it('firstRide skips a leading walk', () => {
    const c = conn('2026-11-15T10:00:00Z', '2026-11-15T11:00:00Z', ['S8']);
    c.legs.unshift(leg('walk', '', '', ''));
    expect(firstRide(c)?.line).toBe('S8');
    expect(firstRide({ ...c, legs: [] })).toBeUndefined();
  });

  it('changeMarks gives the fraction of later ride departures', () => {
    const c: TransitConnection = {
      departure: '2026-11-15T10:00:00Z', arrival: '2026-11-15T11:00:00Z', durationMinutes: 60,
      legs: [
        leg('ride', 'S8', '2026-11-15T10:00:00Z', '2026-11-15T10:25:00Z'),
        leg('transfer', '', '', ''),
        leg('ride', 'IR16', '2026-11-15T10:30:00Z', '2026-11-15T11:00:00Z'),
      ],
    };
    expect(changeMarks(c)).toEqual([0.5]);
    expect(changeMarks(conn('2026-11-15T10:00:00Z', '2026-11-15T11:00:00Z', ['S8']))).toEqual([]);
  });

  it('groupByZurichDay groups by Zurich day, not UTC day', () => {
    const a = conn('2026-11-15T22:41:00Z', '2026-11-15T23:30:00Z', ['S8']);
    const b = conn('2026-11-15T23:05:00Z', '2026-11-16T00:00:00Z', ['S8']);
    const g = groupByZurichDay([a, b]);
    expect(g.map((x) => x.day)).toEqual(['20261115', '20261116']);
    expect(g[0].connections).toEqual([a]);
  });

  it('zurichDateParts is zero-padded h23 on the Zurich clock', () => {
    expect(zurichDateParts(Date.parse('2026-11-15T23:05:00Z'))).toEqual({ year: '2026', month: '11', day: '16', hour: '00', minute: '05' });
  });
});

describe('zurich wall clock of the date/time control', () => {
  it('shows an instant on the Swiss clock (winter, summer)', () => {
    expect(zurichLocalInput('2026-11-15T14:56:00Z')).toBe('2026-11-15T15:56');
    expect(zurichLocalInput('2026-07-01T10:00:00Z')).toBe('2026-07-01T12:00');
  });
  it('reads a Swiss wall-clock value back as an instant', () => {
    expect(zurichLocalToIso('2026-11-15T15:56')).toBe('2026-11-15T14:56:00.000Z');
    expect(zurichLocalToIso('2026-07-01T12:00:00')).toBe('2026-07-01T10:00:00.000Z');
    expect(zurichLocalToIso('2026-03-29T03:30')).toBe('2026-03-29T01:30:00.000Z');
  });
  it('ignores a trailing offset and rejects garbage', () => {
    expect(zurichLocalToIso('2026-11-15T15:56:00+05:00')).toBe('2026-11-15T14:56:00.000Z');
    expect(zurichLocalToIso('')).toBe('');
    expect(zurichLocalToIso(undefined)).toBe('');
    expect(zurichLocalToIso('15:56')).toBe('');
  });
  it('round-trips', () => {
    const iso = '2026-10-25T12:00:00.000Z';
    expect(zurichLocalToIso(zurichLocalInput(iso))).toBe(iso);
  });
});
