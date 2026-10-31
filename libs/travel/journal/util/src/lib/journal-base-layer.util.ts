import {
  localGibsSource, localLimaSource, localOsmSources, MapArea, MapLayerKind, sourceFor, SWITZERLAND, swisstopoSource,
} from './journal-map-area.util';
import { GIBS_BLUE_MARBLE, JournalTileSource } from './journal-map.util';
import { Bbox } from './journal-tiles.util';

/**
 * The base layers the journal map offers (spec 1.126 phase 4, design §2 «What is offered»): one at a time, per layer
 * kind and not per area. Google draws alone; an offline option draws every usable area of its kind over the local
 * GIBS world background (OpenStreetMap additionally over the downloaded satellite tiles); «Weltkarte» is always last.
 */
export type BaseLayerKind = 'google' | 'live' | 'offline' | 'background';
export interface BaseLayerOption {
  id: 'google-roadmap' | 'google-satellite' | 'swisstopo-live' | 'offline-osm' | 'offline-satellite' | 'offline-swisstopo' | 'world';
  kind: BaseLayerKind;
  sources: JournalTileSource[];
  googleType?: 'roadmap' | 'satellite';
}
export interface BaseLayerInput {
  online: boolean;
  /** Tile URL templates, present only when a Map Tiles session exists for that map type. */
  google: { roadmap?: string; satellite?: string };
  areas: MapArea[];
  /** `${areaId}:${kind}` usable on this device (downloaded). */
  usable: Set<string>;
  /** The map's current view; `undefined` (not known yet) restricts nothing. */
  view: Bbox | undefined;
  /** Base URL of the downloaded tiles; empty where nothing can be downloaded (browser). */
  tilesBaseUrl: string;
}

/** Background levels downloaded for the whole world (`journalTilePlan`). */
const BACKGROUND_MAX_ZOOM = 4;
const GIBS_MAX_ZOOM = 8;
/** Google serves 2D tiles up to z22; beyond the imagery of a place Leaflet keeps the last level. */
const GOOGLE_MAX_ZOOM = 22;

const intersects = ([w, s, e, n]: Bbox, view: Bbox | undefined): boolean =>
  view === undefined || (w <= view[2] && e >= view[0] && s <= view[3] && n >= view[1]);

function googleOption(type: 'roadmap' | 'satellite', urlTemplate: string): BaseLayerOption {
  // The attribution (logo + viewport copyright) is drawn by the map while a Google option is selected.
  return { id: type === 'roadmap' ? 'google-roadmap' : 'google-satellite', kind: 'google', googleType: type,
    sources: [{ urlTemplate, maxNativeZoom: GOOGLE_MAX_ZOOM, attribution: '' }] };
}

/** The usable layers of one kind: each area that has it and has it on this device, with its detail level. */
function usableLayers(input: BaseLayerInput, kind: MapLayerKind): { area: MapArea; maxZoom: number }[] {
  return input.areas.flatMap((area) => {
    const layer = area.layers.find((l) => l.kind === kind);
    return layer && input.usable.has(`${area.id}:${kind}`) ? [{ area, maxZoom: layer.maxZoom }] : [];
  });
}

/** Downloaded satellite tiles of an area: GIBS up to z8, LIMA beyond it in Antarctica (the Antarctica preset). */
function satelliteSources(area: MapArea, maxZoom: number, tilesBaseUrl: string): JournalTileSource[] {
  const antarctic = area.preset === 'antarctica-expedition' || (area.preset === undefined && sourceFor(area.bbox) === 'antarctica');
  return [
    localGibsSource(tilesBaseUrl, Math.min(GIBS_MAX_ZOOM, maxZoom), area.bbox),
    ...(antarctic && maxZoom > GIBS_MAX_ZOOM ? [localLimaSource(tilesBaseUrl, maxZoom, area.bbox)] : []),
  ];
}

export function baseLayerOptions(input: BaseLayerInput): BaseLayerOption[] {
  const { online, google, view, tilesBaseUrl } = input;
  const options: BaseLayerOption[] = [];
  if (online && google.roadmap) options.push(googleOption('roadmap', google.roadmap));
  if (online && google.satellite) options.push(googleOption('satellite', google.satellite));
  if (online && intersects(SWITZERLAND, view)) {
    options.push({ id: 'swisstopo-live', kind: 'live', sources: [GIBS_BLUE_MARBLE, swisstopoSource(undefined, 18, SWITZERLAND)] });
  }

  if (tilesBaseUrl !== '') {
    const background = localGibsSource(tilesBaseUrl, BACKGROUND_MAX_ZOOM);
    const satellite = usableLayers(input, 'satellite');
    const satelliteTiles = satellite.flatMap(({ area, maxZoom }) => satelliteSources(area, maxZoom, tilesBaseUrl));
    const inView = (layers: { area: MapArea }[]): boolean => layers.some(({ area }) => intersects(area.bbox, view));

    const osm = usableLayers(input, 'osm');
    if (inView(osm)) {
      options.push({ id: 'offline-osm', kind: 'offline',
        sources: [background, ...satelliteTiles, ...osm.flatMap(({ area, maxZoom }) => localOsmSources(area, maxZoom, tilesBaseUrl))] });
    }
    if (inView(satellite)) options.push({ id: 'offline-satellite', kind: 'offline', sources: [background, ...satelliteTiles] });
    const swisstopo = usableLayers(input, 'swisstopo');
    if (inView(swisstopo)) {
      options.push({ id: 'offline-swisstopo', kind: 'offline',
        sources: [background, ...swisstopo.map(({ area, maxZoom }) => swisstopoSource(tilesBaseUrl, maxZoom, area.bbox))] });
    }
  }

  const localWorld = !online && tilesBaseUrl !== '';
  options.push({ id: 'world', kind: 'background', sources: [localWorld ? localGibsSource(tilesBaseUrl, BACKGROUND_MAX_ZOOM) : GIBS_BLUE_MARBLE] });
  return options;
}

/** The stored id when offered, else first google, else first offline, else 'world'. */
export function pickBaseLayer(options: BaseLayerOption[], stored: string | undefined): BaseLayerOption['id'] {
  const offered = options.find((o) => o.id === stored);
  if (offered) return offered.id;
  return (options.find((o) => o.kind === 'google') ?? options.find((o) => o.kind === 'offline'))?.id ?? 'world';
}
