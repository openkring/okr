import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';

import type { TransitRouteReq, TransitRouteRes } from '@okr/mobility-tracker-util';
import type { PlanTripReq, PlanTripRes } from '@okr/mobility-transit-util';
import { runGateway } from '../_gateway/gateway';
import type { GatewayContext } from '../_gateway/provider';
import { inSwitzerland } from '../_gateway/adapters/elevation';
import { ojpTripAdapter, OjpRouteParams } from '../_gateway/adapters/ojp';
import { transitTripsAdapter, TransitTripsParams } from '../_gateway/adapters/transit-trips';

const MODES = ['train', 'bus', 'ship'] as const;
/** a section longer than this is no single ride worth a timetable lookup */
const MAX_DURATION_MS = 12 * 60 * 60_000;
/** `planTrip` searches from an hour ago (a late event) up to 60 days ahead (spec 1.131 §5.2) */
const PLAN_PAST_MS = 60 * 60_000;
const PLAN_FUTURE_MS = 60 * 24 * 60 * 60_000;
const PLAN_DEFAULT_LIMIT = 3;
const PLAN_MAX_LIMIT = 5;

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
  { region: 'europe-west6', enforceAppCheck: true, secrets: ojpTripAdapter.secrets },
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
