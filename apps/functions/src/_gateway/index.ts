// apps/functions/src/_gateway/index.ts
import { makeGatewayCallable } from './gateway';
import { oecdAdapter } from './adapters/oecd';
import { zefixSearchAdapter, zefixDetailsAdapter } from './adapters/zefix';

/** New consumer (2.59). Client sends OecdParams, receives GatewayResult<OecdData>. */
export const oecdQuery = makeGatewayCallable(oecdAdapter);

/** Retrofits — SAME callable names as before so the client is unchanged.
 *  Client still calls result.data.results / result.data.<field>; the gateway now
 *  nests the payload under `data` and adds attribution + freshness. */
export const zefixSearch = makeGatewayCallable(zefixSearchAdapter);
export const zefixGetByUid = makeGatewayCallable(zefixDetailsAdapter);
