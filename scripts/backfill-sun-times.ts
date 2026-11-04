/**
 * Repairs `weather.sunrise` / `weather.sunset` on diary entries. Open-Meteo shifted every date by the zone's offset
 * of the day it was asked, so a bulk fetch in summer left winter days an hour late (see toZoneTime in
 * apps/functions/src/diary/weather.ts). Nothing records which times came from a file and which from the API, so each
 * day entry with measured weather and a located main place is recomputed and compared (classifySunTimes).
 *
 * Dry run is the DEFAULT: it asks Open-Meteo and reports, it writes nothing. `--write` updates only the two sun fields
 * of 'shifted' and 'polar' entries, in batches of 400; the old values go to `--backup` first. Idempotent: a repaired
 * entry compares as 'same'. A range Open-Meteo did not answer leaves its entries untouched; run again.
 * Prints counts only — never titles, places or diary text. The backup holds document ids and times only.
 *
 * Options: `--tenant ID` mandatory, `--limit N` only the first N coordinate ranges, `--delay MS` pause between ranges
 * (default 500), `--backup PATH` (default dist/scripts/sun-times-backup-<tenant>.json).
 *
 * Usage (deploy the toZoneTime fix first, so no wrong values are added meanwhile):
 *   pnpm exec esbuild scripts/backfill-sun-times.ts --bundle --platform=node --packages=external \
 *     --format=cjs --outfile=dist/scripts/backfill-sun-times.cjs
 *   node dist/scripts/backfill-sun-times.cjs --tenant ID                  # dry run
 *   node dist/scripts/backfill-sun-times.cjs --tenant ID --write
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { classifySunTimes, clockDiff, SunVerdict } from '../apps/functions/src/diary/sun-repair';
import { fetchWeatherRange, planWeatherRanges } from '../apps/functions/src/diary/weather';

const DIARIES = 'diaries';
const LOCATIONS = 'locations';
const APP_CONFIG = 'app-config';
const BATCH_SIZE = 400;
const READ_SIZE = 300;
const RETRIES = 3;
const RETRY_WAIT = 65_000;

interface Entry { okey: string; date: string; latitude: number; longitude: number; sunrise: string; sunset: string }
interface Fix { okey: string; old: { sunrise: string; sunset: string }; sunrise: string; sunset: string }

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const tenantId = arg('--tenant');
  if (!tenantId) throw new Error('--tenant is mandatory');
  const isWrite = process.argv.includes('--write');
  const limit = Number(arg('--limit') ?? Infinity);
  const delay = Number(arg('--delay') ?? 500);
  const backup = arg('--backup') ?? `dist/scripts/sun-times-backup-${tenantId}.json`;

  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
  const db = getFirestore();
  if (!(await db.collection(APP_CONFIG).doc(tenantId).get()).exists) throw new Error(`no ${APP_CONFIG} for this tenant`);

  const docs = (await db.collection(DIARIES).where('tenants', 'array-contains', tenantId).get()).docs;
  const measured = docs.filter((d) => d.get('scope') === 'day' && (d.get('weather')?.code ?? -1) >= 0);

  const locationKeys = [...new Set(measured.map((d) => d.get('locations')?.[0]?.key as string | undefined).filter((k): k is string => !!k))];
  const coords = new Map<string, { latitude: number; longitude: number }>();
  for (let i = 0; i < locationKeys.length; i += READ_SIZE) {
    const refs = locationKeys.slice(i, i + READ_SIZE).map((k) => db.collection(LOCATIONS).doc(k));
    for (const snap of await db.getAll(...refs)) {
      const { latitude, longitude } = snap.data() ?? {};
      if (Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude !== 0 || longitude !== 0)) coords.set(snap.id, { latitude, longitude });
    }
  }

  const entries: Entry[] = [];
  for (const d of measured) {
    const place = coords.get(d.get('locations')?.[0]?.key ?? '');
    if (!place) continue;
    const weather = d.get('weather');
    entries.push({ okey: d.id, date: d.get('date'), ...place, sunrise: weather.sunrise ?? '', sunset: weather.sunset ?? '' });
  }

  const today = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const ranges = planWeatherRanges(entries, today).slice(0, limit);
  const counts: Record<SunVerdict | 'noAnswer', number> = { same: 0, shifted: 0, polar: 0, missing: 0, other: 0, noAnswer: 0 };
  const byYear = new Map<string, number>();
  const fixes: Fix[] = [];
  const otherDiffs = new Map<string, number>();
  let failedRanges = 0;

  for (const range of ranges) {
    let rows = await fetchWeatherRange(range);
    for (let attempt = 0; rows.size === 0 && attempt < RETRIES; attempt++) {
      await sleep(RETRY_WAIT); // the per-minute limit answers like an outage
      rows = await fetchWeatherRange(range);
    }
    if (rows.size === 0) failedRanges++;
    const inRange = entries.filter((e) => e.latitude === range.latitude && e.longitude === range.longitude
      && e.date >= range.startDate.replaceAll('-', '') && e.date <= range.endDate.replaceAll('-', ''));
    for (const entry of inRange) {
      const row = rows.get(entry.date);
      if (!row) { counts.noAnswer++; continue; }
      const fresh = { sunrise: row.sunrise ?? '', sunset: row.sunset ?? '' };
      const verdict = classifySunTimes(entry, fresh);
      counts[verdict]++;
      if (verdict === 'other' && entry.sunrise && fresh.sunrise) {
        const bucket = String(Math.round(clockDiff(entry.sunrise, fresh.sunrise) / 5) * 5);
        otherDiffs.set(bucket, (otherDiffs.get(bucket) ?? 0) + 1);
      }
      if (verdict === 'shifted' || verdict === 'polar') {
        const year = entry.date.slice(0, 4);
        byYear.set(year, (byYear.get(year) ?? 0) + 1);
        fixes.push({ okey: entry.okey, old: { sunrise: entry.sunrise, sunset: entry.sunset }, ...fresh });
      }
    }
    await sleep(delay);
  }

  console.log(`diary docs ${docs.length}, measured days ${measured.length}, with coordinates ${entries.length}`);
  console.log(`ranges ${ranges.length}, without an answer ${failedRanges}`);
  console.log(counts);
  console.log("'other': sunrise difference in minutes", Object.fromEntries([...otherDiffs].sort(([a], [b]) => Number(a) - Number(b))));
  console.log('to repair per year', Object.fromEntries([...byYear].sort(([a], [b]) => a.localeCompare(b))));
  if (!isWrite) { console.log('dry run: nothing written'); return; }

  mkdirSync(dirname(backup), { recursive: true });
  writeFileSync(backup, JSON.stringify(fixes.map(({ okey, old }) => ({ okey, ...old }))));
  for (let i = 0; i < fixes.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const fix of fixes.slice(i, i + BATCH_SIZE)) {
      batch.update(db.collection(DIARIES).doc(fix.okey), { 'weather.sunrise': fix.sunrise, 'weather.sunset': fix.sunset });
    }
    await batch.commit();
  }
  console.log(`written ${fixes.length}, backup ${backup}`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : 'failed'); process.exit(1); });
