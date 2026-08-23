#!/usr/bin/env node
/**
 * Read-only verification for the diary-trip seeding (spec 1.34, Task 5).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * SAFETY
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *   This script performs ONLY Firestore reads (`.get()`). It never calls `create`, `set`,
 *   `update`, `delete`, or opens a batch/transaction. It is meant to run both BEFORE the
 *   seed (where it legitimately reports the trips as missing and exits non-zero) and AFTER
 *   it (where it should report a clean 39/39 pass), so it can be wired in as a gate.
 *
 *   `--tenant=<id>` is mandatory and VALIDATED against `app-config/<id>` before anything is
 *   read or counted, same as scripts/seed-diary-trips.mjs.
 *
 * This script reads a PRIVATE diary archive. It must never print a trip title or a person's
 * name — only slugs, date spans and counts reach the terminal, and slugs never reach a
 * committed file (this script prints them to the operator's own terminal for diagnosis only).
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? '';

const tenantId = flag('tenant');
const archive = flag('archive') || process.env.DIARY_ARCHIVE || '';

if (!tenantId) fail('--tenant=<id> is mandatory.');
if (!archive) fail('--archive=<path> or $DIARY_ARCHIVE is mandatory.');

let failed = false;
function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}
/** A soft failure: printed, remembered, but does not abort the remaining checks. */
function reportFailure(message) {
  console.error(`✖ ${message}`);
  failed = true;
}

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

// Collection names are inlined rather than imported: the models import '@okr/shared-constants',
// an alias jiti cannot resolve from a plain node script. Source of truth stays
// libs/shared/models/src/lib/{trip,person,alias}.model.ts.
const TripCollection = 'trips';
const PersonCollection = 'persons';
const AliasCollection = 'aliases';
const APP_CONFIG = 'app-config';

const configSnap = await db.collection(APP_CONFIG).doc(tenantId).get();
if (!configSnap.exists) {
  fail(`Tenant '${tenantId}' has no ${APP_CONFIG} document — refusing to run against an unknown tenant.`);
}

/** trip_type category value, decided in Task 2 — 'travel' is live with all five translations shipped. */
const TRIP_TYPE = 'travel';

// ═══════════════════════════════════════════════════════════════════════════════════════
// Copied library functions, each guarded by a behaviour fingerprint (comments/whitespace
// stripped, sha256, first 16 hex chars) so silent drift between the copy and the source is
// caught rather than producing a wrong verification result.
// ═══════════════════════════════════════════════════════════════════════════════════════

function fingerprint(text) {
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/\s+/g, '');
  return createHash('sha256').update(stripped).digest('hex').slice(0, 16);
}
function checkFingerprint(files, expected, label) {
  const combined = files.map((f) => readFileSync(f, 'utf8')).join('\n');
  const actual = fingerprint(combined);
  if (actual !== expected) {
    fail(`${label} drifted: ${files.join(', ')} no longer match the copy in this script `
      + `(fingerprint ${actual}, expected ${expected}). Re-copy the function(s), then update the constant.`);
  }
}

/**
 * The slug function is duplicated from libs/system/alias/util/src/lib/alias-slug.util.ts
 * because a plain node script cannot resolve '@okr/*'. Keep the two identical.
 */
