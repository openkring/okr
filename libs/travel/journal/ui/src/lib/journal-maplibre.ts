import type * as MapLibre from 'maplibre-gl';

import type { JournalTileSource } from '@okr/travel-journal-util';

/**
 * Shared MapLibre plumbing of the flyover and the book maps: the lazy import (so no start bundle carries
 * MapLibre), its worker and stylesheet as app assets under `assets/maplibre/` (also offline on the iPad) and
 * the style made of the journal's raster layers. Vector layers (OpenStreetMap) are ignored.
 */
const ASSET_BASE = 'assets/maplibre/';
let stylesheetAdded = false;

export function addMapLibreStylesheet(): void {
  if (stylesheetAdded || typeof document === 'undefined') return;
  stylesheetAdded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${ASSET_BASE}maplibre-gl.css`;
  document.head.appendChild(link);
}

/** Loads MapLibre and points it at the worker asset. */
export async function loadMapLibre(): Promise<typeof MapLibre> {
  const lib = await import('maplibre-gl');
  lib.setWorkerUrl(new URL(`${ASSET_BASE}maplibre-gl-worker.mjs`, document.baseURI).href);
  return lib;
}

/** A background and one raster layer per tile source (the first listed is drawn lowest). */
export function rasterStyle(tiles: JournalTileSource[], background: string, projection?: 'globe'): MapLibre.StyleSpecification {
  const sources: Record<string, MapLibre.RasterSourceSpecification> = {};
  const layers: MapLibre.LayerSpecification[] = [{ id: 'bg', type: 'background', paint: { 'background-color': background } }];
  tiles.filter((t) => t.kind !== 'vector').forEach((t, i) => {
    sources[`t${i}`] = {
      type: 'raster', tiles: [t.urlTemplate], tileSize: 256, maxzoom: t.maxNativeZoom, minzoom: t.minNativeZoom ?? 0,
      attribution: t.attribution, ...(t.bounds ? { bounds: t.bounds } : {}),
    };
    layers.push({ id: `t${i}`, type: 'raster', source: `t${i}`, ...(t.minZoom !== undefined ? { minzoom: t.minZoom } : {}) });
  });
  return { version: 8, ...(projection ? { projection: { type: projection } } : {}), sources, layers };
}
