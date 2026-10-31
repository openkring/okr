// apps/functions/src/_gateway/adapters/transit-departures.ts
//
// The next departures at a stop for `getDepartures` (spec 1.130 §5.1): an OJP 2.0
// StopEventRequest (opentransportdata.swiss) with realtime data, mapped to the
// `TransitDeparture`s of the departure board, plus the disruption messages
// (SIRI-SX `PtSituation`) OJP sends along in the response context.
//
// scope: 'shared'. A stop is public and the request carries nothing about the
// viewer, so every board showing the same stop shares one upstream call. TTL 45 s:
// short enough for realtime, long enough that a room full of viewers (or a kiosk
// polling every minute) costs at most a call and a bit per stop and minute.
//
// The request always asks for DEPARTURES_FETCHED departures from now; the callable
// cuts the answer to the caller's limit, so the cache key is the stop alone.

import type { DepartureMode, TransitDeparture, TransitSituation } from '@okr/mobility-transit-util';
import type { ProviderAdapter } from '../provider';
import { gatewayFetch } from '../http';
import { OJP_ATTRIBUTION, OJP_URL, type Node, find, list, ojpApiKey, ojpEnvelope, ojpTime, parseOjp, text, xmlEscape } from './ojp-xml';

export const DEPARTURES_FETCHED = 20;

export interface TransitDeparturesParams {
  stopRef: string;
}

export interface DeparturesRaw {
  stopName: string;
  departures: TransitDeparture[];
  situations: TransitSituation[];
  fetchedAt: string;
}

export function stopEventRequestXml(p: TransitDeparturesParams, now = new Date()): string {
  return ojpEnvelope('OJPStopEventRequest', 'SER', `<Location>
          <PlaceRef><siri:StopPointRef>${xmlEscape(p.stopRef)}</siri:StopPointRef></PlaceRef>
          <DepArrTime>${ojpTime(now.getTime())}</DepArrTime>
        </Location>
        <Params>
          <NumberOfResults>${DEPARTURES_FETCHED}</NumberOfResults>
          <StopEventType>departure</StopEventType>
          <IncludePreviousCalls>false</IncludePreviousCalls>
          <IncludeOnwardCalls>false</IncludeOnwardCalls>
          <UseRealtimeData>full</UseRealtimeData>
        </Params>`, now);
}

/** OJP PtMode → the board's mode (it picks the icon). */
export function departureMode(ptMode: string): DepartureMode {
  switch (ptMode) {
    case 'rail': case 'urbanRail': case 'metro': case 'intercityRail': return 'train';
    case 'bus': case 'coach': case 'trolleyBus': return 'bus';
    case 'tram': return 'tram';
    case 'water': case 'ferry': return 'ship';
    case 'telecabin': case 'funicular': case 'cableway': return 'cableway';
    default: return 'other';
  }
}

function iso(v: unknown): string {
  const ms = Date.parse(text(v));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
}

/** True when `now` lies inside one of the periods; a period without end is open. No periods ⇒ `fallback`. */
function inPeriods(periods: Node[], now: number, fallback: boolean): boolean {
  if (periods.length === 0) return fallback;
  return periods.some((p) => {
    const start = Date.parse(text(p['StartTime']));
    const end = Date.parse(text(p['EndTime']));
    return (!Number.isFinite(start) || start <= now) && (!Number.isFinite(end) || now <= end);
  });
}

/**
 * One SIRI-SX situation, or undefined when it is outside its publication window or has no text. The
 * texts sit in the first PassengerInformationAction (OJP repeats them per perspective).
 */
export function situationOf(sit: Node, now: number): TransitSituation | undefined {
  if (!inPeriods(list(sit['PublicationWindow']), now, true)) return undefined;
  const content = find(find(sit, 'PassengerInformationAction'), 'TextualContent');
  const summary = text(find(content, 'SummaryText')) || text(sit['Summary']);
  const id = text(sit['SituationNumber']);
  if (!id || !summary) return undefined;
  const detail = ['ReasonText', 'DurationText', 'RecommendationText']
    .map((k) => text(find(content, k)))
    .filter(Boolean)
    .join(' ') || text(sit['Description']);
  return {
    id,
    summary,
    detail,
    priority: Number(text(sit['Priority'])) || 0,
    active: inPeriods(list(sit['ValidityPeriod']), now, true),
    planned: text(sit['Planned']) === 'true',
  };
}

