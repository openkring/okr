import { describe, it, expect } from 'vitest';
import { TripModel } from '@okr/shared-models';
import { aggregateTripStats, getQuarterDateRange } from './trip-stats.util';

function trip(patch: Partial<TripModel>): TripModel {
  return { state: 'closed', type: 'logbuch', distance: 10, participants: [], ...patch } as TripModel;
}

describe('getQuarterDateRange', () => {
  it('returns the whole year for quarter 0', () => {
    expect(getQuarterDateRange(2026, 0)).toEqual({ from: '20260101', to: '20261231' });
  });

  it('returns the three months of each quarter', () => {
    expect(getQuarterDateRange(2026, 1)).toEqual({ from: '20260101', to: '20260331' });
    expect(getQuarterDateRange(2026, 2)).toEqual({ from: '20260401', to: '20260631' });
    expect(getQuarterDateRange(2026, 3)).toEqual({ from: '20260701', to: '20260931' });
    expect(getQuarterDateRange(2026, 4)).toEqual({ from: '20261001', to: '20261231' });
  });

  it('keeps a month-end date inside its quarter and the next month outside', () => {
    const { from, to } = getQuarterDateRange(2026, 2);
    expect('20260630' >= from && '20260630' <= to).toBe(true);
    expect('20260701' <= to).toBe(false);
  });
});

describe('aggregateTripStats', () => {
  const boat = { key: 'B1' } as TripModel['resource'];
  const crew = [{ key: 'P1' }, { key: 'P2' }] as TripModel['participants'];

  it('sums km and count per boat', () => {
    const result = aggregateTripStats([
      trip({ resource: boat, distance: 10 }),
      trip({ resource: boat, distance: 5 }),
      trip({ resource: { key: 'B2' } as TripModel['resource'], distance: 7 }),
    ], 'boats');
    expect(result).toEqual({ B1: { km: 15, count: 2 }, B2: { km: 7, count: 1 } });
  });

  it('credits the full distance to every participant', () => {
    const result = aggregateTripStats([trip({ participants: crew, distance: 12 })], 'members');
    expect(result).toEqual({ P1: { km: 12, count: 1 }, P2: { km: 12, count: 1 } });
  });

  it('skips open, plainly deleted and tracker trips', () => {
    const result = aggregateTripStats([
      trip({ resource: boat, state: 'open' }),
      trip({ resource: boat, state: 'open.rev' }),
      trip({ resource: boat, state: 'deleted' }),
      trip({ resource: boat, type: 'tracker' }),
    ], 'boats');
    expect(result).toEqual({});
  });

  it('counts corrected and revised states', () => {
    const result = aggregateTripStats([
      trip({ resource: boat, state: 'closed.rev', distance: 1 }),
      trip({ resource: boat, state: 'deleted.corr', distance: 2 }),
      trip({ resource: boat, state: 'deleted.corr.rev', distance: 3 }),
    ], 'boats');
    expect(result).toEqual({ B1: { km: 6, count: 3 } });
  });

  it('skips a trip without a numeric distance and entries without a key', () => {
    const result = aggregateTripStats([
      trip({ resource: boat, distance: Number.NaN }),
      trip({ resource: { key: '' } as TripModel['resource'] }),
    ], 'boats');
    expect(result).toEqual({});
  });
});
