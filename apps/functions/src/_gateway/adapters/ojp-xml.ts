// apps/functions/src/_gateway/adapters/ojp-xml.ts
//
// What every OJP 2.0 adapter shares (spec 1.131 §5.1): the endpoint, the API key, the request
// envelope and the tolerant XML walking. opentransportdata.swiss nests and repeats elements
// freely, so the readers below search by element name instead of fixed paths.

import { defineSecret } from 'firebase-functions/params';
import { XMLParser } from 'fast-xml-parser';

export const ojpApiKey = defineSecret('OJP_APIKEY');

export const OJP_URL = 'https://api.opentransportdata.swiss/ojp20';
const REQUESTOR_REF = 'openkring_prod';

export const OJP_ATTRIBUTION = { provider: 'opentransportdata.swiss', url: 'https://opentransportdata.swiss/', licence: 'Open Data, OJP 2.0' };

export type LatLng = { lat: number; lng: number };
export type Node = Record<string, unknown>;

export function xmlEscape(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** UTC with seconds: OJP takes its local time on any other format. */
export function ojpTime(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function placeRefXml(q: LatLng): string {
  return `<PlaceRef><GeoPosition><siri:Longitude>${q.lng}</siri:Longitude><siri:Latitude>${q.lat}</siri:Latitude></GeoPosition></PlaceRef>`;
}

/** The OJP envelope around one `OJPTripRequest` body (origin, destination, params). */
export function tripRequestEnvelope(body: string, now = new Date()): string {
  const ts = ojpTime(now.getTime());
  return `<?xml version="1.0" encoding="UTF-8"?>
<OJP xmlns="http://www.vdv.de/ojp" xmlns:siri="http://www.siri.org.uk/siri" version="2.0">
  <OJPRequest>
    <siri:ServiceRequest>
      <siri:RequestTimestamp>${ts}</siri:RequestTimestamp>
      <siri:RequestorRef>${xmlEscape(REQUESTOR_REF)}</siri:RequestorRef>
      <OJPTripRequest>
        <siri:RequestTimestamp>${ts}</siri:RequestTimestamp>
        <siri:MessageIdentifier>TR-${now.getTime()}</siri:MessageIdentifier>
        ${body}
      </OJPTripRequest>
    </siri:ServiceRequest>
  </OJPRequest>
</OJP>`;
}

const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, trimValues: true, parseTagValue: false });

export function parseOjp(xml: string): unknown {
  return parser.parse(xml) as unknown;
}

export function list(v: unknown): Node[] {
  if (v === undefined || v === null) return [];
  return (Array.isArray(v) ? v : [v]).filter((x): x is Node => typeof x === 'object' && x !== null);
}

/** The first value found under `key` anywhere below `node` (depth first). */
export function find(node: unknown, key: string): unknown {
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
export function positions(node: unknown, out: LatLng[] = []): LatLng[] {
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

export function text(v: unknown): string {
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (v && typeof v === 'object' && 'Text' in (v as Node)) return text((v as Node)['Text']);
  // `<Text xml:lang="de">…</Text>` parses to its value; attributes are ignored
  if (v && typeof v === 'object' && '#text' in (v as Node)) return text((v as Node)['#text']);
  return '';
}

/** Estimated time if given, else the timetable's; NaN when missing. */
export function legTime(serviceTime: unknown): number {
  const est = find(serviceTime, 'EstimatedTime');
  const tt = find(serviceTime, 'TimetabledTime');
  return Date.parse(text(est) || text(tt));
}

/** Minutes of an ISO 8601 duration (`PT1H32M`, `PT45S`); 0 when unreadable. */
export function durationMinutes(iso: string): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(iso.trim());
  if (!m) return 0;
  const [, d, h, min, s] = m;
  return Math.round(Number(d ?? 0) * 1440 + Number(h ?? 0) * 60 + Number(min ?? 0) + Number(s ?? 0) / 60);
}
