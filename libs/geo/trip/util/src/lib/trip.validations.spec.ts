import { describe, it, expect } from 'vitest';

import { TripModel } from '@okr/shared-models';

import { tripValidationSuite } from './trip.validations';

const TENANT = 'test-tenant';

/** A trip that passes every rule of the suite; each test breaks exactly one thing. */
function makeTrip(overrides: Partial<TripModel> = {}): TripModel {
  const trip = new TripModel(TENANT);
  trip.startDate = '20240601';
  trip.startTime = '08:30';
  trip.endDate = '20240601';
  trip.endTime = '10:00';
  trip.state = 'closed';
  trip.distance = 12;
  trip.resource = { key: 'boat1', name1: 'Gig', name2: 'Gig', label: '', modelType: 'resource', type: 'rboat', subType: 'b2x' };
  trip.locations = [{ key: 'loc1', name1: '12', name2: 'Rapperswil', label: '', modelType: 'location', type: 'trip', subType: '' }];
  trip.participants = [
    { key: 'p1', name1: 'Anna', name2: 'Muster', label: '', modelType: 'person', type: '', subType: '' },
    { key: 'p2', name1: 'Beat', name2: 'Muster', label: '', modelType: 'person', type: '', subType: '' },
  ];
  return Object.assign(trip, overrides);
}

function errorsOf(trip: TripModel, field: string): string[] {
  return tripValidationSuite(trip).getErrors(field);
}

describe('tripValidationSuite: start/end date and time', () => {
  it('accepts a fully filled trip', () => {
    expect(tripValidationSuite(makeTrip()).isValid()).toBe(true);
  });

  it('accepts an open trip without any end', () => {
    const trip = makeTrip({ endDate: '', endTime: '', state: 'open' });
    expect(errorsOf(trip, 'endDate')).toEqual([]);
    expect(errorsOf(trip, 'endTime')).toEqual([]);
  });

  it('tolerates a legacy trip whose end fields were never written', () => {
    const trip = makeTrip();
    (trip as Partial<TripModel>).endDate = undefined;
    (trip as Partial<TripModel>).endTime = undefined;
    expect(errorsOf(trip, 'endDate')).toEqual([]);
    expect(errorsOf(trip, 'endTime')).toEqual([]);
  });

  it("accepts the legacy 'HHmm' time format", () => {
    const trip = makeTrip({ startTime: '0830', endTime: '1000' });
    expect(errorsOf(trip, 'startTime')).toEqual([]);
    expect(errorsOf(trip, 'endTime')).toEqual([]);
  });

  it('rejects an invalid time', () => {
    expect(errorsOf(makeTrip({ endTime: '25:70' }), 'endTime').length).toBeGreaterThan(0);
  });

  it('rejects an invalid date', () => {
    expect(errorsOf(makeTrip({ endDate: '20240631' }), 'endDate').length).toBeGreaterThan(0);
  });

  it('rejects an end that lies before the start', () => {
    expect(errorsOf(makeTrip({ endDate: '20240531' }), 'endDate').length).toBeGreaterThan(0);
    expect(errorsOf(makeTrip({ endTime: '07:00' }), 'endDate').length).toBeGreaterThan(0);
  });

  it('compares mixed time formats correctly', () => {
    // '1000' vs '08:30' — a naive string compare would call this end earlier than the start
    expect(errorsOf(makeTrip({ startTime: '08:30', endTime: '1000' }), 'endDate')).toEqual([]);
  });

  it('accepts an end equal to the start', () => {
    expect(errorsOf(makeTrip({ endTime: '08:30' }), 'endDate')).toEqual([]);
  });
});
