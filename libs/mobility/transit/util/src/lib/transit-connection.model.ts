/** Spec 1.131 — public-transport connections between two points (OJP 2.0 `TripRequest`). */

export type LatLng = { lat: number; lng: number };

/** Whether the search time is the latest arrival or the earliest departure. */
export type TransitAnchor = 'arriveBy' | 'departAt';

/**
 * The mode switcher of the connections view (§3.4). `transit` is searched in the app, the other
 * three hand off to the device's maps app. Not `TransportMode` from `@okr/shared-models`: that one
 * names the modes of a recorded track (train, bus, ship, …).
 */
export type TravelMode = 'transit' | 'walk' | 'bike' | 'car';
export const TRAVEL_MODES: readonly TravelMode[] = ['transit', 'walk', 'bike', 'car'];

/** One part of a connection: a ride, a walk (to the first or from the last stop) or a change on foot. */
export interface TransitLeg {
  kind: 'ride' | 'walk' | 'transfer';
  /** the line as shown at the stop, e.g. «S8», «IR16», «Bus 70»; '' for walks */
  line: string;
  /** OJP PtMode of a ride (rail, bus, tram, water, …); '' for walks */
  ptMode: string;
  from: string;
  to: string;
  /** ISO instants as timetabled; '' when the leg has none (walks) */
  departure: string;
  arrival: string;
  /** realtime delay in whole minutes (estimated minus timetabled); 0 without realtime data */
  departureDelay: number;
  arrivalDelay: number;
  /** platform/quay of the departure, '' when unknown */
  platform: string;
  /** the direction shown on the vehicle, '' when unknown */
  direction: string;
  durationMinutes: number;
  cancelled: boolean;
}

export interface TransitConnection {
  /** ISO instants as timetabled, including walks to and from the stops */
  departure: string;
  arrival: string;
  durationMinutes: number;
  legs: TransitLeg[];
}

/** Request of the `planTrip` callable. */
export interface PlanTripReq {
  from: LatLng;
  to: LatLng;
  /** ISO instant */
  at: string;
  anchor: TransitAnchor;
  /** 1..5, default 3 */
  limit?: number;
}

/** Response of the `planTrip` callable; no connections = none found (or a point outside Switzerland). */
export interface PlanTripRes {
  connections: TransitConnection[];
  attribution: { provider: string; url: string };
}
