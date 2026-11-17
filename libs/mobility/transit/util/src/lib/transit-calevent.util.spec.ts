import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PERSONAL_CALENDAR_KEY, TRIP_CALEVENT_TYPE } from '@okr/shared-constants';
import type { AvatarInfo } from '@okr/shared-models';

import type { TransitConnection } from './transit-connection.model';
import { connectionToCalevent, tripDescription } from './transit-calevent.util';
import type { TransitPlace } from './transit-place.model';

const labels = { current: 'Aktueller Standort', home: 'Meine Adresse', change: 'Umstieg', walk: 'zu Fuss', platform: 'Gl.', sbb: 'SBB Fahrplan' };
const organiser: AvatarInfo = { key: 'p1', name1: 'Anna', name2: 'Muster', label: 'Anna Muster', modelType: 'person', type: '', subType: '' };
const conn = (departure: string, arrival: string): TransitConnection => ({
  departure, arrival, durationMinutes: 0,
  legs: [
    { kind: 'walk', line: '', ptMode: '', from: 'A', to: 'Dieni', departure: '', arrival: '', departureDelay: 0, arrivalDelay: 0, platform: '', direction: '', durationMinutes: 10, cancelled: false },
    { kind: 'ride', line: 'R45', ptMode: 'rail', from: 'Dieni', to: 'Chur', departure: '2026-11-15T15:18:00Z', arrival: '2026-11-15T16:02:00Z', departureDelay: 0, arrivalDelay: 0, platform: '1', direction: 'Chur', durationMinutes: 44, cancelled: false },
  ],
});
const base = conn('2026-11-15T15:18:00Z', '2026-11-15T18:52:00Z');
const bahnhof: TransitPlace = { kind: 'location', label: 'Bahnhof Stäfa', locationKey: 'loc1', point: { lat: 47.24, lng: 8.72 } };
const chur: TransitPlace = { kind: 'location', label: 'Chur', locationKey: 'loc2', point: { lat: 46.85, lng: 9.53 } };
const home: TransitPlace = { kind: 'home', label: 'Seestrasse 1, 8712 Stäfa', address: 'Seestrasse 1, 8712 Stäfa', point: { lat: 47.2, lng: 8.7 } };
const make = (over: Partial<Parameters<typeof connectionToCalevent>[0]> = {}) =>
  connectionToCalevent({ connection: base, from: bahnhof, to: chur, calendarKey: 'crew', title: 'Reise', tenantId: 'scs', organiser, labels, ...over });

describe('tripDescription', () => {
  it('writes one line per leg on the Zurich clock', () => {
    const text = tripDescription(base, labels);
    expect(text).toContain('16:18 R45 Gl. 1 Dieni → 17:02 Chur');
    expect(text).toContain("10' zu Fuss");
  });
});

describe.each(['UTC', 'America/New_York'])('connectionToCalevent in device zone %s', (tz) => {
  beforeEach(() => vi.stubEnv('TZ', tz));
  afterEach(() => vi.unstubAllEnvs());

  it('uses the Zurich wall clock', () => {
    const e = make();
    expect(e.startDate).toBe('20261115');
    expect(e.startTime).toBe('16:18');
    expect(e.durationMinutes).toBe(214);
    expect(e.fullDay).toBe(false);
  });
  it('keeps the Zurich date around midnight', () => {
    const e = make({ connection: conn('2026-11-15T22:41:00Z', '2026-11-15T23:37:00Z') });
    expect(e.startDate).toBe('20261115');
    expect(e.startTime).toBe('23:41');
    expect(e.durationMinutes).toBe(56);
  });
});

describe('connectionToCalevent mapping', () => {
  it('maps the calendar', () => {
    expect(make({ calendarKey: PERSONAL_CALENDAR_KEY }).calendars).toEqual([]);
    expect(make({ calendarKey: 'crew' }).calendars).toEqual(['crew']);
  });
  it('never writes the home address, even into a shared calendar', () => {
    const e = make({ from: home, calendarKey: 'crew' });
    const json = JSON.stringify(e);
    expect(json).not.toContain('Seestrasse');
    expect(json).not.toContain('8712');
    expect(e.url).toBe('');
    expect(e.urlLabel).toBe('');
    expect(e.description).toContain('Meine Adresse');
  });
  it('never writes the device position and sets no location for it', () => {
    const cur: TransitPlace = { kind: 'current', label: '47.1,8.6', point: { lat: 47.1, lng: 8.6 } };
    const e = make({ to: cur });
    expect(e.locations).toEqual([]);
    expect(e.url).toBe('');
    expect(JSON.stringify(e)).not.toContain('47.1');
  });
  it('links the SBB timetable between two locations', () => {
    const e = make();
    expect(e.url.startsWith('https://www.sbb.ch/')).toBe(true);
    expect(e.urlLabel).toBe('SBB Fahrplan');
    expect(e.locations[0].key).toBe('loc2');
    expect(e.locations[0].modelType).toBe('location');
  });
  it('uses free text for an org destination', () => {
    const e = make({ to: { kind: 'org', label: 'SCS', address: 'Seestrasse 1', point: { lat: 47.2, lng: 8.7 } } });
    expect(e.locations[0].key).toBe('');
    expect(e.locations[0].label).toBe('SCS');
  });
  it('fills the remaining fields', () => {
    const e = make();
    expect(e.type).toBe(TRIP_CALEVENT_TYPE);
    expect(e.responsiblePersons).toEqual([organiser]);
    expect(e.attendees).toEqual([]);
    expect(e.name).toBe('Reise');
    expect(e.tenants).toEqual(['scs']);
  });
});
