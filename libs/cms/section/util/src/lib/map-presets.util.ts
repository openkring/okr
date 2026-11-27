import { LocationModel, MAP_PIN_FIELDS, MapConfig, MapPinField } from '@okr/shared-models';

/**
 * The simple settings of a map in the map editor: where it starts, how close, whether it offers «Mein Standort», and its pins.
 * Each one writes the fields a map has always stored (`MapConfig`), so readers and older apps draw it as before. The start is not
 * stored as such: it is read back from the stored fields (`mapStartOf`). A stored zoom that matches no choice shows none as chosen.
 */

// ---------------------------------------------------- start ----------------------------------------------------

/** 'tenant' = the club's location, 'place' = one of the locations, 'view' = the view framed on the canvas */
export const MAP_STARTS = ['tenant', 'place', 'view'] as const;
export type MapStart = (typeof MAP_STARTS)[number];

/** a view of the map: its centre and zoom */
export interface MapView {
  lat: number;
  lng: number;
  zoom: number;
}

export function mapRound6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function samePoint(lat1: number, lng1: number, lat2: number, lng2: number): boolean {
  return mapRound6(lat1) === mapRound6(lat2) && mapRound6(lng1) === mapRound6(lng2);
}

/** the location whose coordinates are the stored centre, if any */
export function mapPlaceOf(config: MapConfig, locations: readonly LocationModel[]): LocationModel | undefined {
  if (config.useCurrentLocationAsCenter) return undefined;
  return locations.find((l) => (l.latitude !== 0 || l.longitude !== 0) && samePoint(l.latitude, l.longitude, config.centerLatitude, config.centerLongitude));
}

/** where a stored map starts: the club's location, a location (its coordinates are the centre) or a view of its own */
export function mapStartOf(config: MapConfig, locations: readonly LocationModel[]): MapStart {
  if (config.useCurrentLocationAsCenter) return 'tenant';
  return mapPlaceOf(config, locations) ? 'place' : 'view';
}

/** the club's location: the renderer finds it; the stored centre is kept for a switch back */
export function applyMapStartTenant(config: MapConfig): MapConfig {
  return { ...config, useCurrentLocationAsCenter: true };
}

/** a location: its coordinates become the centre (a moved location is not followed) */
export function applyMapStartPlace(config: MapConfig, location: Pick<LocationModel, 'latitude' | 'longitude'>): MapConfig {
  return { ...config, useCurrentLocationAsCenter: false, centerLatitude: mapRound6(location.latitude), centerLongitude: mapRound6(location.longitude) };
}

/** the view framed on the canvas: its centre and zoom */
export function applyMapStartView(config: MapConfig, view: MapView): MapConfig {
  return { ...config, useCurrentLocationAsCenter: false, centerLatitude: mapRound6(view.lat), centerLongitude: mapRound6(view.lng), zoom: Math.round(view.zoom) };
}

/**
 * A view framed on the canvas: with the start 'view' it is the new centre and zoom; with any other start only its zoom is taken
 * (the centre stays the club's or the location's). An unchanged view returns the config itself.
 */
export function applyMapCanvasView(config: MapConfig, view: MapView, start: MapStart): MapConfig {
  const zoom = Math.round(view.zoom);
  if (start === 'view') {
    if (samePoint(view.lat, view.lng, config.centerLatitude, config.centerLongitude) && zoom === config.zoom) return config;
    return applyMapStartView(config, view);
  }
  return zoom === config.zoom ? config : { ...config, zoom };
}

// ---------------------------------------------------- zoom ----------------------------------------------------

export const MAP_ZOOM_CHOICES = ['country', 'region', 'city', 'quarter', 'street'] as const;
export type MapZoomChoice = (typeof MAP_ZOOM_CHOICES)[number];
/** the zoom of each choice (Leaflet and Google Maps share the scale) */
export const MAP_ZOOMS: Record<MapZoomChoice, number> = { country: 8, region: 10, city: 13, quarter: 15, street: 17 };
export const MAP_DEFAULT_ZOOM = MAP_ZOOMS.quarter;

export function mapZoomChoiceOf(zoom: number | undefined): MapZoomChoice | undefined {
  return MAP_ZOOM_CHOICES.find((choice) => MAP_ZOOMS[choice] === zoom);
}

export function applyMapZoom(config: MapConfig, choice: MapZoomChoice): MapConfig {
  return { ...config, zoom: MAP_ZOOMS[choice] };
}

/** the zoom a map stored before the map editor showed with the club's location: always this one, whatever it stored */
export const MAP_LEGACY_TENANT_ZOOM = 15;

