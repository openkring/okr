// apps/functions/src/_gateway/adapters/transit-stops.ts
//
// Public-transport stops for `searchStops` (spec 1.130 §5.1): an OJP 2.0
// LocationInformationRequest restricted to stops, either in a circle around a point
// (the departure board resolves its nearest stop this way) or by name.
//
// scope: 'shared'. The point is a saved place (a club house, a venue), rounded to
// 4 decimals by the callable, and stops are public. TTL 30 days: stop names and
// positions hardly ever change.

import type { TransitStop } from '@okr/mobility-transit-util';
import type { ProviderAdapter } from '../provider';
import { gatewayFetch } from '../http';
import { OJP_ATTRIBUTION, OJP_URL, type LatLng, distanceM, find, list, ojpApiKey, ojpEnvelope, parseOjp, text, xmlEscape } from './ojp-xml';

export interface TransitStopsParams {
  near?: LatLng & { radiusM: number };
  query?: string;
  limit: number;
}

export function locationRequestXml(p: TransitStopsParams, now = new Date()): string {
  const input = p.near
    ? `<GeoRestriction><Circle><Center><siri:Longitude>${p.near.lng}</siri:Longitude><siri:Latitude>${p.near.lat}</siri:Latitude></Center><Radius>${p.near.radiusM}</Radius></Circle></GeoRestriction>`
    : `<Name>${xmlEscape(p.query ?? '')}</Name>`;
  return ojpEnvelope('OJPLocationInformationRequest', 'LIR', `<InitialInput>${input}</InitialInput>
        <Restrictions><Type>stop</Type><NumberOfResults>${p.limit}</NumberOfResults></Restrictions>`, now);
}

/** The stops of a LocationInformationDelivery; with `near` measured from it and nearest first. */
export function stopsFromLocationResponse(xml: string, p: TransitStopsParams): TransitStop[] {
  if (!xml) return [];
  const delivery = find(parseOjp(xml), 'OJPLocationInformationDelivery');
  const stops: TransitStop[] = [];
  for (const result of list(find(delivery, 'PlaceResult'))) {
    const place = find(result, 'Place');
    const stop = find(place, 'StopPlace');
    const stopRef = text(find(stop, 'StopPlaceRef'));
    const geo = find(place, 'GeoPosition');
    const lat = Number(text(find(geo, 'Latitude')));
    const lng = Number(text(find(geo, 'Longitude')));
    if (!stopRef || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const s: TransitStop = { stopRef, name: text(find(stop, 'StopPlaceName')) || text(find(place, 'Name')), lat, lng };
    if (p.near) s.distanceM = distanceM(p.near, s);
    stops.push(s);
  }
  if (p.near) stops.sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
  return stops.slice(0, p.limit);
}

export const transitStopsAdapter: ProviderAdapter<TransitStopsParams, TransitStop[], TransitStop[]> = {
  id: 'transit-stops',
  baseUrl: OJP_URL,
  secrets: [ojpApiKey],
  scope: 'shared',
  ttlSeconds: 30 * 24 * 60 * 60,
  requiresAuth: true,
  windowLimit: { limit: 20, windowMs: 60_000 },
  // the four OJP adapters together stay within 400k a month (spec 1.130 §5.1)
  monthlyCap: 20_000,
  attribution: OJP_ATTRIBUTION,
  async fetch(params) {
    const res = await gatewayFetch<string>(OJP_URL, {
      method: 'POST',
      data: locationRequestXml(params),
      headers: { Authorization: `Bearer ${ojpApiKey.value()}`, 'Content-Type': 'application/xml' },
      responseType: 'text',
      maxRetries: 1,
    });
    return stopsFromLocationResponse(typeof res.data === 'string' ? res.data : '', params);
  },
  map: (raw) => raw,
  sourceTimestamp: () => null,
};
