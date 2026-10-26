/**
 * zefix — one router callable beside zefixSearch / zefixGetByUid (TOC 3.41, A8).
 *
 * Each op runs the same gateway handler as its stand-alone callable (auth check, tenant context,
 * cache, quota). `searchChSearchPerson` stays separate: it would gain the Zefix credentials.
 */
import { makeOpRouter, type OpHandler } from '../_router';
import { makeGatewayHandler } from './gateway';
import { zefixDetailsAdapter, zefixSearchAdapter } from './adapters/zefix';

export const ZEFIX_OPS: Record<string, OpHandler> = {
  zefixSearch: makeGatewayHandler(zefixSearchAdapter) as OpHandler,
  zefixGetByUid: makeGatewayHandler(zefixDetailsAdapter) as OpHandler,
};

export const ZEFIX_OPTIONS = {
  cors: true,
  region: 'europe-west6',
  enforceAppCheck: true,
  secrets: zefixSearchAdapter.secrets,
};

export const zefix = makeOpRouter('zefix', ZEFIX_OPTIONS, ZEFIX_OPS);
