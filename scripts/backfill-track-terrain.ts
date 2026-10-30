/**
 * Backfills terrain heights (spec 1.128) on every uploaded tracker Strecke whose GPS heights are too sparse — in
 * practice every Strecke recorded before the Höhenprofil shipped. Per trip it reads trips/{key}/track-points/*,
 * samples up to 100 points, asks swisstopo (all points in Switzerland) or Open-Meteo (elsewhere, and as the
 * fallback) and writes `terrainAltitudes` + `terrainProvider` on each section doc — exactly what the Strecke page
 * does on first view (same util, same provider adapters as getTerrainElevations), so the page then finds them.
 *
 * Dry run is the DEFAULT and makes no external calls: it only counts what would be looked up. `--write` looks the
 * heights up and writes them. Idempotent: a trip whose docs already carry terrain heights, or that has enough GPS
 * heights, is skipped. Archived trips are skipped. Calls run one trip at a time with a pause (fair use of the two
 * open-data services). Prints counts only — never coordinates or names (a route is personal data).
 *
 * Options: `--limit N` stops after N lookups (try a few first), `--delay MS` pause between trips (default 500).
 *
 * Usage (bundled first: the repo runs .ts scripts as ESM, where extension-less imports fail):
 *   pnpm exec esbuild scripts/backfill-track-terrain.ts --bundle --platform=node --packages=external \
 *     --format=cjs --outfile=dist/scripts/backfill-track-terrain.cjs
 *   node dist/scripts/backfill-track-terrain.cjs                     # dry run
 *   node dist/scripts/backfill-track-terrain.cjs --write --limit 3   # try three
 *   node dist/scripts/backfill-track-terrain.cjs --write
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { decodeTrack } from '../libs/mobility/tracker/util/src/lib/track-polyline.util';
import {
  decodeAltitudes, encodeAltitudes, needsTerrain, terrainAltitudes, terrainSamples, withAltitudes,
} from '../libs/mobility/tracker/util/src/lib/track-elevation.util';
import {
  ElevationParams, inSwitzerland, openMeteoElevationAdapter, swisstopoElevationAdapter,
} from '../apps/functions/src/_gateway/adapters/elevation';
import { tooSparse } from '../apps/functions/src/elevation/index';

const TRIPS = 'trips';
const TRACK_POINTS = 'track-points';
const TRACKER_TRIP_TYPE = 'tracker';

interface PointsDoc {
  mode: string;
  encoded: string;
  altitudes?: string;
  terrainAltitudes?: string;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Same choice as getTerrainElevations: swisstopo when every point is in Switzerland and it answers densely enough. */
async function lookUp(params: ElevationParams): Promise<{ alts: (number | null)[]; provider: string }> {
  // the adapters' fetch ignores the gateway context; the backfill bypasses the gateway (no cache, no quota bucket)
  const ctx = { tenantId: '', uid: null, isAdmin: true };
  if (params.points.every(inSwitzerland)) {
    try {
      const alts = swisstopoElevationAdapter.map(await swisstopoElevationAdapter.fetch(params, ctx), params);
      if (!tooSparse(alts)) return { alts, provider: swisstopoElevationAdapter.attribution.provider };
    } catch {
      // fall through to Open-Meteo, like the callable
    }
  }
  const alts = openMeteoElevationAdapter.map(await openMeteoElevationAdapter.fetch(params, ctx), params);
  return { alts, provider: openMeteoElevationAdapter.attribution.provider };
}

async function main(): Promise<void> {
  const isWrite = process.argv.includes('--write');
  const limit = Number(arg('--limit') ?? Infinity);
  const delayMs = Number(arg('--delay') ?? 500);
  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
  const db = getFirestore();

  const trips = await db.collection(TRIPS).where('type', '==', TRACKER_TRIP_TYPE).get();
  const counts: Record<string, number> = {};
  const count = (key: string) => { counts[key] = (counts[key] ?? 0) + 1; };
  let lookups = 0;

  for (const trip of trips.docs) {
    if (trip.data()['isArchived'] === true) { count('skip (archived)'); continue; }
    const snap = await trip.ref.collection(TRACK_POINTS).get();
    const docs = snap.docs
      .map((d) => ({ ref: d.ref, n: Number(d.id), data: d.data() as PointsDoc }))
      .filter((d) => Number.isInteger(d.n) && typeof d.data.encoded === 'string')
      .sort((a, b) => a.n - b.n);
    if (docs.length === 0) { count('skip (no points)'); continue; }
    if (docs.every((d) => d.data.terrainAltitudes)) { count('skip (terrain already stored)'); continue; }

    const sections = docs.map((d) => {
      const decoded = decodeTrack(d.data.encoded);
      // mode is a TransportMode string; only 'plane' matters to the util
      return { mode: d.data.mode as never, points: withAltitudes(decoded, decodeAltitudes(d.data.altitudes, decoded.length)) };
    });
    if (!needsTerrain(sections)) { count('skip (enough GPS heights or too few points)'); continue; }
    const samples = terrainSamples(sections);
    if (samples.length < 2) { count('skip (too few points)'); continue; }

    if (lookups >= limit) { count('pending (over --limit)'); continue; }
    lookups++;
    if (!isWrite) { count('would look up'); continue; }

    try {
      const { alts, provider } = await lookUp({ points: samples.map((s) => ({ lat: s.lat, lng: s.lng })) });
      if (alts.every((a) => a === null)) { count('failed (no heights returned)'); continue; }
      const perSection = terrainAltitudes(sections, samples, alts);
      const batch = db.batch();
      let writes = 0;
      docs.forEach((d, i) => {
        const encoded = encodeAltitudes((perSection[i] ?? []).map((alt) => ({ alt })));
        if (!encoded) return;
        batch.update(d.ref, { terrainAltitudes: encoded, terrainProvider: provider });
        writes++;
      });
      if (writes > 0) await batch.commit();
      count(`written (${provider})`);
    } catch (error) {
      count('failed (lookup or write)');
      console.warn(`trip ${trip.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await sleep(delayMs);
  }

  console.log(`${isWrite ? 'WRITE' : 'DRY RUN'} — ${trips.size} tracker trips`);
  for (const [key, n] of Object.entries(counts).sort()) console.log(`  ${key}: ${n}`);
  if (!isWrite) console.log('Nothing written. Re-run with --write (optionally --limit N) to look up and store.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
