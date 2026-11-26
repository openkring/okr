// apps/functions/src/_gateway/index.ts
import { makeGatewayCallable } from './gateway';
import { zefixSearchAdapter, zefixDetailsAdapter } from './adapters/zefix';
import { searchChAdapter } from './adapters/searchch';
import { placesAdapter } from './adapters/places';

/** Retrofits — SAME callable names as before so the client is unchanged.
 *  Client still calls result.data.results / result.data.<field>; the gateway now
 *  nests the payload under `data` and adds attribution + freshness. */
export const zefixSearch = makeGatewayCallable(zefixSearchAdapter);
export const zefixGetByUid = makeGatewayCallable(zefixDetailsAdapter);

/** search.ch person lookup — same callable name, tenant-scoped cache, per-tenant
 *  key read from `app-secrets/{tenantId}` inside the adapter. */
export const searchChSearchPerson = makeGatewayCallable(searchChAdapter);

/** Place search for the diary (swisstopo SearchServer, shared cache 30 d). */
export const searchPlaces = makeGatewayCallable(placesAdapter);
