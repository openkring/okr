import { describe, expect, it } from 'vitest';

import type { TransitConnection, TransitLeg } from './transit-connection.model';
import { arrivesLate, clockTime, durationLabel, expectedArrivalMs, firstDelay, inSwitzerland, isCancelled, lineSummary, locationPoint, transfers } from './transit-connection.util';

function leg(kind: TransitLeg['kind'], line = '', extra: Partial<TransitLeg> = {}): TransitLeg {
  return {
    kind, line, ptMode: kind === 'ride' ? 'rail' : '', from: 'A', to: 'B', departure: '', arrival: '',
    departureDelay: 0, arrivalDelay: 0, platform: '', direction: '', durationMinutes: 5, cancelled: false, ...extra,
  };
}

const conn = (legs: TransitLeg[]): TransitConnection => ({
  departure: '2026-11-01T16:00:00Z', arrival: '2026-11-01T16:40:00Z', durationMinutes: 40, legs,
});

describe('transfers / lineSummary / firstDelay', () => {
  it('counts the changes between rides only', () => {
    expect(transfers(conn([leg('walk'), leg('ride', 'S8'), leg('transfer'), leg('ride', 'Bus 912'), leg('walk')]))).toBe(1);
    expect(transfers(conn([leg('ride', 'S16')]))).toBe(0);
    expect(transfers(conn([leg('walk')]))).toBe(0);
  });

  it('joins the lines of the rides', () => {
    expect(lineSummary(conn([leg('walk'), leg('ride', 'S8'), leg('ride', 'Bus 912')]))).toBe('S8 · Bus 912');
  });

  it('takes the delay of the first ride, not of a walk', () => {
    expect(firstDelay(conn([leg('walk'), leg('ride', 'S8', { departureDelay: 2 }), leg('ride', 'B', { departureDelay: 7 })]))).toBe(2);
    expect(firstDelay(conn([leg('walk')]))).toBe(0);
  });
});

describe('arrivesLate', () => {
  const c = conn([leg('ride', 'S8', { arrivalDelay: 0 })]);

  it('compares the expected arrival with the latest arrival', () => {
    expect(arrivesLate(c, '2026-11-01T16:50:00Z')).toBe(false);
    expect(arrivesLate(c, '2026-11-01T16:40:00Z')).toBe(false);
    expect(arrivesLate(c, '2026-11-01T16:30:00Z')).toBe(true);
  });

  it('adds the realtime delay of the last ride', () => {
    const late = conn([leg('ride', 'S8', { arrivalDelay: 3 }), leg('ride', 'Bus', { arrivalDelay: 12 })]);
    expect(expectedArrivalMs(late)).toBe(Date.parse('2026-11-01T16:52:00Z'));
    expect(arrivesLate(late, '2026-11-01T16:50:00Z')).toBe(true);
  });

  it('is never late against an unreadable time', () => {
    expect(arrivesLate(c, '')).toBe(false);
  });
});

describe('locationPoint / inSwitzerland', () => {
  it('treats 0/0 and missing values as no coordinates', () => {
    expect(locationPoint({ latitude: 0, longitude: 0 })).toBeUndefined();
    expect(locationPoint(undefined)).toBeUndefined();
    expect(locationPoint({ latitude: 47.3445, longitude: 8.5335 })).toEqual({ lat: 47.3445, lng: 8.5335 });
  });

  it('accepts Swiss points and rejects others', () => {
    expect(inSwitzerland({ lat: 46.9488, lng: 7.4391 })).toBe(true);
    expect(inSwitzerland({ lat: 48.1372, lng: 11.5756 })).toBe(false);
  });

  it('marks a connection with a cancelled ride', () => {
    expect(isCancelled(conn([leg('ride', 'S8', { cancelled: true })]))).toBe(true);
    expect(isCancelled(conn([leg('ride', 'S8')]))).toBe(false);
  });
});

describe('clockTime / durationLabel', () => {
  it('shows the Swiss wall clock in winter and summer', () => {
    expect(clockTime('2026-11-01T16:05:00Z')).toBe('17:05');
    expect(clockTime('2026-07-01T16:05:00Z')).toBe('18:05');
    expect(clockTime('')).toBe('');
  });

  it('writes minutes like a timetable', () => {
    expect(durationLabel(43)).toBe("43'");
    expect(durationLabel(92)).toBe("1 h 32'");
    expect(durationLabel(60)).toBe("1 h 00'");
  });
});
