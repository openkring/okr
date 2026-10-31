/** Spec 1.130 — live departures at a stop (OJP 2.0 `StopEventRequest`) and the stops near a point. */

import type { LatLng } from './transit-connection.model';

/** A public-transport stop (a «StopPlace» in OJP, e.g. «Stäfa, Strandbad»). */
export interface TransitStop {
  /** Swiss stop id: `ch:1:sloid:88139` or the numeric DiDok code `8503000` */
  stopRef: string;
  name: string;
  lat: number;
  lng: number;
  /** straight-line distance from the searched point; absent for a search by name */
  distanceM?: number;
}

/** Request of the `searchStops` callable: stops near a point, or by name. */
export interface SearchStopsReq {
  near?: LatLng & { radiusM?: number };
  query?: string;
  /** 1..20, default 10 */
  limit?: number;
}

export interface SearchStopsRes {
  /** nearest first for `near`, OJP's order for `query` */
  stops: TransitStop[];
  attribution: { provider: string; url: string };
}

export type DepartureMode = 'train' | 'bus' | 'tram' | 'ship' | 'cableway' | 'other';

export interface TransitDeparture {
  /** the line as shown at the stop: «S7», «IC3», «925» */
  line: string;
  mode: DepartureMode;
  destination: string;
  /** platform or bus bay, the realtime one when it changed; '' when unknown */
  quay: string;
  /** ISO instant as timetabled */
  plannedAt: string;
  /** ISO instant with realtime data; '' without */
  estimatedAt: string;
  cancelled: boolean;
  /** ids of the `situations` of the answer that concern this departure */
  situationIds: string[];
}

/**
 * A disruption message (SIRI-SX «PtSituation»), e.g. construction work on a line. Texts come as the
 * operator wrote them, today German only.
 */
export interface TransitSituation {
  id: string;
  summary: string;
  /** reason, duration and recommendation, each a sentence; '' when the message has none */
  detail: string;
  /** SIRI priority, 1 = most important; 0 when not given */
  priority: number;
  /** true when the situation is in force right now (inside one of its validity periods) */
  active: boolean;
  /** true for announced work, false for an unplanned incident */
  planned: boolean;
}

/** Request of the `getDepartures` callable. */
export interface DeparturesReq {
  stopRef: string;
  /** 1..20, default 10 */
  limit?: number;
}

export interface DeparturesRes {
  stopName: string;
  departures: TransitDeparture[];
  /** the published situations at the stop or of the departures, most important first */
  situations: TransitSituation[];
  /** ISO instant of the upstream answer (the cache may be up to 45 s old) */
  fetchedAt: string;
  attribution: { provider: string; url: string };
}
