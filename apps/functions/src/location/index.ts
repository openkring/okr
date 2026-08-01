import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';

import { runGateway } from '../_gateway/gateway';
import type { Attribution, GatewayContext } from '../_gateway/provider';
import {
  LOCATION_SECRETS,
  normaliseCoordParams,
  w3wToCoordsAdapter,
  coordsToW3wAdapter,
  gmapGeocodeAdapter,
  gmapReverseAdapter,
} from '../_gateway/adapters/location';

export interface ConvertLocationRequest {
  address?: string;
  lat?: number;
  lng?: number;
  what3words?: string;
}

export interface ConvertLocationResponse {
  address?: string;
  lat?: number;
  lng?: number;
  what3words?: string;
  /** Providers actually consulted for THIS response — additive, so a client that
   *  ignores it keeps working. Empty when everything came from the input. */
  attributions?: Attribution[];
}

// Each enrichment step is best-effort: log the real cause and carry on. A single
// external-API failure (invalid/partial w3w, expired key, rate-limit, monthly cap)
// must not abort the whole conversion or block the caller from saving the
// location. The gateway has already mapped the cause to an HttpsError and
// swallowed the transport detail, so there is nothing credential-bearing to leak
// here — but keep logging the message only, never the error object.
function logStepFailure(step: string, err: unknown): void {
  logger.warn(`convertLocation: ${step} failed`, {
    step,
    code: err instanceof HttpsError ? err.code : undefined,
    message: err instanceof Error ? err.message : String(err),
  });
}

/**
 * Address ↔ coordinates ↔ what3words conversion.
 *
 * Orchestrates up to four gateway-backed lookups; it is NOT a
 * `makeGatewayCallable` because the response merges several providers into one
 * location rather than returning a single provider's payload. Cache, quota,
 * retry, timeout and error mapping come from `runGateway` per step — see
 * `_gateway/adapters/location.ts` for the scope/TTL/cap rationale.
 *
 * The response shape is unchanged from the pre-gateway version apart from the
 * additive `attributions`, so no client change is required.
 */
export const convertLocation = onCall(
  {
    region: 'europe-west6',
    enforceAppCheck: true,
    secrets: LOCATION_SECRETS,
  },
  async (request: CallableRequest<ConvertLocationRequest>): Promise<ConvertLocationResponse> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const token = request.auth.token as Record<string, unknown> | undefined;
    // All four adapters are `shared`-scoped, so tenantId is never folded into a
    // cache key, and the per-caller window keys on uid. Resolving the tenant
    // would therefore buy nothing but a Firestore read per call — which is why
    // this builds the context directly instead of going through
    // makeGatewayCallable.
    const ctx: GatewayContext = {
      tenantId: '',
      uid: request.auth.uid,
      isAdmin: token?.['admin'] === true || token?.['contentAdmin'] === true,
    };

    const input = request.data;
    // treat 0,0 as "not set" — it is the LocationModel default, not a real coordinate
    const hasRealCoords = (input.lat !== 0 || input.lng !== 0) && input.lat != null && input.lng != null;
    const result: ConvertLocationResponse = {
      address: input.address?.trim() || undefined,
      lat: hasRealCoords ? input.lat : undefined,
      lng: hasRealCoords ? input.lng : undefined,
      what3words: input.what3words?.trim() || undefined,
    };

    const attributions: Attribution[] = [];
    const credit = (a: Attribution): void => {
      if (!attributions.some((x) => x.provider === a.provider)) attributions.push(a);
    };

    logger.info('convertLocation: start', {
      hasAddress: !!result.address,
      hasCoords: result.lat != null && result.lng != null,
      hasW3w: !!result.what3words,
    });

    // Step 1: w3w → coords (most precise when available)
    if (result.what3words && (result.lat == null || result.lng == null)) {
      try {
        const res = await runGateway(w3wToCoordsAdapter, { words: result.what3words }, ctx);
        if (res.data) {
          result.lat = res.data.lat;
          result.lng = res.data.lng;
          credit(res.attribution);
        }
      } catch (err: unknown) { logStepFailure('w3wToCoords', err); }
    }

    // Step 2: address → coords (if coords still missing)
    if (result.address && (result.lat == null || result.lng == null)) {
      try {
        const res = await runGateway(gmapGeocodeAdapter, { address: result.address }, ctx);
        if (res.data) {
          result.lat = res.data.lat;
          result.lng = res.data.lng;
          credit(res.attribution);
        }
      } catch (err: unknown) { logStepFailure('geocode', err); }
    }

    // Step 3: coords → address (if address missing)
    if (result.lat != null && result.lng != null && !result.address) {
      try {
        const res = await runGateway(gmapReverseAdapter, normaliseCoordParams({ lat: result.lat, lng: result.lng }), ctx);
        if (res.data) {
          result.address = res.data;
          credit(res.attribution);
        }
      } catch (err: unknown) { logStepFailure('reverseGeocode', err); }
    }

    // Step 4: coords → w3w (if w3w missing)
    if (result.lat != null && result.lng != null && !result.what3words) {
      try {
        const res = await runGateway(coordsToW3wAdapter, normaliseCoordParams({ lat: result.lat, lng: result.lng }), ctx);
        if (res.data) {
          result.what3words = res.data;
          credit(res.attribution);
        }
      } catch (err: unknown) { logStepFailure('coordsToW3w', err); }
    }

    if (attributions.length > 0) result.attributions = attributions;

    // Log the outcome, not the payload: a reverse-geocoded address is the one
    // field here that can identify a place a member chose.
    logger.info('convertLocation: result', {
      hasAddress: !!result.address,
      hasCoords: result.lat != null && result.lng != null,
      hasW3w: !!result.what3words,
      providers: attributions.map((a) => a.provider),
    });
    return result;
  }
);
