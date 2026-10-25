import type { TransportMode, TripModel } from '@okr/shared-models';
import { TRACKER_TRIP_TYPE } from '@okr/shared-models';

export type TrackAccuracy = 'best' | 'tenMeters' | 'hundredMeters';

export interface TrackProfile {
  distanceFilter: number; // metres between location fixes
  minIntervalMs?: number; // minimum gap between fixes
  gps: boolean; // false: no GPS, great-circle between last point before and first after
  accuracy: TrackAccuracy; // desired location accuracy
}

/** Recording profiles per mode (design §5.2). */
export const TRACK_PROFILES: Record<TransportMode, TrackProfile> = {
  foot: { distanceFilter: 10, minIntervalMs: 5000, gps: true, accuracy: 'best' },
  bike: { distanceFilter: 25, gps: true, accuracy: 'best' },
  ski: { distanceFilter: 25, gps: true, accuracy: 'best' },
  row: { distanceFilter: 15, gps: true, accuracy: 'best' },
  car: { distanceFilter: 100, gps: true, accuracy: 'tenMeters' },
  motorbike: { distanceFilter: 100, gps: true, accuracy: 'tenMeters' },
  bus: { distanceFilter: 100, gps: true, accuracy: 'tenMeters' },
  train: { distanceFilter: 200, gps: true, accuracy: 'hundredMeters' },
  ship: { distanceFilter: 200, minIntervalMs: 60000, gps: true, accuracy: 'hundredMeters' },
  plane: { distanceFilter: 0, gps: false, accuracy: 'hundredMeters' },
};

export function isTrackerTrip(trip: Pick<TripModel, 'type'>): boolean {
  return trip.type === TRACKER_TRIP_TYPE;
}
