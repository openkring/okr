#!/usr/bin/env node
/**
 * Seeds the 39 travel trips from the diary archive's trip collections (spec 1.34, Task 3).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * SAFETY
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *   --dry-run is the DEFAULT. `--write` must be explicit.
 *   `--tenant=<id>` is mandatory and VALIDATED against `app-config/<id>` before anything is
 *   read or counted — a typo would otherwise be written into every trip document id, where
 *   it cannot be corrected in place because the id IS the lookup key.
 *
 * Trips are created with `.create()`, never `set()`: the document id is deterministic, so a
 * second run would otherwise silently overwrite a trip someone has since edited in the app.
 *
 * This script reads a PRIVATE diary archive. It must never print a trip title or a person's
 * name — only slugs, date spans and counts reach the terminal.
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
const has = (name) => args.includes(`--${name}`);

const tenantId = flag('tenant');
const archive = flag('archive') || process.env.DIARY_ARCHIVE || '';
const isWrite = has('write');

if (!tenantId) fail('--tenant=<id> is mandatory.');
if (!archive) fail('--archive=<path> or $DIARY_ARCHIVE is mandatory.');

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
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
  fail(`Tenant '${tenantId}' has no ${APP_CONFIG} document — refusing to write its id into trip ids.`);
}

/** trip_type category value, decided in Task 2 — 'travel' is live with all five translations shipped. */
const TRIP_TYPE = 'travel';

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
  return folded.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * The copied toAliasSlug must stay behaviourally identical to the library's. Comments and
 * formatting are stripped before hashing, so documentation edits do not trip the guard while
 * any change to the FOLD map or the transform chain does.
 */
const LIB_SLUG = path.join(ROOT, 'libs/system/alias/util/src/lib/alias-slug.util.ts');
const LIB_SLUG_FINGERPRINT = 'dd9ffb84093ccc9b';
const libSlugBehaviour = readFileSync(LIB_SLUG, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')
  .replace(/\s+/g, '');
const actualSlugFingerprint = createHash('sha256').update(libSlugBehaviour).digest('hex').slice(0, 16);
if (actualSlugFingerprint !== LIB_SLUG_FINGERPRINT) {
  fail(`toAliasSlug drifted: ${LIB_SLUG} no longer matches the copy in this script `
     + `(fingerprint ${actualSlugFingerprint}, expected ${LIB_SLUG_FINGERPRINT}). Re-copy the function `
     + 'and the FOLD map, then update LIB_SLUG_FINGERPRINT.');
}

/**
 * Copied from libs/content/diary/util/src/lib/trip-collection.ts (parseTripCollection) because a
 * plain node script cannot resolve '@okr/*'. Keep the two identical — see the fingerprint below.
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

/**
 * The copied parseTripCollection must stay behaviourally identical to the library's. Comments
 * and formatting are stripped before hashing, so documentation edits do not trip the guard while
 * any change to the parsing logic does.
 */
const LIB_TRIP_COLLECTION = path.join(ROOT, 'libs/content/diary/util/src/lib/trip-collection.ts');
const LIB_TRIP_COLLECTION_FINGERPRINT = '3b76764d2ecbef2a';
const libTripBehaviour = readFileSync(LIB_TRIP_COLLECTION, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')
  .replace(/\s+/g, '');
const actualTripFingerprint = createHash('sha256').update(libTripBehaviour).digest('hex').slice(0, 16);
if (actualTripFingerprint !== LIB_TRIP_COLLECTION_FINGERPRINT) {
  fail(`parseTripCollection drifted: ${LIB_TRIP_COLLECTION} no longer matches the copy in this script `
     + `(fingerprint ${actualTripFingerprint}, expected ${LIB_TRIP_COLLECTION_FINGERPRINT}). Re-copy the `
     + 'function, then update LIB_TRIP_COLLECTION_FINGERPRINT.');
}

function markdownFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? markdownFiles(full) : (full.endsWith('.md') ? [full] : []);
  });
}

/**
 * Deterministic id, same reasoning as the aliases and the diaries: the id IS the lookup key,
 * so a second run is an upsert of the same document rather than a duplicate trip.
 */
function tripDocId(tenantId, slug) {
  return `${tenantId}__${TRIP_TYPE}__${slug}`;
}

/** People slugs → AvatarInfo, through the SAME aliases the diary import will read. */
async function resolveParticipants(db, tenantId, slugs) {
  const out = [];
  for (const slug of slugs) {
    const alias = await db.collection(AliasCollection).doc(`${tenantId}__person__${toAliasSlug(slug)}`).get();
    if (!alias.exists) continue;                       // unknown person stays out; not an error
    const okey = (alias.data().targetKey ?? '').split('.')[1];
    if (!okey) continue;
    const p = await db.collection(PersonCollection).doc(okey).get();
    if (!p.exists) continue;
    const d = p.data();
    out.push({
      key: okey, name1: d.firstName ?? '', name2: d.lastName ?? '',
      modelType: 'person', type: '', subType: '', label: `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim(),
    });
  }
  return out;
}

function buildTrip(tenantId, trip, participants) {
  return {
    tenants: [tenantId], isArchived: false,
    name: trip.title,
    type: TRIP_TYPE,                    // decided in Task 2
    index: '', tags: '', notes: '',
    startDate: trip.startDate, startTime: '',
    endDate: trip.endDate, endTime: '',
    locations: [], customLocationLabel: '', distance: 0,
    participants,
    state: 'draft',
  };
}

const tripsDir = path.resolve(archive, '..', 'collections', 'trips');
const trips = markdownFiles(tripsDir)
  .map((full) => parseTripCollection(path.basename(full), readFileSync(full, 'utf8')));

let existing = 0;
let created = 0;
let alreadyExisted = 0;

for (const trip of trips) {
  const docId = tripDocId(tenantId, trip.slug);
  const participants = await resolveParticipants(db, tenantId, trip.people);
  const doc = buildTrip(tenantId, trip, participants);
  const ref = db.collection(TripCollection).doc(docId);

  if (!isWrite) {
    const snap = await ref.get();
    if (snap.exists) existing++;
    console.log(`${snap.exists ? '=' : '+'} ${trip.slug} ${trip.startDate}..${trip.endDate} `
      + `participants=${participants.length}${snap.exists ? ' (exists)' : ''}`);
    continue;
  }

  try {
    await ref.create(doc);
    created++;
    console.log(`+ created ${trip.slug}`);
  } catch (error) {
    // .create() throws ALREADY_EXISTS (gRPC code 6). That is the point: a re-run must not
    // overwrite a trip someone has since edited in the app.
    if (error?.code === 6) { alreadyExisted++; console.log(`= exists ${trip.slug}`); continue; }
    throw error;
  }
}

if (!isWrite) {
  console.log(`\n${trips.length} trips · ${existing} existing`);
} else {
  console.log(`\n${created} created · ${alreadyExisted} already existed`);
}
process.exit(0);
