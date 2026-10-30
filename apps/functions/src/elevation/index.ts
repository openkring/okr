import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';

import type { TerrainElevationsReq, TerrainElevationsRes } from '@okr/mobility-tracker-util';
import { runGateway } from '../_gateway/gateway';
import type { GatewayContext } from '../_gateway/provider';
import { ElevationParams, inSwitzerland, openMeteoElevationAdapter, swisstopoElevationAdapter } from '../_gateway/adapters/elevation';

/** TERRAIN_MAX_SAMPLES of the tracker util; also Open-Meteo's limit per request. */
const MAX_POINTS = 100;
/** swisstopo leaving more than this share without a height (the box reaches beyond the border) → Open-Meteo instead. */
const MAX_MISSING = 0.1;

/** The request's points, checked and rounded to 5 decimals (~1 m) so cache key and upstream call always agree. */
export function validPoints(data: unknown): ElevationParams['points'] {
  const points = (data as Partial<TerrainElevationsReq> | undefined)?.points;
  if (!Array.isArray(points) || points.length < 2 || points.length > MAX_POINTS) {
    throw new HttpsError('invalid-argument', `points: 2–${MAX_POINTS} expected`);
  }
  return points.map((p: unknown) => {
    const { lat, lng } = (p ?? {}) as { lat?: unknown; lng?: unknown };
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new HttpsError('invalid-argument', 'points: lat/lng out of range');
    }
    return { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };
  });
}

/** Too many points without a height to trust the answer. */
export function tooSparse(alts: (number | null)[]): boolean {
  return alts.filter((a) => a === null).length > alts.length * MAX_MISSING;
}

/**
 * Terrain heights for the sampled points of a recorded Strecke (spec 1.128 §2, §5): swisstopo when every point
 * lies in Switzerland, Open-Meteo otherwise and when swisstopo fails or answers too sparsely. An orchestrator over
 * two gateway adapters like `convertLocation` — cache (per user: a route is personal data), quota, retry and
 * timeout come from `runGateway`. The points are never logged.
 */
export const getTerrainElevations = onCall(
  { region: 'europe-west6', enforceAppCheck: true },
  async (request: CallableRequest<TerrainElevationsReq>): Promise<TerrainElevationsRes> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'User must be authenticated');
    const token = request.auth.token as Record<string, unknown> | undefined;
    // user-scoped adapters: the tenant is never part of a cache key, so it is not resolved (saves a read)
    const ctx: GatewayContext = {
      tenantId: '',
      uid: request.auth.uid,
      isAdmin: token?.['admin'] === true || token?.['contentAdmin'] === true,
    };
    const params: ElevationParams = { points: validPoints(request.data) };

    if (params.points.every(inSwitzerland)) {
      try {
        const res = await runGateway(swisstopoElevationAdapter, params, ctx);
        if (!tooSparse(res.data)) return { alts: res.data, attribution: { provider: res.attribution.provider, url: res.attribution.url } };
        logger.info('getTerrainElevations: swisstopo too sparse, trying Open-Meteo', { count: params.points.length });
      } catch (err: unknown) {
        logger.warn('getTerrainElevations: swisstopo failed, trying Open-Meteo', {
          code: err instanceof HttpsError ? err.code : undefined,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    const res = await runGateway(openMeteoElevationAdapter, params, ctx);
    return { alts: res.data, attribution: { provider: res.attribution.provider, url: res.attribution.url } };
  },
);
