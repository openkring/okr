import { LocationModel } from '@okr/shared-models';
import { distanceKm, foldName } from '@okr/shared-util-core';

// Redeclared from the `searchPlaces` callable (apps/functions) — the client does not import server code.
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

export interface SavedMatch {
  location: LocationModel;
  distanceKm?: number;
}

/** Saved places within this radius of a given point are offered as candidates (spec §5.1). */
const NEAR_LIMIT_KM = 5;

/** Free text of a diary place badge for the place search: 'Pfäffikon, SZ' -> 'Pfäffikon SZ'. */
export function searchTextOf(badge: string): string {
  return badge.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
}

export function locationTypeOfPlace(kind: PlaceKind): string {
  switch (kind) {
    case 'municipality': return 'city';
    case 'address': return 'address';
    case 'mountain': return 'mountain';
    case 'water': return 'water';
    default: return 'geomarker';
  }
}

/** A new (unsaved, `okey` empty) location from a search hit. */
export function placeHitToLocation(hit: PlaceHit, tenantId: string): LocationModel {
  const l = new LocationModel(tenantId);
  l.okey = '';
  l.name = hit.name;
  l.type = locationTypeOfPlace(hit.kind);
  l.latitude = hit.lat;
  l.longitude = hit.lng;
  l.address = hit.municipality ? `${hit.name}, Gemeinde ${hit.municipality}` : hit.name;
  return l;
}

function hasCoords(l: LocationModel): boolean {
  return l.latitude !== 0 || l.longitude !== 0;
}

/**
 * Saved locations that may be what the free text means: first those whose name contains the text (folded; the part before
 * a comma also counts, so 'Pfaffikon, sz' finds «Pfäffikon SZ» and «Stäfa» finds «Hafen Stäfa»), then those within 5 km of `near`, nearest first.
 * Several texts (the diary's badge and what the user typed) match when any of them does; each location appears once.
 */
export function matchSavedLocations(all: LocationModel[], text: string | string[], near?: { lat: number; lng: number }, max = 3): SavedMatch[] {
  const live = all.filter(l => !l.isArchived);
  const patterns = (Array.isArray(text) ? text : [text])
    .map(t => ({ whole: foldName(searchTextOf(t)), base: foldName(searchTextOf(t.split(',')[0])) }))
    .filter(p => !!p.base);
  const withDistance = (l: LocationModel): SavedMatch =>
    near && hasCoords(l) ? { location: l, distanceKm: distanceKm(near, { lat: l.latitude, lng: l.longitude }) } : { location: l };

  const byName = live
    .filter(l => {
      const n = foldName(searchTextOf(l.name));
      return patterns.some(p => n.includes(p.whole) || n.includes(p.base));
    })
    .map(withDistance);

  const seen = new Set(byName.map(m => m.location));
  const byDistance = near
    ? live
        .filter(l => !seen.has(l) && hasCoords(l))
        .map(withDistance)
        .filter(m => (m.distanceKm ?? Infinity) <= NEAR_LIMIT_KM)
        .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
    : [];

  return [...byName, ...byDistance].slice(0, max);
}
