// apps/functions/src/_gateway/adapters/places.ts
//
// Place search for the diary (spec 1.178): swisstopo's SearchServer finds
// municipalities (gg25), gazetteer names (towns, lakes, peaks …), postcodes and,
// when the text has a digit, addresses. Open data, no key. The answer is the same
// for every caller, so the cache is shared; the query is a place name, not personal data.

import { HttpsError } from 'firebase-functions/v2/https';
import { distanceKm } from '@okr/shared-util-core';
import type { ProviderAdapter, GatewayContext } from '../provider';
import { gatewayFetch } from '../http';

/** Only the text: SearchServer has no position bias, and any extra field would fragment the shared cache. */
export interface PlaceSearchParams { text: string }
export type PlaceKind = 'municipality' | 'locality' | 'water' | 'mountain' | 'zip' | 'address' | 'other';
export interface PlaceHit {
  name: string;
  kind: PlaceKind;
  typeLabel: string;
  canton: string;
  municipality: string;
  zip: string;
  lat: number;
  lng: number;
}

export interface SearchServerBody {
  results?: { attrs?: { origin?: string; label?: string; lat?: number; lon?: number } }[];
}

const SEARCH_URL = 'https://api3.geo.admin.ch/rest/services/api/SearchServer';
const MAX_HITS = 8;
const MAX_TEXT = 100;
const DEDUPE_KM = 0.5;

const WATER = new Set(['See', 'Fliessgewaesser']);
const MOUNTAIN = new Set(['Gipfel', 'Hauptgipfel', 'Huegel', 'Haupthuegel']);

export function originsFor(text: string): string {
  return /\d/.test(text) ? 'gg25,gazetteer,zipcode,address' : 'gg25,gazetteer,zipcode';
}

const stripTags = (s: string): string => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

function withCanton(name: string, canton: string): string {
  return canton && !name.endsWith(` ${canton}`) ? `${name} ${canton}` : name;
}

/** A gg25 lake area: the name ends in a compound «…see» (Zürichsee, Bodensee), not the word «See». */
export function isLakeArea(name: string): boolean {
  return /\Ssee$/i.test(name.trim());
}

/** Keeps only `text` of the client payload: extra fields are ignored upstream but would split the cache key. */
export function placeSearchParams(data: unknown): PlaceSearchParams {
  const text = data && typeof data === 'object' ? (data as Record<string, unknown>)['text'] : undefined;
  return { text: typeof text === 'string' ? text : '' };
}

function mapRow(origin: string, label: string, lat: number, lng: number): PlaceHit | null {
  const base = { typeLabel: '', canton: '', municipality: '', zip: '', lat, lng };
  if (origin === 'zipcode') {
    const text = stripTags(label);
    const m = /^(\d{4})\s*-\s*(.+)$/.exec(text);
    return m ? { ...base, name: `${m[1]} ${m[2]}`, kind: 'zip', zip: m[1] } : { ...base, name: text, kind: 'zip', zip: /\b(\d{4})\b/.exec(text)?.[1] ?? '' };
  }
  if (origin === 'address') {
    const text = stripTags(label);
    return { ...base, name: text, kind: 'address', zip: /\b(\d{4})\b/.exec(text)?.[1] ?? '' };
  }
  if (origin === 'gg25') {
    const m = /^(.*?)\s*\(([A-Z]{2})\)$/.exec(stripTags(label));
    const name = m ? m[1] : stripTags(label);
    // gg25 also lists lake areas without a municipality («Zürichsee (ZH)»): a lake, not a political
    // municipality (Q3). Only a compound «…see» — «Uetikon am See» stays a municipality.
    const kind: PlaceKind = isLakeArea(name) ? 'water' : 'municipality';
    const typeLabel = kind === 'water' ? 'See' : '';
    return m ? { ...base, name: `${name} ${m[2]}`, kind, typeLabel, canton: m[2] } : { ...base, name, kind, typeLabel };
  }
  if (origin === 'gazetteer') {
    const m = /^(?:<i>(.*?)<\/i>\s*)?<b>(.*?)<\/b>(?:\s*\(([^)]*)\))?(?:\s*-\s*(.*))?$/.exec(label.trim());
    if (!m) return null;
    const typeLabel = (m[1] ?? '').trim();
    const cantons = (m[3] ?? '').split(',').map((c) => c.trim()).filter(Boolean);
    const canton = cantons.length === 1 ? cantons[0] : '';
    const muni = (m[4] ?? '').trim();
    const kind: PlaceKind = typeLabel === 'Ort' ? 'locality' : WATER.has(typeLabel) ? 'water' : MOUNTAIN.has(typeLabel) ? 'mountain' : 'other';
    return { ...base, name: withCanton(m[2].trim(), canton), kind, typeLabel, canton, municipality: muni.includes(',') ? '' : muni };
  }
  return null;
}

/** Maps a SearchServer body to at most 8 hits; never throws on a malformed body. */
export function mapPlaces(raw: SearchServerBody, _params: PlaceSearchParams): PlaceHit[] {
  const rows = Array.isArray(raw?.results) ? raw.results : [];
  const hits: PlaceHit[] = [];
  for (const r of rows) {
    const a = r?.attrs;
    if (!a || typeof a.label !== 'string' || typeof a.origin !== 'string' || typeof a.lat !== 'number' || typeof a.lon !== 'number') continue;
    const hit = mapRow(a.origin, a.label, a.lat, a.lon);
    if (!hit || !hit.name) continue;
    const dup = hits.some((h) => h.name === hit.name && h.kind === hit.kind && distanceKm(h, { lat: hit.lat, lng: hit.lng }) < DEDUPE_KM);
    if (dup) continue;
    hits.push(hit);
    if (hits.length >= MAX_HITS) break;
  }
  return hits;
}

export const placesAdapter: ProviderAdapter<PlaceSearchParams, SearchServerBody, PlaceHit[]> = {
  id: 'places-swisstopo',
  baseUrl: SEARCH_URL,
  secrets: [],
  scope: 'shared',
  ttlSeconds: 30 * 24 * 3600,
  requiresAuth: true,
  normalizeParams: placeSearchParams,
  attribution: { provider: 'swisstopo', url: 'https://www.swisstopo.admin.ch/', licence: 'Open Government Data (OGD)' },
  async fetch(params, _ctx: GatewayContext) {
    const text = params.text?.trim();
    if (!text || text.length > MAX_TEXT) throw new HttpsError('invalid-argument', `text must be 1-${MAX_TEXT} characters`);
    const url = `${SEARCH_URL}?type=locations&sr=4326&limit=10&origins=${originsFor(text)}&searchText=${encodeURIComponent(text)}`;
    const res = await gatewayFetch<SearchServerBody>(url, { method: 'GET' });
    return res.data;
  },
  map: mapPlaces,
  sourceTimestamp: () => null,
};
