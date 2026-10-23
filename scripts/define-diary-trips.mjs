#!/usr/bin/env node
/**
 * Turns former event slugs into travel trips (spec 1.114 follow-up to the event cleanup).
 *
 * `--defs=<json>` lists `{ event, id, title, from, to }` per trip: `event` is the old event slug the
 * cleanup removed (cleanup-diary-events.mjs, action `trip`), `id` the new trip id (`yyyymm00name`),
 * `from`/`to` StoreDates. The days that belong to a trip are the day files whose frontmatter carried
 * `event` BEFORE the cleanup — read from the cleanup backup (`--backup=<dir>`).
 *
 * For each trip it
 *   1. sets `trip: <id>` in those day files' frontmatter (a day that already has another trip is
 *      reported and left alone — a day belongs to at most one trip),
 *   2. creates the trip note `<archive>/collections/trips/<id>.md` (span, query, empty people) unless
 *      it exists,
 *   3. creates the Firestore trip `${tenant}__travel__<id>` with `.create()` (never overwrites; same
 *      shape as seed-diary-trips.mjs) and sets `tripKey` on those days' diary entries where empty.
 *
 * SAFETY: dry run is the DEFAULT, `--write` explicit; `--tenant` validated against app-config;
 * changed day files are copied to `--save=<dir>` (default ~/diary-trips-backup-<yyyymmdd>) first.
 * Prints ids, dates and counts only.
 *
 * Usage:
 *   node scripts/define-diary-trips.mjs --tenant=bka --archive=/Users/bruno/gdrive/archive \
 *        --backup=~/diary-events-cleanup-backup-20261023 --defs=<trip-defs.json> [--write]
 * Then: collection_build.py --apply.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? '';
const has = (name) => args.includes(`--${name}`);
const home = (p) => p.replace(/^~(?=\/|$)/, os.homedir());

const tenantId = flag('tenant');
const archive = home(flag('archive') || process.env.DIARY_ARCHIVE || '');
const backupDir = home(flag('backup'));
const defsFile = home(flag('defs'));
const isWrite = has('write');
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const saveDir = home(flag('save') || `~/diary-trips-backup-${today}`);

function fail(message) { console.error(`✖ ${message}`); process.exit(1); }
if (!tenantId) fail('--tenant=<id> is mandatory.');
if (!archive || !existsSync(archive)) fail('--archive=<path> is mandatory and must exist.');
if (!backupDir || !existsSync(backupDir)) fail('--backup=<cleanup backup dir> is mandatory and must exist.');
if (!defsFile) fail('--defs=<json> is mandatory.');

const defs = JSON.parse(readFileSync(defsFile, 'utf8'));
for (const d of defs) {
  if (!/^\d{6}00[a-z][A-Za-z0-9]*$/.test(d.id)) fail(`bad trip id ${d.id}`);
  if (!/^\d{8}$/.test(d.from) || !/^\d{8}$/.test(d.to) || d.from > d.to) fail(`bad span for ${d.id}`);
}
const byEvent = new Map(defs.map((d) => [d.event, d]));

const FM = /^---\r?\n([\s\S]*?)\r?\n---/;
const iso = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

// ─── find the days per trip in the cleanup backup ────────────────────────────────────────
/** trip id → [{ rel, date }] */
const days = new Map(defs.map((d) => [d.id, []]));
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== 'collections') walk(full); continue; }
    if (!name.endsWith('.md')) continue;
    const fm = readFileSync(full, 'utf8').match(FM)?.[1];
    const line = fm?.match(/^events:[ \t]*\[(.*)\]/m);
    if (!line) continue;
    const events = line[1].split(',').map((v) => v.trim());
    for (const ev of events) {
      const def = byEvent.get(ev);
      if (!def) continue;
      const date = fm.match(/^date:\s*["']?(\d{4}-?\d{2}-?\d{2})/m)?.[1]?.replace(/-/g, '') ?? '';
      days.get(def.id).push({ rel: path.relative(backupDir, full), date });
    }
  }
}
walk(backupDir);

