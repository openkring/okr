import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import axios from 'axios';
import * as admin from 'firebase-admin';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PNG } from 'pngjs';

import { METEOSWISS_RADAR_KEY, WeatherRadarCollection, WeatherRadarFrame, WeatherRadarModel } from '@okr/shared-models';
import {
  OdimWhere, RadarProjection, RadarSourceFile, buildRadarProjection, framePath, mergeFrames, paintRadarFrame,
  selectNewFiles, stacItemIdsForWindow,
} from './meteoswiss-radar.util';

const STAC_ITEMS_URL = 'https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-radar-precip/items';

/** Frames are named by their measurement time and never rewritten. */
const FRAME_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Minimal surface of h5wasm used here (the package is ESM-only and has no CJS typings). */
interface H5Attr { value: unknown }
interface H5Node { attrs: Record<string, H5Attr>; value: ArrayLike<number> }
interface H5File { get(path: string): H5Node; close(): void }
interface H5Module { ready: Promise<unknown>; File: new (filename: string, mode: string) => H5File }

/** A variable, not a literal: the functions' `moduleResolution: node` cannot see the package's `exports` typings. */
const H5WASM_MODULE = 'h5wasm/node';

let h5: H5Module | undefined;
/** Cold-start cache: the projection depends only on the grid, which is the same for every frame. */
let projection: { key: string; value: RadarProjection } | undefined;

/**
 * Loaded on first use, never at module scope: every Cloud Function shares one `main.cjs`, and
 * h5wasm carries a 4 MB embedded WebAssembly build that no other function needs. The package is
 * also `external` in apps/functions/project.json, so it is not bundled at all.
 */
async function loadH5(): Promise<H5Module> {
  if (!h5) {
    const mod = (await import(H5WASM_MODULE)) as unknown as { default?: H5Module } & H5Module;
    h5 = mod.default ?? mod;
    await h5.ready;
  }
  return h5;
}

function readWhere(file: H5File): OdimWhere {
  const attrs = file.get('where').attrs;
  const num = (key: string): number => Number(attrs[key]?.value);
  return {
    projdef: String(attrs['projdef']?.value),
    xsize: num('xsize'), ysize: num('ysize'), xscale: num('xscale'), yscale: num('yscale'),
    UL_lon: num('UL_lon'), UL_lat: num('UL_lat'), UR_lon: num('UR_lon'), UR_lat: num('UR_lat'),
    LL_lon: num('LL_lon'), LL_lat: num('LL_lat'), LR_lon: num('LR_lon'), LR_lat: num('LR_lat'),
  };
}

/**
 * Downloads one PRECIP file, decodes it and returns the painted PNG.
 *
 * The values are rain rates in mm/h as float64 (`gain` 1, `offset` 0); NaN marks pixels outside
 * the radar range, 0 is dry. Both are checked rather than assumed: a product change at MeteoSwiss
 * should fail loudly in the log, not paint a wrong picture.
 */
async function renderFile(file: RadarSourceFile): Promise<{ png: Buffer; bounds: RadarProjection['bounds']; wet: number }> {
  const { data } = await axios.get<ArrayBuffer>(file.href, { responseType: 'arraybuffer', timeout: 20_000 });
  const tmp = path.join(os.tmpdir(), file.name);
  await fs.writeFile(tmp, Buffer.from(data));
  const lib = await loadH5();
  const h5file = new lib.File(tmp, 'r');
  try {
    const what = h5file.get('dataset1/data1/what').attrs;
    const gain = Number(what['gain']?.value);
    const offset = Number(what['offset']?.value);
    if (gain !== 1 || offset !== 0 || what['unit']?.value !== 'mm/h') {
      throw new Error(`unexpected encoding gain=${gain} offset=${offset} unit=${String(what['unit']?.value)}`);
    }

    const where = readWhere(h5file);
    const key = JSON.stringify(where);
    if (projection?.key !== key) projection = { key, value: buildRadarProjection(where) };
    const proj = projection.value;

    const rates = h5file.get('dataset1/data1/data').value;
    if (rates.length !== where.xsize * where.ysize) throw new Error(`grid size ${rates.length}`);
    const { rgba, wet } = paintRadarFrame(rates, proj);

    const png = new PNG({ width: proj.width, height: proj.height });
    png.data = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
    return { png: PNG.sync.write(png, { deflateLevel: 9 }), bounds: proj.bounds, wet };
  } finally {
    h5file.close();
    await fs.rm(tmp, { force: true });
  }
}

