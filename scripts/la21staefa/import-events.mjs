#!/usr/bin/env node
/**
 * One-off import of the LA21 WordPress calendar into calevents (spec 1.165 §8.4, plan Task 9).
 *
 *   node scripts/la21staefa/import-events.mjs --map <mapping.json> [--tenant la21staefa] [--since 2025-01-01] [--write]
 *
 * Dry run by default: fetches `stec/v5/events` from www.la21staefa.ch, maps every event
 * (stec-mapping.mjs), expands series with the app's own `calculateRecurringDates`
 * (@okr/shared-util-core, bundled from source), and prints one line per event with its warnings.
 * Nothing is written without --write. With --write it creates one calevent per date (a series shares
 * one seriesId, as the app materialises it) through the Admin SDK — run it once, after the tenant and
 * its groups exist (plan Task 10), and check the dry run first.
 *
 * The mapping file names what the plugin's REST API does not expose:
 *   { "groups": { "41": "reparatur", … }, "locations": { "46": "Alte Krone, Goethestrasse 14, 8712 Stäfa", … } }
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

import { mapStecEvent, occurrenceDates } from './stec-mapping.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rootRequire = createRequire(join(ROOT, 'package.json'));
const SOURCE = 'https://www.la21staefa.ch/wp-json/stec/v5/events?per_page=100';

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function arg(name, fallback = '') {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}

/** calculateRecurringDates of @okr/shared-util-core, bundled from source like the website parity harness. */
function loadRecurring() {
  const esbuild = rootRequire('esbuild');
  const out = esbuild.buildSync({
    stdin: { contents: "export { calculateRecurringDates } from './libs/shared/util-core/src/lib/date.util';", resolveDir: ROOT, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', target: 'node22', write: false, logLevel: 'silent',
    tsconfig: join(ROOT, 'tsconfig.base.json'),
  });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, rootRequire);
  return mod.exports.calculateRecurringDates;
}

async function main() {
  const mapFile = arg('--map');
  if (!mapFile) fail('Usage: node scripts/la21staefa/import-events.mjs --map <mapping.json> [--tenant la21staefa] [--since 2025-01-01] [--write]');
  const tenant = arg('--tenant', 'la21staefa');
  const since = arg('--since', '2025-01-01').replace(/-/g, '');
  const write = process.argv.includes('--write');
  const map = JSON.parse(readFileSync(resolve(mapFile), 'utf8'));
  const recurring = loadRecurring();

  const res = await fetch(SOURCE, { headers: { Accept: 'application/json' } });
  if (!res.ok) fail(`Fetching ${SOURCE} failed: HTTP ${res.status}`);
  const events = await res.json();

  const planned = [];
  for (const e of events) {
    const { model, exdates, warnings } = mapStecEvent(e, map);
    const dates = occurrenceDates(model, exdates, recurring).filter((d) => d >= since);
    console.log(`${model.startDate} ${model.startTime || 'ganztags'}  ${model.periodicity.padEnd(8)} ${String(dates.length).padStart(3)}×  ${model.calendars.join(',').padEnd(24)} ${model.name}`);
    for (const w of warnings) console.log(`    ⚠ ${w}`);
    if (dates.length > 0) planned.push({ model, dates });
  }
  const total = planned.reduce((n, p) => n + p.dates.length, 0);
  console.log(`\n${events.length} events read, ${planned.length} to import as ${total} calevents (from ${since}).`);
  if (!write) {
    console.log('Dry run: nothing written. Add --write to create them.');
    return;
  }

  const { getApps, initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  if (!getApps().length) initializeApp();
  const db = getFirestore();
  let written = 0;
  for (const { model, dates } of planned) {
    const seriesId = dates.length > 1 ? randomBytes(10).toString('hex') : '';
    let batch = db.batch();
    let inBatch = 0;
    for (const startDate of dates) {
      const ref = db.collection('calevents').doc();
      batch.set(ref, {
        ...model, startDate, seriesId, tenants: [tenant], isArchived: false, type: model.type || 'other', tags: '',
        index: `n:${model.name.toLowerCase()}`, attendees: [], responsiblePersons: [], maxAttendees: 0, notifyOnAnswer: false,
        commentNotify: 'default', cancelMessage: '', isLocked: false, columnLabel: '', pollMultiSelect: false,
        activityCount: 0, lastActivityAt: '', courseKey: '', attendance: {},
      });
      if (++inBatch === 400) { await batch.commit(); written += inBatch; batch = db.batch(); inBatch = 0; }
    }
    if (inBatch > 0) { await batch.commit(); written += inBatch; }
  }
  console.log(`Wrote ${written} calevents for tenant ${tenant}.`);
}

main().catch((e) => fail(e.stack ?? String(e)));
