import type { TransportMode, TripModel } from '@okr/shared-models';
import { TRACKER_TRIP_TYPE } from '@okr/shared-models';

export interface TrackProfile {
  distanceFilter: number; // metres between location fixes
  minIntervalMs?: number; // minimum gap between fixes
  gps: boolean; // false: no GPS, great-circle between last point before and first after
}

/** Recording profiles per mode (design §5.2). */
export const TRACK_PROFILES: Record<TransportMode, TrackProfile> = {
  foot: { distanceFilter: 10, minIntervalMs: 5000, gps: true },
  bike: { distanceFilter: 25, gps: true },
  ski: { distanceFilter: 25, gps: true },
  row: { distanceFilter: 15, gps: true },
  car: { distanceFilter: 100, gps: true },
  motorbike: { distanceFilter: 100, gps: true },
  bus: { distanceFilter: 100, gps: true },
  train: { distanceFilter: 200, gps: true },
  ship: { distanceFilter: 200, minIntervalMs: 60000, gps: true },
  plane: { distanceFilter: 0, gps: false },
};

export function isTrackerTrip(trip: Pick<TripModel, 'type'>): boolean {
  return trip.type === TRACKER_TRIP_TYPE;
}
