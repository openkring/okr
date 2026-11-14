import { describe, expect, it } from 'vitest';
import { TripModel } from '@okr/shared-models';

import { departureActions, departurePush, isRecentStart } from './departure';

// 2026-11-14 10:00 in Zurich (UTC+1 in November)
const NOW = new Date('2026-11-14T09:00:00Z');

const person = (key: string) => ({ key, name1: key, name2: '', modelType: 'person', type: '', subType: '', label: '' });

function trip(over: Partial<TripModel> = {}, crew = ['p1', 'p2']): TripModel {
  const t = new TripModel('scs');
  t.type = 'logbuch';
  t.state = 'open';
  t.startDate = '20261114';
  t.startTime = '09:55';
  t.participants = crew.map(person);
  return Object.assign(t, over);
}

describe('isRecentStart', () => {
  it('accepts a start today within the window, in both time formats', () => {
    expect(isRecentStart({ startDate: '20261114', startTime: '09:55' }, NOW)).toBe(true);
    expect(isRecentStart({ startDate: '20261114', startTime: '0805' }, NOW)).toBe(true);
    expect(isRecentStart({ startDate: '20261114', startTime: '10:45' }, NOW)).toBe(true);
  });

  it('refuses a back-fill: another day, too long ago, too far ahead or no time', () => {
    expect(isRecentStart({ startDate: '20261113', startTime: '09:55' }, NOW)).toBe(false);
    expect(isRecentStart({ startDate: '20261114', startTime: '07:30' }, NOW)).toBe(false);
    expect(isRecentStart({ startDate: '20261114', startTime: '11:30' }, NOW)).toBe(false);
    expect(isRecentStart({ startDate: '20261114', startTime: '' }, NOW)).toBe(false);
  });
});

describe('departureActions', () => {
  it('a new open trip: the whole crew departs', () => {
    expect(departureActions(undefined, trip(), NOW)).toEqual({ depart: ['p1', 'p2'], clear: [] });
  });

  it('a back-filled trip: nobody departs', () => {
    expect(departureActions(undefined, trip({ startDate: '20261113' }), NOW)).toEqual({ depart: [], clear: [] });
  });

  it('an edit that keeps the crew does nothing', () => {
    expect(departureActions(trip(), trip({ distance: 5 }), NOW)).toEqual({ depart: [], clear: [] });
  });

  it('crew added to an open trip departs, crew removed is cleared (D3)', () => {
    expect(departureActions(trip(), trip({}, ['p1', 'p3']), NOW)).toEqual({ depart: ['p3'], clear: ['p2'] });
  });

  it('end, auto-close, soft delete and hard delete clear the whole crew', () => {
    const cleared = { depart: [], clear: ['p1', 'p2'] };
    expect(departureActions(trip(), trip({ state: 'closed' }), NOW)).toEqual(cleared);
    expect(departureActions(trip(), trip({ state: 'closed.rev' }), NOW)).toEqual(cleared);
    expect(departureActions(trip(), trip({ state: 'deleted' }), NOW)).toEqual(cleared);
    expect(departureActions(trip(), undefined, NOW)).toEqual(cleared);
  });

  it('ignores guests without a key, other trip types and archived trips', () => {
    const withGuest = trip();
    withGuest.participants.push({ ...person(''), name1: 'Gast' });
    expect(departureActions(undefined, withGuest, NOW).depart).toEqual(['p1', 'p2']);
    expect(departureActions(undefined, trip({ type: 'tracker' }), NOW).depart).toEqual([]);
    expect(departureActions(undefined, trip({ isArchived: true }), NOW).depart).toEqual([]);
  });

  it('a re-opened trip (closed → open.rev) departs again if the start is recent', () => {
    expect(departureActions(trip({ state: 'closed' }), trip({ state: 'open.rev' }), NOW).depart).toEqual(['p1', 'p2']);
  });
});

describe('departurePush', () => {
  it('names the boat and links the Notfall page', () => {
    const p = departurePush(trip({ resource: { ...person('b1'), name1: 'Libelle', modelType: 'resource' } }));
    expect(p).toEqual({ title: 'Gute Fahrt, Libelle', body: 'Tippe hier für den Notfall-Knopf.', url: '/private/notfall_content/c-contentpage', type: 'departure' });
    expect(departurePush(trip()).title).toBe('Gute Fahrt');
  });
});
