import { describe, expect, it } from 'vitest';
import { TRACK_PROFILES, isTrackerTrip } from './track-profile.util';

describe('TRACK_PROFILES', () => {
  it('foot', () => expect(TRACK_PROFILES.foot).toEqual({ distanceFilter: 10, minIntervalMs: 5000, gps: true }));
  it('ski matches bike', () => expect(TRACK_PROFILES.ski.distanceFilter).toBe(TRACK_PROFILES.bike.distanceFilter));
  it('motorbike matches car', () => expect(TRACK_PROFILES.motorbike.distanceFilter).toBe(TRACK_PROFILES.car.distanceFilter));
  it('plane has no gps', () => expect(TRACK_PROFILES.plane.gps).toBe(false));
});

describe('isTrackerTrip', () => {
  it('true for tracker', () => expect(isTrackerTrip({ type: 'tracker' })).toBe(true));
  it('false for logbuch', () => expect(isTrackerTrip({ type: 'logbuch' })).toBe(false));
});
