// apps/functions/src/_gateway/adapters/ojp.ts
//
// Swiss public transport line geometry for `getTransitRoute` (spec 1.129 §4.2):
// an OJP 2.0 TripRequest (opentransportdata.swiss) from the first to the last
// point of a recorded train/bus/ship section, with leg projection. The trip
// whose public-transport legs fit the section's times best wins; the geometry
// of those legs replaces the straight lines between the few recorded points.
//
// scope: 'user'. The two points and times are part of a recorded route —
// personal data — so a cache entry is never shared. TTL 30 days: a past
// connection does not change.
//
// Free plan: 50 requests per minute and 20'000 per day and API key; above that
// costs are incurred, so the monthly cap stays well below.

import { defineSecret } from 'firebase-functions/params';
import { XMLParser } from 'fast-xml-parser';
import type { TransportMode } from '@okr/shared-models';
import type { ProviderAdapter } from '../provider';
import { gatewayFetch } from '../http';

const ojpApiKey = defineSecret('OJP_APIKEY');

const OJP_URL = 'https://api.opentransportdata.swiss/ojp20';
const REQUESTOR_REF = 'okr_prod';
const DAY = 24 * 60 * 60;
/** a connection may leave this long before the section's first point (detection lags behind the departure) */
const EARLY_MS = 15 * 60_000;
const NUMBER_OF_RESULTS = 6;
/** a trip whose legs miss the section's times by more than this (summed, departure + arrival) is no match */
const MAX_TIME_MISS_MS = 20 * 60_000;

export interface OjpRouteParams {
  mode: TransportMode;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  startedAt: string;
  endedAt: string;
}

export interface OjpRoute {
  points: { lat: number; lng: number }[];
  line: string;
}

/** OJP PtMode values that count as the recorded mode. */
const PT_MODES: Partial<Record<TransportMode, string[]>> = {
  train: ['rail', 'urbanRail', 'metro', 'tram'],
  bus: ['bus', 'coach', 'trolleyBus'],
  ship: ['water'],
};

function xmlEscape(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The TripRequest; times in UTC with seconds (OJP takes its local time on any other format). */
export function tripRequestXml(p: OjpRouteParams, now = new Date()): string {
  const dep = new Date(Date.parse(p.startedAt) - EARLY_MS).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const ts = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const place = (q: { lat: number; lng: number }) =>
    `<PlaceRef><GeoPosition><siri:Longitude>${q.lng}</siri:Longitude><siri:Latitude>${q.lat}</siri:Latitude></GeoPosition></PlaceRef>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<OJP xmlns="http://www.vdv.de/ojp" xmlns:siri="http://www.siri.org.uk/siri" version="2.0">
  <OJPRequest>
    <siri:ServiceRequest>
      <siri:RequestTimestamp>${ts}</siri:RequestTimestamp>
      <siri:RequestorRef>${xmlEscape(REQUESTOR_REF)}</siri:RequestorRef>
      <OJPTripRequest>
        <siri:RequestTimestamp>${ts}</siri:RequestTimestamp>
        <siri:MessageIdentifier>TR-${now.getTime()}</siri:MessageIdentifier>
        <Origin>${place(p.from)}<DepArrTime>${dep}</DepArrTime></Origin>
        <Destination>${place(p.to)}</Destination>
        <Params>
          <NumberOfResults>${NUMBER_OF_RESULTS}</NumberOfResults>
          <IncludeLegProjection>true</IncludeLegProjection>
        </Params>
      </OJPTripRequest>
    </siri:ServiceRequest>
  </OJPRequest>
</OJP>`;
}

const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, trimValues: true, parseTagValue: false });

type Node = Record<string, unknown>;

function list(v: unknown): Node[] {
  if (v === undefined || v === null) return [];
  return (Array.isArray(v) ? v : [v]).filter((x): x is Node => typeof x === 'object' && x !== null);
}

