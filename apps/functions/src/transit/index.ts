import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';

import type { TransitRouteReq, TransitRouteRes } from '@okr/mobility-tracker-util';
import type { DeparturesReq, DeparturesRes, PlanTripReq, PlanTripRes, SearchStopsReq, SearchStopsRes } from '@okr/mobility-transit-util';
import { runGateway } from '../_gateway/gateway';
import type { GatewayContext } from '../_gateway/provider';
import { inSwitzerland } from '../_gateway/adapters/elevation';
import { ojpTripAdapter, OjpRouteParams } from '../_gateway/adapters/ojp';
import { transitTripsAdapter, TransitTripsParams } from '../_gateway/adapters/transit-trips';
import { transitDeparturesAdapter, TransitDeparturesParams } from '../_gateway/adapters/transit-departures';
import { transitStopsAdapter, TransitStopsParams } from '../_gateway/adapters/transit-stops';

const MODES = ['train', 'bus', 'ship'] as const;
/** a section longer than this is no single ride worth a timetable lookup */
const MAX_DURATION_MS = 12 * 60 * 60_000;
/** `planTrip` searches from an hour ago (a late event) up to 60 days ahead (spec 1.131 §5.2) */
const PLAN_PAST_MS = 60 * 60_000;
const PLAN_FUTURE_MS = 60 * 24 * 60 * 60_000;
const PLAN_DEFAULT_LIMIT = 3;
const PLAN_MAX_LIMIT = 5;
const STOPS_DEFAULT_RADIUS_M = 1000;
const STOPS_MAX_RADIUS_M = 2000;
const STOPS_DEFAULT_LIMIT = 10;
const STOPS_MAX_LIMIT = 20;
const STOPS_QUERY_MAX = 80;
const DEPARTURES_DEFAULT_LIMIT = 10;
const DEPARTURES_MAX_LIMIT = 20;
/** a Swiss stop id: `ch:1:sloid:88139` (optionally with quay parts) or the 7-digit DiDok code `8503000` */
const STOP_REF = /^(ch:1:sloid:\d+(:[0-9A-Za-z]+)*|\d{7})$/;

function point(v: unknown, name: string): { lat: number; lng: number } {
  const { lat, lng } = (v ?? {}) as { lat?: unknown; lng?: unknown };
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new HttpsError('invalid-argument', `${name}: lat/lng out of range`);
  }
  return { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };
}

/** The request checked; points rounded to 5 decimals, times normalised, so cache key and upstream call agree. */
export function validRoute(data: unknown): OjpRouteParams {
  const d = (data ?? {}) as Partial<TransitRouteReq>;
  if (!MODES.includes(d.mode as (typeof MODES)[number])) throw new HttpsError('invalid-argument', 'mode: train, bus or ship expected');
  const start = Date.parse(String(d.startedAt));
  const end = Date.parse(String(d.endedAt));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > MAX_DURATION_MS) {
    throw new HttpsError('invalid-argument', 'startedAt/endedAt invalid');
  }
  return {
    mode: d.mode as OjpRouteParams['mode'],
    from: point(d.from, 'from'),
    to: point(d.to, 'to'),
    startedAt: new Date(start).toISOString(),
    endedAt: new Date(end).toISOString(),
  };
}

/**
 * The line of a recorded train, bus or ship section (spec 1.129 §4.2): the connection of the Swiss timetable (OJP
 * 2.0) that fits the section's ends and times. Outside Switzerland, or when nothing fits, the answer has no points
 * and the app keeps the dashed line. Cache (per user: a route is personal data), quota, retry and timeout come from
 * `runGateway`. The points are never logged.
 */
