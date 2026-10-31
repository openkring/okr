// apps/functions/src/_gateway/adapters/transit-trips.ts
//
// Connections between two points for `planTrip` (spec 1.131 §5.1): an OJP 2.0
// TripRequest (opentransportdata.swiss) by arrival or departure time, mapped to
// the `TransitConnection`s of the connections view.
//
// scope: 'user'. The source is usually the viewer's position — personal data — so
// a cache entry is never shared. TTL 5 minutes: realtime changes, and five minutes
// absorb repeated taps. Points are rounded to 5 decimals by the callable, so the
// cache key does not change with every GPS jitter.

import type { PlanTripReq, TransitConnection, TransitLeg } from '@okr/mobility-transit-util';
import type { ProviderAdapter } from '../provider';
import { gatewayFetch } from '../http';
import {
  OJP_ATTRIBUTION, OJP_URL, type Node, durationMinutes, find, list, ojpApiKey, ojpTime, parseOjp, placeRefXml, text,
  tripRequestEnvelope,
} from './ojp-xml';

export type TransitTripsParams = Required<PlanTripReq>;

/** The TripRequest: with `arriveBy` the time sits on the destination (latest arrival), else on the origin. */
export function planTripRequestXml(p: TransitTripsParams, now = new Date()): string {
  const time = `<DepArrTime>${ojpTime(Date.parse(p.at))}</DepArrTime>`;
  const arrive = p.anchor === 'arriveBy';
  return tripRequestEnvelope(`<Origin>${placeRefXml(p.from)}${arrive ? '' : time}</Origin>
        <Destination>${placeRefXml(p.to)}${arrive ? time : ''}</Destination>
        <Params>
          <NumberOfResults>${p.limit}</NumberOfResults>
        </Params>`, now);
}

/** Timetabled ISO time and realtime delay (whole minutes) of a ServiceDeparture/ServiceArrival. */
function serviceTime(node: unknown): { time: string; delay: number } {
  const tt = Date.parse(text(find(node, 'TimetabledTime')));
  const est = Date.parse(text(find(node, 'EstimatedTime')));
  if (!Number.isFinite(tt)) return { time: '', delay: 0 };
  return { time: new Date(tt).toISOString(), delay: Number.isFinite(est) ? Math.round((est - tt) / 60_000) : 0 };
}

/**
 * The line as shown at the stop. Trains carry it in `PublicCode` («IR16», «S8»); a bus or tram has
 * a bare number there («70»), which reads better with its mode name («Bus 70»).
 */
function lineName(service: unknown): string {
  const code = text(find(service, 'PublicCode')) || text(find(service, 'PublishedServiceName'));
  if (!code) return text(find(find(service, 'Mode'), 'Name'));
  if (/^\d/.test(code)) {
    const mode = text(find(find(service, 'Mode'), 'Name'));
    return mode ? `${mode} ${code}` : code;
  }
  return code;
}

function placeName(node: unknown): string {
  return text(find(node, 'StopPointName')) || text(find(node, 'Name'));
}

function rideLeg(tl: Node, duration: number): TransitLeg {
  const service = tl['Service'];
  const board = tl['LegBoard'];
  const alight = tl['LegAlight'];
  const dep = serviceTime(find(board, 'ServiceDeparture'));
  const arr = serviceTime(find(alight, 'ServiceArrival'));
  const cancelled = text(find(service, 'Cancelled')) === 'true';
  return {
    kind: 'ride',
    line: lineName(service),
    ptMode: text(find(service, 'PtMode')),
    from: placeName(board),
    to: placeName(alight),
    departure: dep.time,
    arrival: arr.time,
    departureDelay: dep.delay,
    arrivalDelay: arr.delay,
    platform: text(find(board, 'EstimatedQuay')) || text(find(board, 'PlannedQuay')),
    direction: text(find(service, 'DestinationText')),
    durationMinutes: duration || (dep.time && arr.time ? Math.round((Date.parse(arr.time) - Date.parse(dep.time)) / 60_000) : 0),
    cancelled,
  };
}

function footLeg(kind: 'walk' | 'transfer', node: Node, duration: number): TransitLeg {
  return {
    kind, line: '', ptMode: '',
    from: placeName(node['LegStart']), to: placeName(node['LegEnd']),
    departure: '', arrival: '', departureDelay: 0, arrivalDelay: 0, platform: '', direction: '',
    durationMinutes: duration || durationMinutes(text(node['Duration'])), cancelled: false,
  };
}

/** The connections of an OJP TripDelivery, in the order OJP returned them; [] on an error condition. */
export function connectionsFromTripResponse(xml: string): TransitConnection[] {
  if (!xml) return [];
  const delivery = find(parseOjp(xml), 'OJPTripDelivery');
  const out: TransitConnection[] = [];
  for (const result of list(find(delivery, 'TripResult'))) {
    const trip = list(result['Trip'])[0];
    if (!trip) continue;
    const legs: TransitLeg[] = [];
    for (const leg of list(trip['Leg'])) {
      const duration = durationMinutes(text(leg['Duration']));
      const timed = list(leg['TimedLeg'])[0];
      const transfer = list(leg['TransferLeg'])[0];
      const continuous = list(leg['ContinuousLeg'])[0];
      if (timed) legs.push(rideLeg(timed, duration));
      else if (transfer) legs.push(footLeg('transfer', transfer, duration));
      else if (continuous) legs.push(footLeg('walk', continuous, duration));
    }
    const start = Date.parse(text(trip['StartTime']));
    const end = Date.parse(text(trip['EndTime']));
    if (!Number.isFinite(start) || !Number.isFinite(end) || legs.length === 0) continue;
    out.push({
      departure: new Date(start).toISOString(),
      arrival: new Date(end).toISOString(),
      durationMinutes: durationMinutes(text(trip['Duration'])) || Math.round((end - start) / 60_000),
      legs,
    });
  }
  return out;
}

/**
 * With `arriveBy` OJP also returns the connection arriving just after the limit, and with
 * `departAt` one leaving before it. Keep the `limit` connections nearest to the anchor, in time order.
 */
export function pickConnections(all: TransitConnection[], p: TransitTripsParams): TransitConnection[] {
  const sorted = [...all].sort((a, b) => Date.parse(a.departure) - Date.parse(b.departure));
  return p.anchor === 'arriveBy' ? sorted.slice(-p.limit) : sorted.slice(0, p.limit);
}

export const transitTripsAdapter: ProviderAdapter<TransitTripsParams, TransitConnection[], TransitConnection[]> = {
  id: 'transit-trips',
  baseUrl: OJP_URL,
  secrets: [ojpApiKey],
  scope: 'user',
  ttlSeconds: 300,
  requiresAuth: true,
  // with the other OJP adapters stays below the 50 / min of the free plan
  windowLimit: { limit: 10, windowMs: 60_000 },
  monthlyCap: 100_000,
  attribution: OJP_ATTRIBUTION,
  async fetch(params) {
    const res = await gatewayFetch<string>(OJP_URL, {
      method: 'POST',
      data: planTripRequestXml(params),
      headers: { Authorization: `Bearer ${ojpApiKey.value()}`, 'Content-Type': 'application/xml' },
      responseType: 'text',
      maxRetries: 1,
    });
    return pickConnections(connectionsFromTripResponse(typeof res.data === 'string' ? res.data : ''), params);
  },
  map: (raw) => raw,
  sourceTimestamp: () => null,
};
