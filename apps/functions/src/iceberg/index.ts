import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';

import type { IcebergsRes } from '@okr/travel-journal-util';
import { runGateway } from '../_gateway/gateway';
import type { GatewayContext } from '../_gateway/provider';
import { byuIcebergsAdapter } from '../_gateway/adapters/icebergs';

/**
 * Current Antarctic iceberg positions for the «Eisberge» layer of the travel journal map (spec 2.122). No schedule:
 * the client calls this when the layer is switched on; the gateway serves the shared cache and fetches BYU again only
 * when it is older than 30 days (or serves the stale snapshot when BYU is down).
 */
export const getIcebergs = onCall(
  { region: 'europe-west6', enforceAppCheck: true },
  async (request: CallableRequest<unknown>): Promise<IcebergsRes> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'User must be authenticated');
    const token = request.auth.token as Record<string, unknown> | undefined;
    // shared adapter: the tenant is never part of the cache key, so it is not resolved (saves a read)
    const ctx: GatewayContext = {
      tenantId: '',
      uid: request.auth.uid,
      isAdmin: token?.['admin'] === true || token?.['contentAdmin'] === true,
    };
    const res = await runGateway(byuIcebergsAdapter, {}, ctx);
    return {
      ...res.data,
      attribution: { provider: res.attribution.provider, url: res.attribution.url },
      stale: res.stale === true,
    };
  },
);
