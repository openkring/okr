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
    expect(trip.startTime).toMatch(/^\d{4}$/);
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
      resource: { key: 'r1', name1: 'Skiff', name2: '', modelType: 'resource', type: 'rboat', subType: '', label: 'Skiff' },
      participants: [
        { key: 'p1', name1: 'Anna', name2: 'Müller', modelType: 'person', type: '', subType: '', label: 'Anna Müller' },
      ],
    });
    const idx = getTripIndex(trip);
    expect(idx).toContain('Skiff');
    expect(idx).toContain('20240601');
    expect(idx).toContain('Anna');
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
    trips.sort((x, y) => compareTripDate(y, x));
    expect(trips[0]).toBe(c);
    expect(trips[1]).toBe(b);
    expect(trips[2]).toBe(a);
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