/**
 * Renders the MeteoSwiss precipitation radar (PRECIP, 1 km, every 5 min) into transparent Web
 * Mercator PNGs for the `rain_radar` widget (spec 1.110).
 *
 * Every run reads the day's STAC item, renders each PRECIP file of the last 6 h that is not yet
 * a frame, stores the PNGs under weather/radar/meteoswiss/ (kept for good — the archive, O4) and
 * rewrites the rolling frame list in `weather-radar/meteoswiss`. Idempotent: a file is skipped
 * once its time is in the list, so an overlapping or retried run only repeats the STAC read, and
 * a missed run is caught up by the next one.
 */
export const fetchMeteoSwissRadar = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'Europe/Zurich',
    region: 'europe-west6',
    memory: '512MiB',
    timeoutSeconds: 300,
    maxInstances: 1,
  },
  async () => {
    const db = admin.firestore();
    const ref = db.collection(WeatherRadarCollection).doc(METEOSWISS_RADAR_KEY);
    const now = Math.floor(Date.now() / 1000);

    const existing = (await ref.get()).data() as WeatherRadarModel | undefined;
    const known = new Set((existing?.frames ?? []).map((f) => f.time));

    const assets: Record<string, { href: string }> = {};
    for (const itemId of stacItemIdsForWindow(now)) {
      try {
        const { data } = await axios.get<{ assets: Record<string, { href: string }> }>(
          `${STAC_ITEMS_URL}/${itemId}`, { timeout: 20_000 });
        Object.assign(assets, data.assets);
      } catch (error) {
        // just after midnight UTC today's item may not exist yet; yesterday's still carries the window
        logger.warn(`fetchMeteoSwissRadar: STAC item ${itemId} not readable`, error);
      }
    }

    const files = selectNewFiles(assets, known, now);
    if (!files.length) {
      logger.info('fetchMeteoSwissRadar: no new radar file');
      return;
    }

    const bucket = admin.storage().bucket();
    const added: WeatherRadarFrame[] = [];
    let bounds = existing?.bounds;
    for (const file of files) {
      try {
        const rendered = await renderFile(file);
        const target = framePath(file.time);
        await bucket.file(target).save(rendered.png, {
          contentType: 'image/png', resumable: false, metadata: { cacheControl: FRAME_CACHE_CONTROL },
        });
        added.push({ time: file.time, path: target });
        bounds = rendered.bounds;
        logger.debug(`fetchMeteoSwissRadar: ${file.name} → ${target} (${rendered.png.length} B, ${rendered.wet} wet px)`);
      } catch (error) {
        // one broken file must not cost the others; it is retried on the next run while inside the window
        logger.error(`fetchMeteoSwissRadar: ${file.name} failed`, error);
      }
    }
    if (!added.length || !bounds) return;

    // okey is the document id, never a stored field
    const doc: Omit<WeatherRadarModel, 'okey'> = {
      tenants: ['system'],
      source: 'meteoswiss',
      frames: mergeFrames(existing?.frames ?? [], added, now),
      bounds,
      updatedAt: new Date().toISOString(),
    };
    await ref.set(doc);
    logger.info(`fetchMeteoSwissRadar: ${added.length} new frame(s), ${doc.frames.length} in the list`);
  }
);