export const getTransitRoute = onCall(
  // 512MiB: a long multi-change trip's OJP answer (6 results with leg projection) went past 256MiB (2026-10-31, 11-02)
  { region: 'europe-west6', enforceAppCheck: true, secrets: ojpTripAdapter.secrets, memory: '512MiB' },
  async (request: CallableRequest<TransitRouteReq>): Promise<TransitRouteRes> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'User must be authenticated');
    const token = request.auth.token as Record<string, unknown> | undefined;
    // user-scoped adapter: the tenant is never part of the cache key, so it is not resolved (saves a read)
    const ctx: GatewayContext = {
      tenantId: '',
      uid: request.auth.uid,
      isAdmin: token?.['admin'] === true || token?.['contentAdmin'] === true,
    };
    const params = validRoute(request.data);
    const attribution = { provider: ojpTripAdapter.attribution.provider, url: ojpTripAdapter.attribution.url };
    if (!inSwitzerland(params.from) || !inSwitzerland(params.to)) return { points: [], line: '', attribution };
    const res = await runGateway(ojpTripAdapter, params, ctx);
    return { points: res.data.points, line: res.data.line, attribution };
  },
);

/** The `planTrip` request checked; points rounded like `validRoute`, `at` normalised and kept in the window. */
export function validPlan(data: unknown, now = Date.now()): TransitTripsParams {
  const d = (data ?? {}) as Partial<PlanTripReq>;
  if (d.anchor !== 'arriveBy' && d.anchor !== 'departAt') throw new HttpsError('invalid-argument', 'anchor: arriveBy or departAt expected');
  const at = Date.parse(String(d.at));
  if (!Number.isFinite(at) || at < now - PLAN_PAST_MS || at > now + PLAN_FUTURE_MS) {
    throw new HttpsError('invalid-argument', 'at: an ISO time from an hour ago up to 60 days ahead expected');
  }
  const limit = d.limit === undefined ? PLAN_DEFAULT_LIMIT : Number(d.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > PLAN_MAX_LIMIT) throw new HttpsError('invalid-argument', 'limit: 1..5 expected');
  // whole minutes: OJP answers per minute, and the cache key stays stable over a few seconds
  const minute = Math.floor(at / 60_000) * 60_000;
  return { from: point(d.from, 'from'), to: point(d.to, 'to'), at: new Date(minute).toISOString(), anchor: d.anchor, limit };
}

/**
 * Public-transport connections between two points (spec 1.131 §5.2): OJP 2.0 TripRequest by arrival or departure
 * time. Takes coordinates only — whether they came from a saved location or the device is the client's business.
 * Outside Switzerland the answer is empty. Cache (per user: the source is usually the viewer's position), quota,
 * retry and timeout come from `runGateway`. The points are never logged.
 */
export const planTrip = onCall(
  { region: 'europe-west6', enforceAppCheck: true, secrets: transitTripsAdapter.secrets },
  async (request: CallableRequest<PlanTripReq>): Promise<PlanTripRes> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'User must be authenticated');
    const token = request.auth.token as Record<string, unknown> | undefined;
    // user-scoped adapter: the tenant is never part of the cache key, so it is not resolved (saves a read)
    const ctx: GatewayContext = {
      tenantId: '',
      uid: request.auth.uid,
      isAdmin: token?.['admin'] === true || token?.['contentAdmin'] === true,
    };
    const params = validPlan(request.data);
    const attribution = { provider: transitTripsAdapter.attribution.provider, url: transitTripsAdapter.attribution.url };
    if (!inSwitzerland(params.from) || !inSwitzerland(params.to)) return { connections: [], attribution };
    const res = await runGateway(transitTripsAdapter, params, ctx);
    return { connections: res.data, attribution };
  },
);

/** The tenant-free context of a shared adapter: the cache key never holds the tenant, so it is not resolved. */
function sharedContext(request: CallableRequest<unknown>): GatewayContext {
  if (!request.auth) throw new HttpsError('unauthenticated', 'User must be authenticated');
  const token = request.auth.token as Record<string, unknown> | undefined;
  return { tenantId: '', uid: request.auth.uid, isAdmin: token?.['admin'] === true || token?.['contentAdmin'] === true };
}

function intIn(v: unknown, fallback: number, max: number, name: string): number {
  const n = v === undefined ? fallback : Number(v);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new HttpsError('invalid-argument', `${name}: 1..${max} expected`);
  return n;
}

/**
 * The `searchStops` request checked: either `near` (rounded to 4 decimals, about 10 m, so the boards of one place
 * share a cache entry; radius capped) or a trimmed, length-capped `query`.
 */
