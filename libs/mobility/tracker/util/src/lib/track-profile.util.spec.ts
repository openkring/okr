import { describe, expect, it } from 'vitest';
import { TRACK_PROFILES, isTrackerTrip } from './track-profile.util';

describe('TRACK_PROFILES', () => {
  it('foot', () => expect(TRACK_PROFILES.foot).toEqual({ distanceFilter: 10, minIntervalMs: 5000, gps: true, accuracy: 'best' }));
  it('ski matches bike', () => expect(TRACK_PROFILES.ski.distanceFilter).toBe(TRACK_PROFILES.bike.distanceFilter));
  it('motorbike matches car', () => expect(TRACK_PROFILES.motorbike.distanceFilter).toBe(TRACK_PROFILES.car.distanceFilter));
  it('plane has no gps', () => expect(TRACK_PROFILES.plane.gps).toBe(false));
});

describe('TRACK_PROFILES accuracy', () => {
  it('car tenMeters', () => expect(TRACK_PROFILES.car.accuracy).toBe('tenMeters'));
  it('train hundredMeters', () => expect(TRACK_PROFILES.train.accuracy).toBe('hundredMeters'));
  it('foot best', () => expect(TRACK_PROFILES.foot.accuracy).toBe('best'));
  it('bike/ski/row best', () => {
    expect(TRACK_PROFILES.bike.accuracy).toBe('best');
    expect(TRACK_PROFILES.ski.accuracy).toBe('best');
    expect(TRACK_PROFILES.row.accuracy).toBe('best');
  });
  it('motorbike/bus tenMeters', () => {
    expect(TRACK_PROFILES.motorbike.accuracy).toBe('tenMeters');
    expect(TRACK_PROFILES.bus.accuracy).toBe('tenMeters');
  });
  it('ship/plane hundredMeters', () => {
    expect(TRACK_PROFILES.ship.accuracy).toBe('hundredMeters');
    expect(TRACK_PROFILES.plane.accuracy).toBe('hundredMeters');
  });
});

describe('isTrackerTrip', () => {
  it('true for tracker', () => expect(isTrackerTrip({ type: 'tracker' })).toBe(true));
  it('false for logbuch', () => expect(isTrackerTrip({ type: 'logbuch' })).toBe(false));
});
