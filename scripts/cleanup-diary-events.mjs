#!/usr/bin/env node
/**
 * Applies a curated event-slug mapping to the diary (spec 1.114 §2.4 follow-up).
 *
 * The mapping is the CSV produced for the cleanup (columns: slug, tage, notiz, erster_tag,
 * letzter_tag, varianten, aktion). `aktion` is one of
 *   behalten | (empty)       keep the slug
 *   entfernen                 drop the slug from every day
 *   zusammen:<slug>           replace by <slug> (merge into an existing or new event)
 *   rename:<slug>             replace by <slug> and create that event (same effect as zusammen)
 *   trip                      drop the slug from the events; reported as a trip candidate
 *
 * Three places are kept in step:
 *   1. the day files' frontmatter `events: [..]` in the Drive archive (the source of truth),
 *   2. Firestore `diaries.events[]` of the tenant (only the events field is patched; Jass result
 *      lines and any other non-slug value stay untouched — see parseJassDiaryLine, spec 1.77),
 *   3. the notes in `<archive>/collections/events/`: notes of dropped slugs are deleted, a template
 *      note is created for every resulting slug that has none. All notes were templates on
 *      2026-10-23 (no curated text). Afterwards run collection_build.py to fill their day lists.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * SAFETY
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *   --dry-run is the DEFAULT. `--write` must be explicit.
 *   `--tenant=<id>` is mandatory and validated against `app-config/<id>`.
 *   With --write every file it changes or deletes is first copied to `--backup=<dir>`
 *   (default ~/diary-events-cleanup-backup-<yyyymmdd>), keeping its archive-relative path.
 *   It prints slugs and counts only — never titles, texts or Jass lines.
 *
 * Usage:
 *   node scripts/cleanup-diary-events.mjs --tenant=bka --archive=/Users/bruno/gdrive/archive \
 *        --mapping=/Users/bruno/Desktop/events-cleanup-done.csv [--write] [--backup=<dir>]
 *
 * Then: collection_build.py (apply), backfill-diary-album-keys.mjs, seed-diary-event-albums.mjs.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? '';
const has = (name) => args.includes(`--${name}`);

const tenantId = flag('tenant');
const archive = flag('archive') || process.env.DIARY_ARCHIVE || '';
const mappingFile = flag('mapping');
const isWrite = has('write');
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const backupDir = flag('backup') || path.join(os.homedir(), `diary-events-cleanup-backup-${today}`);

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}
if (!tenantId) fail('--tenant=<id> is mandatory.');
if (!archive) fail('--archive=<path> or $DIARY_ARCHIVE is mandatory.');
if (!mappingFile) fail('--mapping=<csv> is mandatory.');
const eventsDir = path.join(archive, 'collections', 'events');
if (!existsSync(eventsDir)) fail(`no events folder at ${eventsDir}`);

/** Same shape as the app's event slug rule (diary-album.validations.ts SLUG_PATTERN). */
const SLUG = /^[a-z][A-Za-z0-9]*$/;
/** A value of events[] that is a slug at all (Jass lines and other text are not touched). */
const SLUG_LIKE = /^[A-Za-z0-9_-]+$/;

/** `birthday_bruno` → `birthdayBruno`: the app rejects underscores in slugs. */
function camelize(value) {
  return value.replace(/[_-]+([A-Za-z0-9])/g, (_, c) => c.toUpperCase());
}

/** `kantiWohlen` → `Kanti Wohlen`, `rain65` → `Rain65`. */
function titleOf(slug) {
  const words = slug.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ─── mapping ──────────────────────────────────────────────────────────────────────────────
function parseCsv(text) {
  const sep = text.split('\n', 1)[0].includes(';') ? ';' : ',';
  const rows = [];
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = '';
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === sep && !quoted) { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    rows.push(cells.map((c) => c.trim()));
  }
  return rows.slice(1);
}

/** slug → { kind, target } */
const mapping = new Map();
const problems = [];
for (const row of parseCsv(readFileSync(mappingFile, 'utf8'))) {
  const slug = row[0];
  const action = (row[6] ?? '').trim();
  const [rawKind, ...rest] = action.split(':');
  const kind = (rawKind || 'behalten').trim().toLowerCase();
  let target = rest.join(':').trim();
  if (kind === 'zusammen' || kind === 'rename') {
    target = camelize(target);
    if (!SLUG.test(target)) problems.push(`${slug}: target "${target}" is not a valid slug`);
  } else if (!['behalten', 'entfernen', 'trip'].includes(kind)) {
    problems.push(`${slug}: unknown action "${action}"`);
  }
  mapping.set(slug, { kind, target });
}
if (problems.length) fail(`mapping has problems:\n  ${problems.join('\n  ')}`);

/** The slugs a source slug becomes ([] = dropped). Unknown slugs are kept and reported. */
const unknownSlugs = new Set();
function mapSlug(slug) {
  const entry = mapping.get(slug);
  if (!entry) { unknownSlugs.add(slug); return [slug]; }
  if (entry.kind === 'entfernen' || entry.kind === 'trip') return [];
  if (entry.kind === 'zusammen' || entry.kind === 'rename') return [entry.target];
  return [slug];
}

/** Maps a whole events list; non-slug values (Jass lines) are kept in place. */
function mapEvents(values) {
  const out = [];
  for (const value of values) {
    const mapped = SLUG_LIKE.test(value) ? mapSlug(value) : [value];
    for (const v of mapped) if (!out.includes(v)) out.push(v);
  }
  return out;
}

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