/**
 * The zoom readers see. A map stored before the map editor (no `showLocateButton`) that starts at the club's location was always
 * shown at 15; every other map, and every map the editor has saved, at its stored zoom.
 */
export function mapEffectiveZoom(config: MapConfig): number {
  return config.useCurrentLocationAsCenter && config.showLocateButton === undefined ? MAP_LEGACY_TENANT_ZOOM : config.zoom;
}

/**
 * A map as the editor edits it: «Mein Standort» and the zoom stated as readers see them. Only a change writes it, so a map the
 * editor saves keeps the zoom it shows; one only opened stays as it was.
 */
export function mapEditableConfig(config: MapConfig): MapConfig {
  if (config.showLocateButton !== undefined) return config;
  return { ...config, showLocateButton: mapShowsLocateButton(config), zoom: mapEffectiveZoom(config) };
}

// ---------------------------------------------------- «Mein Standort» ----------------------------------------------------

/** whether the reader is offered «Mein Standort»; a map stored before the editor offers it with the club's location */
export function mapShowsLocateButton(config: MapConfig | undefined): boolean {
  return config?.showLocateButton ?? config?.useCurrentLocationAsCenter ?? false;
}

export function applyMapLocateButton(config: MapConfig, show: boolean): MapConfig {
  return { ...config, showLocateButton: show };
}

// ---------------------------------------------------- pins ----------------------------------------------------

export function mapLocationKeysOf(config: MapConfig | undefined): string[] {
  return config?.locationKeys ?? [];
}

/** adds a location as the last pin; one already shown is not added twice */
export function addMapLocation(config: MapConfig, key: string): MapConfig {
  const keys = mapLocationKeysOf(config);
  if (!key || keys.includes(key)) return config;
  return { ...config, locationKeys: [...keys, key] };
}

/** removes a pin; the last one removed leaves no `locationKeys` (as a map without pins always was) */
export function removeMapLocation(config: MapConfig, key: string): MapConfig {
  const keys = mapLocationKeysOf(config).filter((k) => k !== key);
  if (keys.length === mapLocationKeysOf(config).length) return config;
  const { locationKeys: _, ...rest } = config;
  return keys.length > 0 ? { ...rest, locationKeys: keys } : rest;
}

export const MAP_DEFAULT_PIN_FIELDS: readonly MapPinField[] = ['name'];

export function mapPinFieldsOf(config: MapConfig | undefined): readonly MapPinField[] {
  return config?.pinFields ?? MAP_DEFAULT_PIN_FIELDS;
}

/** switches a field of the pins on or off; the fields keep the order of MAP_PIN_FIELDS */
export function toggleMapPinField(config: MapConfig, field: MapPinField): MapConfig {
  const current = mapPinFieldsOf(config);
  const on = !current.includes(field);
  return { ...config, pinFields: MAP_PIN_FIELDS.filter((f) => (f === field ? on : current.includes(f))) };
}

/** what a pin shows of one field of its location; '' = nothing (empty, or no height) */
export function mapPinValue(location: LocationModel, field: MapPinField): string {
  switch (field) {
    case 'name': return (location.name ?? '').trim();
    case 'address': return (location.address ?? '').trim();
    case 'what3words': return location.what3words?.trim() ? `///${location.what3words.trim()}` : '';
    case 'seaLevel': return location.seaLevel ? `${location.seaLevel} m` : '';
    case 'notes': return (location.notes ?? '').trim();
  }
}

/** a pin of the map: the first non-empty field is its title, the others its text */
export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  title: string;
  snippet: string;
}

export function mapPinOf(location: LocationModel, fields: readonly MapPinField[]): MapPin {
  const values = fields.map((field) => mapPinValue(location, field)).filter((v) => v.length > 0);
  return { id: location.okey, lat: location.latitude, lng: location.longitude, title: values[0] ?? '', snippet: values.slice(1).join(' · ') };
}

/** the pins of a map in the order of `locationKeys`; a location that is gone or has no coordinates shows none */
export function mapPinsOf(config: MapConfig | undefined, locations: readonly LocationModel[]): MapPin[] {
  const byKey = new Map(locations.map((l) => [l.okey, l]));
  const fields = mapPinFieldsOf(config);
  return mapLocationKeysOf(config)
    .map((key) => byKey.get(key))
    .filter((l): l is LocationModel => !!l && (l.latitude !== 0 || l.longitude !== 0))
    .map((l) => mapPinOf(l, fields));
}
