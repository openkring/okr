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

import type { TransportMode } from '@okr/shared-models';
import type { ProviderAdapter } from '../provider';
import { gatewayFetch } from '../http';
import { OJP_ATTRIBUTION, OJP_URL, type Node, find, legTime, list, ojpApiKey, ojpTime, parseOjp, placeRefXml, positions, text, tripRequestEnvelope } from './ojp-xml';

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

/** The TripRequest; times in UTC with seconds (OJP takes its local time on any other format). */
export function tripRequestXml(p: OjpRouteParams, now = new Date()): string {
  const dep = ojpTime(Date.parse(p.startedAt) - EARLY_MS);
  return tripRequestEnvelope(`<Origin>${placeRefXml(p.from)}<DepArrTime>${dep}</DepArrTime></Origin>
        <Destination>${placeRefXml(p.to)}</Destination>
        <Params>
          <NumberOfResults>${NUMBER_OF_RESULTS}</NumberOfResults>
          <IncludeLegProjection>true</IncludeLegProjection>
        </Params>`, now);
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
  const doc = parseOjp(xml);
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
  attribution: OJP_ATTRIBUTION,
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