// ─── Firestore ────────────────────────────────────────────────────────────────────────────
if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();
if (!(await db.collection('app-config').doc(tenantId).get()).exists) fail(`app-config/${tenantId} does not exist.`);
const diaries = (await db.collection('diaries').where('tenants', 'array-contains', tenantId).get()).docs;

let totalFiles = 0;
for (const def of defs) {
  const tripDays = days.get(def.id);
  const tripKey = `${tenantId}__travel__${def.id}`;
  const conflicts = [];
  let filesSet = 0;

  // 1. day files
  for (const { rel } of tripDays) {
    const live = path.join(archive, rel);
    if (!existsSync(live)) { conflicts.push(`missing ${rel}`); continue; }
    const text = readFileSync(live, 'utf8');
    const fm = text.match(FM)[1];
    const current = fm.match(/^trip:[ \t]*(\S*)/m)?.[1] ?? '';
    if (current === def.id) continue;
    if (current) { conflicts.push(`${rel} already trip ${current}`); continue; }
    filesSet++;
    if (isWrite) {
      const dest = path.join(saveDir, rel);
      mkdirSync(path.dirname(dest), { recursive: true });
      if (!existsSync(dest)) copyFileSync(live, dest);
      writeFileSync(live, text.replace(fm, `${fm}\ntrip: ${def.id}`));
    }
  }
  totalFiles += filesSet;

  // 2. trip note
  const note = path.join(archive, 'collections', 'trips', `${def.id}.md`);
  const noteExists = existsSync(note);
  if (isWrite && !noteExists) {
    writeFileSync(note, [
      '---', 'type: collection', 'kind: trip', `title: ${def.title}`, `span: ${iso(def.from)}..${iso(def.to)}`,
      `query: trip == ${def.id}`, 'people: []', '---', '', `# ${def.title}`, '', '_(Kuratierter Text folgt.)_', '',
      '## Tage', '', '<!-- AUTO:days -->', '<!-- /AUTO:days -->', '',
    ].join('\n'));
  }

  // 3. Firestore trip + tripKey
  const tripRef = db.collection('trips').doc(tripKey);
  const tripExists = (await tripRef.get()).exists;
  if (isWrite && !tripExists) {
    await tripRef.create({
      tenants: [tenantId], isArchived: false,
      name: def.title, type: 'travel',
      index: '', tags: '', notes: '',
      startDate: def.from, startTime: '', endDate: def.to, endTime: '',
      locations: [], customLocationLabel: '', distance: 0,
      participants: [], state: 'draft',
    });
  }
  const dates = new Set(tripDays.map((d) => d.date));
  const toLink = diaries.filter((d) => dates.has(d.get('date')) && !d.get('isArchived'));
  const linkable = toLink.filter((d) => !d.get('tripKey'));
  const otherTrip = toLink.filter((d) => d.get('tripKey') && d.get('tripKey') !== tripKey);
  if (isWrite) {
    const batch = db.batch();
    for (const d of linkable) batch.update(d.ref, { tripKey });
    if (linkable.length) await batch.commit();
  }

  console.log(`${def.id}  ${def.from}–${def.to}  days=${tripDays.length} files${isWrite ? 'Set' : 'ToSet'}=${filesSet}`
    + ` note=${noteExists ? 'exists' : (isWrite ? 'created' : 'toCreate')} trip=${tripExists ? 'exists' : (isWrite ? 'created' : 'toCreate')}`
    + ` tripKey${isWrite ? 'Set' : 'ToSet'}=${linkable.length}${otherTrip.length ? ` ⚠ otherTrip=${otherTrip.length}` : ''}`);
  for (const c of conflicts) console.log(`   ⚠ ${c}`);
}
console.log(`mode=${isWrite ? 'WRITE' : 'dry-run'} trips=${defs.length} dayFiles=${totalFiles}${isWrite ? ` backup=${saveDir}` : ''}`);
console.log('next: collection_build.py <archive> --apply');
