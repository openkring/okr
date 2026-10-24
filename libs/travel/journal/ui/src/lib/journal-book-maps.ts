import type * as MapLibre from 'maplibre-gl';

import { Box, bookMapBounds, bookMapMaxZoom, bookMapPixels, JournalTileSource, LngLat, mmToPx } from '@okr/travel-journal-util';

import { loadMapLibre, rasterStyle } from './journal-maplibre';

/**
 * The maps of the printed book (design 2026-10-24 §8): the overview, one map per stretch and the cover back,
 * drawn with MapLibre into an off-screen canvas of the frame size at print resolution and returned as a JPEG.
 *
 * The map runs at pixel ratio 1 with a container of the final pixel size, so one screen pixel is one print pixel
 * and the tiles are fetched at the zoom the frame needs (not blown up from a coarser one). The stop dots, their
 * numbers and the credit line are painted on top in 2D with the same px/mm scale, which keeps them sharp and
 * independent of any glyph server. CORS: MapLibre fetches raster tiles with CORS requests, so a source without
 * `Access-Control-Allow-Origin` shows up as missing tiles (black), never as a tainted canvas; GIBS and
 * swisstopo send `*`; local tiles are served from the app's own origin.
 */
export interface BookMapSpec {
  box: Box;
  dpi: number;
  layers: JournalTileSource[];
  /** The route to fit (overview: all stops; stretch: previous and this footprint). */
  route: [number, number][];
  stops: { lng: number; lat: number; n: number }[];
  /** A great-circle arc ([lng, lat]); drawn instead of the straight `route` line, and part of the fitted area. */
  legPath?: [number, number][];
  /** Imagery credit, printed small in the lower left corner; omit it for maps that carry none. */
  credit?: string;
}

const IDLE_TIMEOUT_MS = 20_000;
const JPEG_QUALITY = 0.95;
const PAD_RATIO = 0.12;
const DOT_DIAMETER_MM = 3.8;
const LINE_MM = 0.7;
const CREDIT_MM = 1.9;

function idle(map: MapLibre.Map): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('book map: tiles did not finish loading')), IDLE_TIMEOUT_MS);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    map.once('idle', done); // fires once the pending tiles are in and the frame is drawn
  });
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('book map: JPEG export failed'))), 'image/jpeg', JPEG_QUALITY);
  });
}

function paintOverlay(ctx: CanvasRenderingContext2D, map: MapLibre.Map, spec: BookMapSpec, height: number): void {
  const radius = mmToPx(DOT_DIAMETER_MM, spec.dpi) / 2;
  for (const stop of spec.stops) {
    const p = map.project([stop.lng, stop.lat]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = Math.max(2, radius * 0.18);
    ctx.strokeStyle = '#10253d';
    ctx.stroke();
    ctx.fillStyle = '#10253d';
    ctx.font = `700 ${Math.round(radius * 1.1)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(stop.n), p.x, p.y + radius * 0.05);
  }
  if (spec.credit) {
    const size = mmToPx(CREDIT_MM, spec.dpi);
    const margin = mmToPx(2.5, spec.dpi);
    ctx.font = `${Math.round(size)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#d4d4d4';
    ctx.fillText(spec.credit, margin, height - margin);
  }
}

/** Renders one book map; the map and its container are gone again when the promise settles. */
export async function renderBookMap(spec: BookMapSpec): Promise<Blob> {
  const { width, height } = bookMapPixels(spec.box, spec.dpi);
  const lib = await loadMapLibre();
  const container = document.createElement('div');
  container.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:${height}px;pointer-events:none;`;
  document.body.appendChild(container);
  let map: MapLibre.Map | undefined;
  try {
    const line = spec.legPath && spec.legPath.length > 1 ? spec.legPath : spec.route;
    const fitted: LngLat[] = [...spec.route, ...(spec.legPath ?? []), ...spec.stops.map((s): LngLat => [s.lng, s.lat])];
    const bounds = bookMapBounds(fitted, PAD_RATIO);
    if (!bounds) throw new Error('book map: no positions to show');
    const dotPx = mmToPx(DOT_DIAMETER_MM, spec.dpi);
    const raster = spec.layers.filter((l) => l.kind !== 'vector');
    map = new lib.Map({
      container,
      style: rasterStyle(raster, '#000000'),
      bounds,
      fitBoundsOptions: { padding: Math.round(dotPx), maxZoom: bookMapMaxZoom(raster.map((l) => l.maxNativeZoom)) },
      pixelRatio: 1,
      maxCanvasSize: [8192, 8192],
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    const m = map;
    await new Promise<void>((resolve, reject) => {
      m.once('load', () => resolve());
      m.once('error', (e) => {
        // tile errors are normal (outside a layer's coverage); only a style that never loads is fatal
        if (!m.isStyleLoaded()) reject(e.error);
      });
    });
    if (line.length > 1) {
      m.addSource('line', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } } });
      const w = mmToPx(LINE_MM, spec.dpi);
      m.addLayer({ id: 'line-casing', type: 'line', source: 'line', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#10253d', 'line-width': w * 1.8 } });
      m.addLayer({ id: 'line', type: 'line', source: 'line', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ff7a3d', 'line-width': w } });
    }
    await idle(m);

    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('book map: no 2D canvas');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    const gl = m.getCanvas();
    ctx.drawImage(gl, 0, 0, width, height);
    paintOverlay(ctx, m, spec, height);
    const blob = await toBlob(out);
    out.width = 0;
    out.height = 0;
    return blob;
  } finally {
    map?.remove();
    container.remove();
  }
}
