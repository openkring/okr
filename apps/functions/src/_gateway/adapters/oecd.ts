// apps/functions/src/_gateway/adapters/oecd.ts
//
// OECD SDMX-JSON adapter — first consumer of the gateway. Open data (no secret),
// shared cache. Historical observations are immutable; the latest period may be
// revised, so a 24h TTL keeps it simple and safe.

import type { ProviderAdapter, GatewayContext } from '../provider';
import { gatewayFetch } from '../http';

export interface OecdParams {
  /** SDMX dataflow ref, e.g. 'DSD_EO@DF_EO' or 'OECD.ECO.MAD,DSD_EO@DF_EO,1.0'. */
  dataflowId: string;
  /** Dimension filter, e.g. 'CHE.GDP'. Defaults to 'all'. */
  filter?: string;
  startPeriod?: string;
  endPeriod?: string;
  /** Optional tenant tag (ignored for shared open data; present for the callable ctx). */
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

// --- SDMX-JSON shape (only the fields we read) ---
interface SdmxDimValue { id: string; name?: string }
interface SdmxDim { id: string; name?: string; values: SdmxDimValue[] }
interface SdmxRaw {
  meta?: { prepared?: string };
  data?: {
    structures?: { dimensions?: { observation?: SdmxDim[] } }[];
    dataSets?: { observations?: Record<string, (number | null)[]> }[];
  };
}

const BASE_URL = 'https://sdmx.oecd.org/public/rest';

export function oecdUrl(p: OecdParams): string {
  const filter = p.filter && p.filter.trim().length > 0 ? p.filter.trim() : 'all';
  const qs = new URLSearchParams({ format: 'jsondata', dimensionAtObservation: 'AllDimensions' });
  if (p.startPeriod) qs.set('startPeriod', p.startPeriod);
  if (p.endPeriod) qs.set('endPeriod', p.endPeriod);
  return `${BASE_URL}/data/${p.dataflowId}/${filter}?${qs.toString()}`;
}

export function oecdSourceTimestamp(raw: SdmxRaw): string | null {
  return raw.meta?.prepared ?? null;
}

export function mapOecd(raw: SdmxRaw): OecdData {
  const dims = raw.data?.structures?.[0]?.dimensions?.observation ?? [];
  const obs = raw.data?.dataSets?.[0]?.observations ?? {};
  const timeIdx = dims.findIndex((d) => d.id === 'TIME_PERIOD');

  const observations: OecdObservation[] = Object.entries(obs).map(([key, arr]) => {
    const idx = key.split(':').map(Number);
    const dimensions: Record<string, string> = {};
    dims.forEach((d, i) => {
      dimensions[d.id] = d.values[idx[i]]?.id ?? '';
    });
    const period = timeIdx >= 0 ? dims[timeIdx].values[idx[timeIdx]]?.id ?? '' : '';
    const value = arr && arr.length > 0 ? arr[0] : null;
    return { period, value, dimensions };
  });

  return { observations, dimensions: dims.map((d) => ({ id: d.id, name: d.name ?? d.id })) };
}

export const oecdAdapter: ProviderAdapter<OecdParams, SdmxRaw, OecdData> = {
  id: 'oecd',
  baseUrl: BASE_URL,
  secrets: [],
  scope: 'shared',
  ttlSeconds: 24 * 60 * 60, // 24h — historical is immutable; latest period may revise
  requiresAuth: true,
  monthlyCap: 50_000,
  attribution: {
    provider: 'OECD',
    url: 'https://data-explorer.oecd.org/',
    licence: 'OECD Terms and Conditions',
  },
  async fetch(params: OecdParams, _ctx: GatewayContext): Promise<SdmxRaw> {
    const res = await gatewayFetch<SdmxRaw>(oecdUrl(params), {
      method: 'GET',
      headers: { Accept: 'application/vnd.sdmx.data+json; charset=utf-8; version=2' },
      timeoutMs: 15_000,
    });
    return res.data;
  },
  map: mapOecd,
  sourceTimestamp: oecdSourceTimestamp,
};
