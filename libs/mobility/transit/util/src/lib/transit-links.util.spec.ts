import { describe, expect, it } from 'vitest';

import { mapsDirectionsUrl, sbbTimetableUrl } from './transit-links.util';

const home = { lat: 47.3779, lng: 8.5402 };
const club = { lat: 47.3445, lng: 8.5335 };

describe('mapsDirectionsUrl', () => {
  it('builds a Google Maps directions link with the travel mode', () => {
    const url = new URL(mapsDirectionsUrl(home, club, 'bike'));
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.get('origin')).toBe('47.3779,8.5402');
    expect(url.searchParams.get('destination')).toBe('47.3445,8.5335');
    expect(url.searchParams.get('travelmode')).toBe('bicycling');
  });

  it('maps every mode', () => {
    expect(new URL(mapsDirectionsUrl(home, club, 'walk')).searchParams.get('travelmode')).toBe('walking');
    expect(new URL(mapsDirectionsUrl(home, club, 'car')).searchParams.get('travelmode')).toBe('driving');
  });

  it('leaves the origin out for the current position', () => {
    const url = new URL(mapsDirectionsUrl(undefined, club, 'walk'));
    expect(url.searchParams.has('origin')).toBe(false);
  });
});

describe('sbbTimetableUrl', () => {
  it('builds coordinate stops, Swiss wall-clock day/time and the moment', () => {
    // 2026-11-02 11:00 UTC = 12:00 in Zurich (CET)
    const url = new URL(sbbTimetableUrl({ label: 'Mein Start', point: { lat: 46.948825, lng: 7.439122 } },
      { label: 'Mein Ziel', point: { lat: 47.367345, lng: 8.53995 } }, '2026-11-02T11:00:00Z', 'arriveBy'));
    expect(url.origin + url.pathname).toBe('https://www.sbb.ch/de');
    expect(url.searchParams.get('stops')).toBe('Mein Start_IA=2@X=7439122@Y=46948825~Mein Ziel_IA=2@X=8539950@Y=47367345');
    expect(url.searchParams.get('day')).toBe('2026-11-02');
    expect(url.searchParams.get('time')).toBe('12_00');
    expect(url.searchParams.get('moment')).toBe('arr');
  });

  it('uses summer time and the departure moment', () => {
    const url = new URL(sbbTimetableUrl({ label: 'A', point: home }, { label: 'B', point: club }, '2026-07-01T06:30:00Z', 'departAt'));
    expect(url.searchParams.get('time')).toBe('08_30');
    expect(url.searchParams.get('moment')).toBe('dep');
  });

  it('keeps the separators out of labels', () => {
    const url = new URL(sbbTimetableUrl({ label: 'a~b_c', point: home }, { label: '', point: club }, '2026-07-01T06:30:00Z', 'departAt'));
    expect(url.searchParams.get('stops')?.startsWith('a b c_I')).toBe(true);
    expect(url.searchParams.get('stops')).toContain('~-_I');
  });
});