export function validStops(data: unknown): TransitStopsParams {
  const d = (data ?? {}) as Partial<SearchStopsReq>;
  const limit = intIn(d.limit, STOPS_DEFAULT_LIMIT, STOPS_MAX_LIMIT, 'limit');
  if (d.near !== undefined) {
    const p = point(d.near, 'near');
    const radius = d.near.radiusM === undefined ? STOPS_DEFAULT_RADIUS_M : Number(d.near.radiusM);
    if (!Number.isFinite(radius) || radius <= 0) throw new HttpsError('invalid-argument', 'near.radiusM: a positive number expected');
    return {
      near: { lat: Math.round(p.lat * 1e4) / 1e4, lng: Math.round(p.lng * 1e4) / 1e4, radiusM: Math.min(Math.round(radius), STOPS_MAX_RADIUS_M) },
      limit,
    };
  }
  const query = typeof d.query === 'string' ? d.query.trim().slice(0, STOPS_QUERY_MAX) : '';
  if (query.length < 2) throw new HttpsError('invalid-argument', 'near or a query of at least 2 characters expected');
  return { query, limit };
}

/**
 * Public-transport stops near a point or by name (spec 1.130 §5.2), from the Swiss timetable (OJP 2.0). A point
 * outside Switzerland finds nothing. Shared cache (30 days), quota, retry and timeout come from `runGateway`.
 */
export const searchStops = onCall(
  { region: 'europe-west6', enforceAppCheck: true, secrets: transitStopsAdapter.secrets },
  async (request: CallableRequest<SearchStopsReq>): Promise<SearchStopsRes> => {
    const ctx = sharedContext(request);
    const params = validStops(request.data);
    const attribution = { provider: transitStopsAdapter.attribution.provider, url: transitStopsAdapter.attribution.url };
    if (params.near && !inSwitzerland(params.near)) return { stops: [], attribution };
    const res = await runGateway(transitStopsAdapter, params, ctx);
    return { stops: res.data, attribution };
  },
);

/** The `getDepartures` request checked: a Swiss stop id and the number of departures the caller wants. */
export function validDepartures(data: unknown): TransitDeparturesParams & { limit: number } {
  const d = (data ?? {}) as Partial<DeparturesReq>;
  const stopRef = typeof d.stopRef === 'string' ? d.stopRef.trim() : '';
  if (!STOP_REF.test(stopRef)) throw new HttpsError('invalid-argument', 'stopRef: a Swiss stop id expected');
  return { stopRef, limit: intIn(d.limit, DEPARTURES_DEFAULT_LIMIT, DEPARTURES_MAX_LIMIT, 'limit') };
}

/**
 * The next departures at a stop with realtime data and the disruption messages that concern it (spec 1.130 §5.2):
 * OJP 2.0 StopEventRequest. The adapter always fetches the same number of departures, so the cache entry is per
 * stop and shared by every viewer; the limit is applied here, after the cache.
 */
export const getDepartures = onCall(
  { region: 'europe-west6', enforceAppCheck: true, secrets: transitDeparturesAdapter.secrets },
  async (request: CallableRequest<DeparturesReq>): Promise<DeparturesRes> => {
    const ctx = sharedContext(request);
    const { stopRef, limit } = validDepartures(request.data);
    const res = await runGateway(transitDeparturesAdapter, { stopRef }, ctx);
    const departures = res.data.departures.slice(0, limit);
    // only the situations still referenced, plus those of the stop itself (referenced by no departure at all)
    const referenced = new Set(res.data.departures.flatMap((d) => d.situationIds));
    const kept = new Set(departures.flatMap((d) => d.situationIds));
    const situations = res.data.situations.filter((s) => kept.has(s.id) || !referenced.has(s.id));
    return {
      stopName: res.data.stopName,
      departures,
      situations,
      fetchedAt: res.data.fetchedAt,
      attribution: { provider: transitDeparturesAdapter.attribution.provider, url: transitDeparturesAdapter.attribution.url },
    };
  },
);
