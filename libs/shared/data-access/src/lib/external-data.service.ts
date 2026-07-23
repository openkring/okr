import { Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

/** Mirrors the server GatewayResult<M>. */
export interface ExternalDataResult<M> {
  data: M;
  attribution: { provider: string; url: string; licence?: string; disclaimer?: string };
  sourceTimestamp: string | null;
  cached: boolean;
  stale?: boolean;
}

/**
 * Single client for every read-through gateway provider. Features call this
 * instead of hand-rolling a callable, and get attribution + freshness for free.
 */
@Injectable({ providedIn: 'root' })
export class ExternalDataService {
  private readonly functions = getFunctions(getApp(), 'europe-west6');

  /** Invoke a gateway callable by its operation id (== the exported callable name). */
  async call<P, M>(operation: string, params: P): Promise<ExternalDataResult<M>> {
    const fn = httpsCallable<P, ExternalDataResult<M>>(this.functions, operation);
    const res = await fn(params);
    return res.data;
  }
}

// --- OECD typed shapes (mirror adapters/oecd.ts) ---
export interface OecdParams {
  dataflowId: string;
  filter?: string;
  startPeriod?: string;
  endPeriod?: string;
  tenantId?: string;
}
export interface OecdObservation {
  period: string;
  value: number | null;
  dimensions: Record<string, string>;
}
export interface OecdData {
  observations: OecdObservation[];
  dimensions: { id: string; name: string }[];
}