function backup(file) {
  if (!isWrite) return;
  const dest = path.join(backupDir, path.relative(archive, file));
  mkdirSync(path.dirname(dest), { recursive: true });
  if (!existsSync(dest)) copyFileSync(file, dest);
}

// ─── 1. day files ─────────────────────────────────────────────────────────────────────────
const EVENTS_LINE = /^events:[ \t]*\[(.*)\][ \t]*$/m;
const tripDays = new Map();   // trip slug → dates
const resultSlugs = new Set();
let filesScanned = 0;
let filesChanged = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (full === path.join(archive, 'collections')) continue;
    const st = statSync(full);
    if (st.isDirectory()) { walk(full); continue; }
    if (!name.endsWith('.md')) continue;
    const text = readFileSync(full, 'utf8');
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) continue;
    const line = fm[1].match(EVENTS_LINE);
    if (!line) continue;
    filesScanned++;
    const before = line[1].split(',').map((v) => v.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    for (const v of before) {
      if (mapping.get(v)?.kind === 'trip') {
        const date = fm[1].match(/^date:\s*["']?(\d{4}-?\d{2}-?\d{2})/m)?.[1]?.replace(/-/g, '') ?? name.slice(0, 8);
        tripDays.set(v, [...(tripDays.get(v) ?? []), date]);
      }
    }
    const after = mapEvents(before);
    for (const v of after) if (SLUG_LIKE.test(v)) resultSlugs.add(v);
    if (same(before, after)) continue;
    filesChanged++;
    if (isWrite) {
      backup(full);
      const newFm = fm[1].replace(EVENTS_LINE, `events: [${after.join(', ')}]`);
      writeFileSync(full, text.replace(fm[1], newFm));
    }
  }
}
walk(archive);

// ─── 2. notes ─────────────────────────────────────────────────────────────────────────────
// The resulting event set = kept slugs + merge/rename targets, whether or not a day uses them now.
for (const [slug, { kind, target }] of mapping) {
  if (kind === 'behalten') resultSlugs.add(slug);
  if (kind === 'zusammen' || kind === 'rename') resultSlugs.add(target);
}
const noteSlugs = readdirSync(eventsDir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));
const notesToDelete = noteSlugs.filter((s) => !resultSlugs.has(s));
const notesToCreate = [...resultSlugs].filter((s) => SLUG.test(s) && !noteSlugs.includes(s)).sort();
const invalidResults = [...resultSlugs].filter((s) => !SLUG.test(s));

if (isWrite) {
  for (const slug of notesToDelete) {
    const file = path.join(eventsDir, `${slug}.md`);
    backup(file);
    unlinkSync(file);
  }
  for (const slug of notesToCreate) {
    const title = titleOf(slug);
    writeFileSync(path.join(eventsDir, `${slug}.md`), [
      '---', 'type: collection', 'kind: event', `title: ${title}`, `query: ${slug} in events`, '---', '',
      `# ${title}`, '', '_(Kuratierter Text folgt.)_', '', '## Tage', '', '<!-- AUTO:days -->', '<!-- /AUTO:days -->', '',
    ].join('\n'));
  }
}

// ─── 3. Firestore ─────────────────────────────────────────────────────────────────────────
if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();
if (!(await db.collection('app-config').doc(tenantId).get()).exists) fail(`app-config/${tenantId} does not exist.`);

const snapshot = await db.collection('diaries').where('tenants', 'array-contains', tenantId).get();
const updates = [];
for (const doc of snapshot.docs) {
  const events = Array.isArray(doc.get('events')) ? doc.get('events') : [];
  const after = mapEvents(events);
  if (!same(events, after)) updates.push({ ref: doc.ref, events: after });
}
if (isWrite) {
  for (let i = 0; i < updates.length; i += 400) {
    const batch = db.batch();
    for (const u of updates.slice(i, i + 400)) batch.update(u.ref, { events: u.events });
    await batch.commit();
  }
}

// ─── report ───────────────────────────────────────────────────────────────────────────────
console.log(`mode=${isWrite ? 'WRITE' : 'dry-run'} tenant=${tenantId}`);
console.log(`dayFiles scanned=${filesScanned} ${isWrite ? 'changed' : 'toChange'}=${filesChanged}`);
console.log(`firestore diaries scanned=${snapshot.size} ${isWrite ? 'updated' : 'toUpdate'}=${updates.length}`);
console.log(`events after cleanup=${resultSlugs.size}`);
console.log(`notes ${isWrite ? 'deleted' : 'toDelete'}=${notesToDelete.length}: ${notesToDelete.join(', ')}`);
console.log(`notes ${isWrite ? 'created' : 'toCreate'}=${notesToCreate.length}: ${notesToCreate.join(', ')}`);
if (invalidResults.length) console.log(`⚠ slugs kept that the app would reject (no note created): ${invalidResults.join(', ')}`);
if (unknownSlugs.size) console.log(`⚠ slugs not in the mapping (kept): ${[...unknownSlugs].sort().join(', ')}`);
console.log('trip candidates (removed from events):');
for (const [slug, dates] of [...tripDays].sort()) {
  const sorted = [...dates].sort();
  console.log(`  ${slug}  days=${dates.length}  ${sorted[0]}–${sorted[sorted.length - 1]}`);
}
if (isWrite) console.log(`backup of changed/deleted files: ${backupDir}`);
console.log('next: collection_build.py --apply → backfill-diary-album-keys.mjs → seed-diary-event-albums.mjs');