/** The first value found under `key` anywhere below `node` (depth first). */
function find(node: unknown, key: string): unknown {
  if (typeof node !== 'object' || node === null) return undefined;
  if (Array.isArray(node)) {
    for (const n of node) {
      const v = find(n, key);
      if (v !== undefined) return v;
    }
    return undefined;
  }
  const obj = node as Node;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) {
    const hit = find(v, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** Every object with siri Longitude + Latitude below `node`, in document order. */
function positions(node: unknown, out: { lat: number; lng: number }[] = []): { lat: number; lng: number }[] {
  if (typeof node !== 'object' || node === null) return out;
  if (Array.isArray(node)) {
    for (const n of node) positions(n, out);
    return out;
  }
  const obj = node as Node;
  const lat = Number(obj['Latitude']);
  const lng = Number(obj['Longitude']);
  if ('Latitude' in obj && 'Longitude' in obj && Number.isFinite(lat) && Number.isFinite(lng)) {
    out.push({ lat, lng });
    return out;
  }
  for (const v of Object.values(obj)) positions(v, out);
  return out;
}

function text(v: unknown): string {
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (v && typeof v === 'object' && 'Text' in (v as Node)) return text((v as Node)['Text']);
  return '';
}

/** Estimated time if given, else the timetable's; NaN when missing. */
function legTime(serviceTime: unknown): number {
  const est = find(serviceTime, 'EstimatedTime');
  const tt = find(serviceTime, 'TimetabledTime');
  return Date.parse(text(est) || text(tt));
}

interface TimedLeg { mode: string; board: number; alight: number; line: string; points: { lat: number; lng: number }[] }

function timedLegs(trip: Node): TimedLeg[] {
  return list(trip['Leg']).flatMap((leg) => list(leg['TimedLeg'])).map((tl) => {
    const service = tl['Service'] as Node | undefined;
    const mode = text(find(service, 'PtMode'));
    const line = [text(find(service, 'PublishedServiceName')), text(find(service, 'PublishedLineName'))].filter(Boolean)[0] ?? '';
    return {
      mode,
      board: legTime(find(tl['LegBoard'], 'ServiceDeparture')),
      alight: legTime(find(tl['LegAlight'], 'ServiceArrival')),
      line,
      points: positions(tl['LegTrack']),
    };
  });
}

/**
 * The route of the trip that fits the section best (spec 1.129 §4.2): its public-transport legs of the recorded
 * mode, scored by how far the first boarding and the last alighting miss the section's start and end. Legs of other
 * modes in the same trip (a walk to the stop, a change to a bus) are left out. Empty when nothing fits.
 */
export function routeFromTripResponse(xml: string, p: OjpRouteParams): OjpRoute {
  const wanted = PT_MODES[p.mode] ?? [];
  const start = Date.parse(p.startedAt);
  const end = Date.parse(p.endedAt);
  const doc = parser.parse(xml) as unknown;
  const delivery = find(doc, 'OJPTripDelivery');
  let best: { miss: number; route: OjpRoute } | undefined;
  for (const result of list(find(delivery, 'TripResult'))) {
    const trip = list(result['Trip'])[0];
    if (!trip) continue;
    const legs = timedLegs(trip).filter((l) => wanted.includes(l.mode) && l.points.length >= 2);
    if (legs.length === 0) continue;
    const board = legs[0].board;
    const alight = legs[legs.length - 1].alight;
    if (!Number.isFinite(board) || !Number.isFinite(alight)) continue;
    // a recorded section starts after boarding and ends before alighting (detection lags): only the miss counts
    const miss = Math.max(0, board - start) + Math.max(0, start - board - EARLY_MS) + Math.max(0, end - alight) + Math.max(0, alight - end - EARLY_MS);
    if (miss > MAX_TIME_MISS_MS || (best && best.miss <= miss)) continue;
    best = { miss, route: { points: legs.flatMap((l) => l.points), line: legs.map((l) => l.line).filter(Boolean).join(' · ') } };
  }
  return best?.route ?? { points: [], line: '' };
}

// the XML of six trips with their geometry can approach a cache document's 1 MB: only the chosen route is cached
export const ojpTripAdapter: ProviderAdapter<OjpRouteParams, OjpRoute, OjpRoute> = {
  id: 'transit-ojp',
  baseUrl: OJP_URL,
  secrets: [ojpApiKey],
  scope: 'user',
  ttlSeconds: 30 * DAY,
  requiresAuth: true,
  windowLimit: { limit: 20, windowMs: 60_000 },
  monthlyCap: 100_000,
  attribution: { provider: 'opentransportdata.swiss', url: 'https://opentransportdata.swiss/', licence: 'Open Data, OJP 2.0' },
  async fetch(params) {
    const res = await gatewayFetch<string>(OJP_URL, {
      method: 'POST',
      data: tripRequestXml(params),
      headers: { Authorization: `Bearer ${ojpApiKey.value()}`, 'Content-Type': 'application/xml' },
      responseType: 'text',
      maxRetries: 1,
    });
    return routeFromTripResponse(typeof res.data === 'string' ? res.data : '', params);
  },
  map: (raw) => raw,
  sourceTimestamp: () => null,
};