/** In force first, then by priority (1 = most important, 0 = unknown, last). */
function bySeverity(a: TransitSituation, b: TransitSituation): number {
  if (a.active !== b.active) return a.active ? -1 : 1;
  return (a.priority || 99) - (b.priority || 99);
}

function departureOf(result: Node): TransitDeparture | undefined {
  const event = find(result, 'StopEvent');
  const call = find(find(event, 'ThisCall'), 'CallAtStop');
  const service = find(event, 'Service');
  const dep = find(call, 'ServiceDeparture');
  const plannedAt = iso(find(dep, 'TimetabledTime'));
  if (!plannedAt) return undefined;
  const mode = find(service, 'Mode');
  return {
    line: text(find(service, 'PublicCode')) || text(find(service, 'PublishedServiceName')) || text(find(mode, 'Name')),
    mode: departureMode(text(find(mode, 'PtMode'))),
    destination: text(find(service, 'DestinationText')),
    quay: text(find(call, 'EstimatedQuay')) || text(find(call, 'PlannedQuay')),
    plannedAt,
    estimatedAt: iso(find(dep, 'EstimatedTime')),
    cancelled: text(find(service, 'Cancelled')) === 'true' || text(find(call, 'NotServicedStop')) === 'true',
    situationIds: list(find(find(service, 'SituationFullRefs'), 'SituationFullRef'))
      .map((r) => text(r['SituationNumber']))
      .filter(Boolean),
  };
}

/** Stop name, departures (OJP's order) and published situations of a StopEventDelivery; empty on an error condition. */
export function departuresFromStopEventResponse(xml: string, now = new Date()): DeparturesRaw {
  const fetchedAt = now.toISOString();
  if (!xml) return { stopName: '', departures: [], situations: [], fetchedAt };
  const delivery = find(parseOjp(xml), 'OJPStopEventDelivery');
  const context = find(delivery, 'StopEventResponseContext');
  const results = list(find(delivery, 'StopEventResult'));
  const departures = results.map(departureOf).filter((d): d is TransitDeparture => !!d);
  const situations = list(find(find(context, 'Situations'), 'PtSituation'))
    .map((s) => situationOf(s, now.getTime()))
    .filter((s): s is TransitSituation => !!s)
    .sort(bySeverity);
  // a departure may reference a situation OJP did not send (or that is unpublished): drop the dangling id
  const known = new Set(situations.map((s) => s.id));
  for (const d of departures) d.situationIds = d.situationIds.filter((id) => known.has(id));
  const stopName = text(find(find(context, 'StopPlace'), 'StopPlaceName'))
    || text(find(find(find(results[0], 'ThisCall'), 'CallAtStop'), 'StopPointName'));
  return { stopName, departures, situations, fetchedAt };
}

export const transitDeparturesAdapter: ProviderAdapter<TransitDeparturesParams, DeparturesRaw, DeparturesRaw> = {
  id: 'transit-departures',
  baseUrl: OJP_URL,
  secrets: [ojpApiKey],
  scope: 'shared',
  ttlSeconds: 45,
  requiresAuth: true,
  // per caller; with the shared cache the upstream rate stays far below the 50 / min of the free plan
  windowLimit: { limit: 30, windowMs: 60_000 },
  // the four OJP adapters together stay within 400k a month (spec 1.130 §5.1)
  monthlyCap: 180_000,
  attribution: OJP_ATTRIBUTION,
  async fetch(params) {
    const res = await gatewayFetch<string>(OJP_URL, {
      method: 'POST',
      data: stopEventRequestXml(params),
      headers: { Authorization: `Bearer ${ojpApiKey.value()}`, 'Content-Type': 'application/xml' },
      responseType: 'text',
      maxRetries: 1,
    });
    return departuresFromStopEventResponse(typeof res.data === 'string' ? res.data : '');
  },
  map: (raw) => raw,
  sourceTimestamp: (raw) => raw.fetchedAt,
};