const FOLD = {
  ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'ae', Ö: 'oe', Ü: 'ue',
  ß: 'ss', ẞ: 'ss',
  ø: 'oe', Ø: 'oe', æ: 'ae', Æ: 'ae', œ: 'oe', Œ: 'oe',
  ð: 'd', Ð: 'd', þ: 'th', Þ: 'th', ł: 'l', Ł: 'l', đ: 'd', Đ: 'd',
};
function toAliasSlug(label) {
  const folded = [...label].map((char) => FOLD[char] ?? char).join('');
  return folded.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
checkFingerprint(
  [path.join(ROOT, 'libs/system/alias/util/src/lib/alias-slug.util.ts')],
  'dd9ffb84093ccc9b',
  'toAliasSlug',
);

/**
 * Copied from libs/content/diary/util/src/lib/trip-collection.ts (parseTripCollection) because a
 * plain node script cannot resolve '@okr/*'. Keep the two identical.
 */
const FRONTMATTER = /^---\n([\s\S]*?)\n---/;
const SPAN = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/;

function field(front, key) {
  return new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(front)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
}

function parseTripCollection(fileName, text) {
  const front = FRONTMATTER.exec(text)?.[1];
  if (!front) throw new Error(`${fileName}: no frontmatter`);
  if (field(front, 'kind') !== 'trip') throw new Error(`${fileName}: kind is not 'trip'`);

  const slug = fileName.replace(/\.md$/, '');
  const querySlug = /^trip\s*==\s*(.+)$/.exec(field(front, 'query'))?.[1]?.trim() ?? '';
  if (querySlug !== slug) {
    throw new Error(`${fileName}: query slug '${querySlug}' does not match the file name slug '${slug}'`);
  }

  const span = SPAN.exec(field(front, 'span'));
  if (!span) throw new Error(`${fileName}: span must be 'YYYY-MM-DD..YYYY-MM-DD'`);

  const inline = /^people:\s*\[(.*)\]\s*$/m.exec(front)?.[1] ?? '';
  const people = inline.split(',').map((v) => v.trim().replace(/^["']|["']$/g, '')).filter(Boolean);

  return { slug, title: field(front, 'title'), startDate: span[1], endDate: span[2], people };
}
checkFingerprint(
  [path.join(ROOT, 'libs/content/diary/util/src/lib/trip-collection.ts')],
  '3b76764d2ecbef2a',
  'parseTripCollection',
);

/**
 * Diary file matching + frontmatter scalar extraction, copied from
 * libs/content/diary/util/src/lib/diary-file.ts (DIARY_FILE_NAME) and
 * libs/content/diary/util/src/lib/{diary-parse,diary-frontmatter}.ts (frontmatter split/parse
 * and fmScalar), reduced to the single scalar key ('trip') this script needs. Keep identical.
 */
const DIARY_FILE_NAME = /^\d{8}diary.*\.md$/;
const FENCE = '---\n';
const KEY_LINE = /^([A-Za-z_][\w-]*):(.*)$/;

function splitFrontmatter(text) {
  if (!text.startsWith(FENCE)) return { block: '', body: text };
  const end = text.indexOf(`\n${FENCE}`, FENCE.length - 1);
  if (end < 0) return { block: '', body: text };
  return { block: text.slice(FENCE.length, end), body: text.slice(end + 1 + FENCE.length) };
}
function parseFrontmatterEntries(block) {
  if (block === '') return [];
  const entries = [];
  for (const line of block.split('\n')) {
    const match = KEY_LINE.exec(line);
    if (match) {
      entries.push({ key: match[1], raw: match[2] });
    } else if (entries.length > 0) {
      entries[entries.length - 1].raw += `\n${line}`;
    }
  }
  return entries;
}
function fmScalar(entries, key) {
  const raw = entries.find((e) => e.key === key)?.raw;
  if (raw === undefined) return '';
  const trimmed = raw.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 1 ? trimmed.slice(1, -1) : trimmed;
}
checkFingerprint(
  [
    path.join(ROOT, 'libs/content/diary/util/src/lib/diary-file.ts'),
    path.join(ROOT, 'libs/content/diary/util/src/lib/diary-parse.ts'),
    path.join(ROOT, 'libs/content/diary/util/src/lib/diary-frontmatter.ts'),
  ],
  '157024511ee17175',
  'DIARY_FILE_NAME / frontmatter parsing',
);

function walk(dir, filter, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, filter, found);
    else if (filter.test(entry)) found.push(full);
  }
  return found;
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 1. trips documents for the tenant, and how many match the `<tenant>__travel__*` id pattern.
// ═══════════════════════════════════════════════════════════════════════════════════════

const tripSnap = await db.collection(TripCollection).where('tenants', 'array-contains', tenantId).get();
const tripIdPattern = new RegExp(`^${tenantId}__travel__.+$`);
const travelTripIds = new Set(tripSnap.docs.map((d) => d.id).filter((id) => tripIdPattern.test(id)));

console.log(`\n1) trips for tenant '${tenantId}': ${tripSnap.size} total, `
  + `${travelTripIds.size} matching '${tenantId}__travel__*'`);
if (travelTripIds.size !== 39) {
  reportFailure(`expected 39 '${tenantId}__travel__*' trip documents, found ${travelTripIds.size}.`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 2. Every diary `trip:` slug resolves to a document at trips/<tenant>__travel__<slug>.
// ═══════════════════════════════════════════════════════════════════════════════════════

const diaryFiles = walk(archive, DIARY_FILE_NAME);
const referencedSlugs = new Set();
let referenceCount = 0;
for (const f of diaryFiles) {
  const text = readFileSync(f, 'utf8');
  const { block } = splitFrontmatter(text);
  const entries = parseFrontmatterEntries(block);
  const slug = fmScalar(entries, 'trip');
  if (slug === '') continue;
  referenceCount++;
  referencedSlugs.add(slug);
}

const missing = [...referencedSlugs].filter((slug) => !travelTripIds.has(`${tenantId}__travel__${slug}`));

console.log(`2) diary files scanned: ${diaryFiles.length}, 'trip:' references: ${referenceCount}, `
  + `distinct slugs: ${referencedSlugs.size}, unresolvable: ${missing.length}`);
if (missing.length > 0) {
  console.log('   unresolvable slugs (for diagnosis on this terminal only, never committed):');
  for (const slug of missing) console.log(`     ${slug}`);
  reportFailure(`${missing.length} diary 'trip:' slug(s) have no matching trips document.`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 3. Participant statistics (counts only) — how many of the 39 trip files have >=1
//    resolvable participant, and total resolved participants vs total 'people' entries.
// ═══════════════════════════════════════════════════════════════════════════════════════

const tripsDir = path.resolve(archive, '..', 'collections', 'trips');
const tripFiles = readdirSync(tripsDir).filter((f) => f.endsWith('.md'));
const tripCollectionFiles = tripFiles.map((f) => parseTripCollection(f, readFileSync(path.join(tripsDir, f), 'utf8')));

const aliasSnap = await db.collection(AliasCollection)
  .where('tenants', 'array-contains', tenantId)
  .where('isArchived', '==', false)
  .where('space', '==', 'person')
  .get();
const aliasIds = new Set(aliasSnap.docs.map((d) => d.id));

let tripsWithParticipant = 0;
let totalResolved = 0;
let totalPeopleEntries = 0;
for (const trip of tripCollectionFiles) {
  totalPeopleEntries += trip.people.length;
  let resolvedHere = 0;
  for (const slug of trip.people) {
    if (aliasIds.has(`${tenantId}__person__${toAliasSlug(slug)}`)) resolvedHere++;
  }
  totalResolved += resolvedHere;
  if (resolvedHere > 0) tripsWithParticipant++;
}

console.log(`3) trip collection files: ${tripCollectionFiles.length}, `
  + `with >=1 resolvable participant: ${tripsWithParticipant}, `
  + `resolved participants: ${totalResolved} / total 'people' entries: ${totalPeopleEntries}`);

// ═══════════════════════════════════════════════════════════════════════════════════════

if (failed) {
  console.error('\n✖ verification FAILED — see above.');
  process.exit(1);
}
console.log('\n✓ verification passed.');
process.exit(0);
