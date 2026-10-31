import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';

import type { TransitRouteReq, TransitRouteRes } from '@okr/mobility-tracker-util';
import { runGateway } from '../_gateway/gateway';
import type { GatewayContext } from '../_gateway/provider';
import { inSwitzerland } from '../_gateway/adapters/elevation';
import { ojpTripAdapter, OjpRouteParams } from '../_gateway/adapters/ojp';

const MODES = ['train', 'bus', 'ship'] as const;
/** a section longer than this is no single ride worth a timetable lookup */
const MAX_DURATION_MS = 12 * 60 * 60_000;

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
