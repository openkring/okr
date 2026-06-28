import { describe, it, expect } from 'vitest';
import { TripModel } from '@bk2/shared-models';
import {
  newTrip,
  newTripName,
  getTripIndex,
  groupTripsByDay,
  matchesStateFilter,
  compareTripDate,
  formatTripTime,
  isTripEditable,
  TRIP_EDIT_WINDOW_MS,
} from './trip.util';

const TENANT = 'test-tenant';

function makeTrip(overrides: Partial<TripModel> = {}): TripModel {
  const trip = new TripModel(TENANT);
  trip.startDate = '20240601';
  trip.startTime = '0830';
  trip.state = 'open';
  return Object.assign(trip, overrides);
}

describe('newTrip', () => {
  it('creates a trip with state draft', () => {
    const trip = newTrip(TENANT);
    expect(trip.state).toBe('draft');
    expect(trip.tenants).toContain(TENANT);
    expect(trip.startDate).toMatch(/^\d{8}$/);
    // newTrip stores the current time via getCurrentTime() in HH:mm format (DateFormat.Time)
    expect(trip.startTime).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('newTripName', () => {
  it('formats yyyymmddhhmmboatname', () => {
    const trip = makeTrip({ resource: { key: 'r1', name1: 'Skiff', name2: '', modelType: 'resource', type: 'rboat', subType: '', label: 'Skiff' } });
    expect(newTripName(trip)).toBe('202406010830Skiff');
  });

  it('uses empty string when resource is undefined', () => {
    const trip = makeTrip();
    expect(newTripName(trip)).toBe('202406010830');
  });
});

describe('getTripIndex', () => {
  it('includes boat name, date and participant names', () => {
    const trip = makeTrip({
      resource: { key: 'r1', name1: '', name2: 'Skiff', modelType: 'resource', type: 'rboat', subType: '', label: 'Skiff' },
      participants: [
        { key: 'p1', name1: 'Anna', name2: 'Müller', modelType: 'person', type: '', subType: '', label: 'Anna Müller' },
        { key: 'p2', name1: 'Max', name2: 'Muster', modelType: 'person', type: '', subType: '', label: 'Max Muster' },
      ],
    });
    const idx = getTripIndex(trip);
    expect(idx).toContain('Skiff');
    expect(idx).toContain('20240601');
    expect(idx).toContain('Anna Müller');
    expect(idx).toContain('Max Muster');
  });

  it('returns index without participants when array is empty', () => {
    const trip = makeTrip({
      resource: { key: 'r1', name1: '', name2: 'Skiff', modelType: 'resource', type: 'rboat', subType: '', label: 'Skiff' },
    });
    const idx = getTripIndex(trip);
    expect(idx).toContain('Skiff');
    expect(idx).not.toContain('p:');
  });
});

describe('formatTripTime', () => {
  it('converts 0830 to 08:30', () => {
    expect(formatTripTime('0830')).toBe('08:30');
  });

  it('returns input unchanged for non 4-char strings', () => {
    expect(formatTripTime('')).toBe('');
    expect(formatTripTime('083')).toBe('083');
  });
});

describe('matchesStateFilter', () => {
  it('all matches everything', () => {
    expect(matchesStateFilter('open', 'all')).toBe(true);
    expect(matchesStateFilter('deleted', 'all')).toBe(true);
  });

  it('revised matches .rev suffix', () => {
    expect(matchesStateFilter('open.rev', 'revised')).toBe(true);
    expect(matchesStateFilter('closed.rev', 'revised')).toBe(true);
    expect(matchesStateFilter('open', 'revised')).toBe(false);
  });

  it('corrected matches .corr suffix', () => {
    expect(matchesStateFilter('closed.corr', 'corrected')).toBe(true);
    expect(matchesStateFilter('open', 'corrected')).toBe(false);
  });

  it('exact state match otherwise', () => {
    expect(matchesStateFilter('open', 'open')).toBe(true);
    expect(matchesStateFilter('closed', 'open')).toBe(false);
    expect(matchesStateFilter('deleted', 'deleted')).toBe(true);
  });
});

describe('compareTripDate', () => {
  it('sorts by startDate + startTime descending', () => {
    const a = makeTrip({ startDate: '20240601', startTime: '0800' });
    const b = makeTrip({ startDate: '20240601', startTime: '0900' });
    const c = makeTrip({ startDate: '20240602', startTime: '0800' });
    const trips = [a, b, c];
    trips.sort(compareTripDate);
    expect(trips[0]).toBe(c);
    expect(trips[1]).toBe(b);
    expect(trips[2]).toBe(a);
  });

  it('returns 0 for equal date and time', () => {
    const a = makeTrip({ startDate: '20240601', startTime: '0800' });
    const b = makeTrip({ startDate: '20240601', startTime: '0800' });
    expect(compareTripDate(a, b)).toBe(0);
  });
});

describe('isTripEditable', () => {
  // reference "now": 2024-06-01 12:00:00 local time
  const now = new Date(2024, 5, 1, 12, 0, 0).getTime();

  it('is editable when the trip has no endDate/endTime (not yet ended)', () => {
    expect(isTripEditable(makeTrip({ endDate: '', endTime: '' }), now)).toBe(true);
  });

  it('is editable right after ending', () => {
    // ended at 11:55, 5 min ago
    expect(isTripEditable(makeTrip({ endDate: '20240601', endTime: '1155' }), now)).toBe(true);
  });

  it('is editable exactly at the 15 min window boundary', () => {
    const endMs = now - TRIP_EDIT_WINDOW_MS;
    const end = new Date(endMs);
    const endTime = `${`${end.getHours()}`.padStart(2, '0')}${`${end.getMinutes()}`.padStart(2, '0')}`;
    expect(isTripEditable(makeTrip({ endDate: '20240601', endTime }), now)).toBe(true);
  });

  it('is NOT editable more than 15 min after ending', () => {
    // ended at 11:40, 20 min ago
    expect(isTripEditable(makeTrip({ endDate: '20240601', endTime: '1140' }), now)).toBe(false);
  });
});

describe('groupTripsByDay', () => {
  it('groups trips by startDate descending', () => {
    const t1 = makeTrip({ startDate: '20240601', bkey: 't1' });
    const t2 = makeTrip({ startDate: '20240601', bkey: 't2' });
    const t3 = makeTrip({ startDate: '20240602', bkey: 't3' });
    const groups = groupTripsByDay([t1, t2, t3]);
    expect(groups).toHaveLength(2);
    expect(groups[0].date).toBe('20240602');
    expect(groups[1].date).toBe('20240601');
    expect(groups[1].trips).toHaveLength(2);
  });
});
