#!/usr/bin/env node
/**
 * Migrates the diary entries of one tenant to `locations[]` / free-text `people[]`
 * (spec 1.117 D6, planning/specs/2026-10-24-diary-locations-list-spec.md).
 *
 * Per `diaries` document that has NO `locations` field yet but at least one legacy field:
 *   - `locations` = the main location (`location`, else `customLocationLabel`), then every
 *     `places[]` entry, in order. Each free-text label is resolved through the location alias
 *     `aliases/<tenant>__location__<normaliseLocationLabel(label)>` first, then through an exact
 *     normalised match on the tenant's location names (only when that name is unambiguous);
 *     otherwise it stays free text with its text unchanged. Duplicates are dropped (diaryAvatarId).
 *   - `people` += every `customPeopleLabels[]` entry as a free-text person, without duplicates.
 *   - `location`, `customLocationLabel`, `places`, `customPeopleLabels` are deleted;
 *     `albumKeys` and `index` are recomputed.
 * A document that already HAS `locations` was saved by the new app and its edits win: it is not
 * migrated. If it still carries legacy fields (FirestoreService.updateModel uses updateDoc, which
 * leaves fields the app no longer writes), only those dead fields are deleted — `locations`,
 * `people`, `albumKeys` and `index` are not touched.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * SAFETY
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *   Dry run is the DEFAULT. `--write` must be explicit.
 *   `--tenant=<id>` is mandatory and VALIDATED against `app-config/<id>`.
 *   `--write` also needs `--backup=<file>`: a NEW file OUTSIDE this repository. Before the first
 *   batch, the original values of every field this run changes are written there (mode 0600),
 *   so a mistake can be reverted. It holds names from a private diary — never commit it.
 *   Every write carries a `lastUpdateTime` precondition: a document edited in the app after it
 *   was read fails its batch instead of being overwritten. Re-run the script then; it is
 *   idempotent (a migrated document has `locations` and is skipped).
 *   Batches of 400. Prints counts only: never titles, names, places or diary text.
 *
 * The library functions below are COPIES (a plain node script cannot resolve '@okr/*'). Each copy
 * is guarded by a fingerprint over the source of the copied declarations, so a later change to the
 * library makes this script refuse to run instead of silently disagreeing with the app. A built-in
 * self-test runs the copies on known cases before anything is read.
 *
 * Usage:
 *   node scripts/migrate-diary-locations.mjs --tenant=<id>                                  # dry run
 *   node scripts/migrate-diary-locations.mjs --tenant=<id> --write --backup=<outside-repo.json>
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
/** The main checkout; worktrees live elsewhere, so it is checked explicitly as well. */
const MAIN_CHECKOUT = '/Users/bruno/proj/bkaiser/okr';

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? '';
const isWrite = args.includes('--write');
const tenantId = flag('tenant');
const backupFlag = flag('backup');

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

if (!tenantId) fail('--tenant=<id> is mandatory.');

let backupPath = '';
if (isWrite) {
  if (!backupFlag) fail('--write needs --backup=<file> (a new file outside the repository).');
  backupPath = path.resolve(backupFlag);
  const parent = path.dirname(backupPath);
  if (!existsSync(parent)) fail(`--backup directory ${parent} does not exist.`);
  // Real paths, case-folded (APFS is case-insensitive), against this worktree AND the main
  // checkout: a symlink or a different spelling must not smuggle the file into a repository.
  const realBackup = path.join(realpathSync(parent), path.basename(backupPath)).toLowerCase();
  const repoRoots = [ROOT, MAIN_CHECKOUT].filter((r) => existsSync(r)).map((r) => realpathSync(r).toLowerCase());
  for (const root of repoRoots) {
    if (realBackup === root || realBackup.startsWith(root + path.sep)) {
      fail(`--backup must lie OUTSIDE the repository (${root}). The file holds names from a private diary.`);
    }
  }
  if (existsSync(backupPath)) fail(`--backup file ${backupPath} already exists — refusing to overwrite it.`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Fingerprint guard
// ═══════════════════════════════════════════════════════════════════════════════════════

const stripToBehaviour = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')
  .replace(/\s+/g, '');
const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** Whole-file fingerprint, identical to scripts/seed-diary-locations.mjs. */
function fingerprintOf(filePath) {
  return hash(stripToBehaviour(readFileSync(filePath, 'utf8')));
}

/**
 * The source of one top-level declaration: from its first line up to the next line that starts
 * a new top-level declaration or comment at column 0.
 */
const TOP_LEVEL_START = /^(export |function |async |const |let |interface |type |class |import |\/\*|\/\/)/;
function declarationSource(source, name, filePath) {
  const lines = source.split('\n');
  const startRe = new RegExp(`^(export )?(async )?(function|const|let|interface|type) ${name}\\b`);
  const start = lines.findIndex((l) => startRe.test(l));
  if (start < 0) fail(`'${name}' not found in ${filePath} — the copy in this script is stale.`);
  let end = start + 1;
  while (end < lines.length && !TOP_LEVEL_START.test(lines[end])) end++;
  return lines.slice(start, end).join('\n');
}

/** Fingerprint over just the named declarations, so unrelated edits in the file do not block. */
function fingerprintOfDeclarations(filePath, names) {
  const source = readFileSync(filePath, 'utf8');
  return hash(names.map((n) => stripToBehaviour(declarationSource(source, n, filePath))).join('|'));
}

const GUARDS = [];
function guard(what, filePath, expected, names) {
  GUARDS.push({ what, filePath, expected, names });
}
function assertGuards() {
  for (const { what, filePath, expected, names } of GUARDS) {
    const actual = names ? fingerprintOfDeclarations(filePath, names) : fingerprintOf(filePath);
    if (actual !== expected) {
      fail(`${what} drifted: ${path.relative(ROOT, filePath)} no longer matches the copy in this script `
        + `(fingerprint ${actual}, expected ${expected}). Re-copy the function(s), then update the `
        + 'fingerprint constant.');
    }
  }
}

const LIB = (p) => path.join(ROOT, 'libs', p);

// ═══════════════════════════════════════════════════════════════════════════════════════
// Copied library functions — keep each identical to its source.
// ═══════════════════════════════════════════════════════════════════════════════════════

/** Copied from libs/content/diary/util/src/lib/location-normalise.ts. Keep the two identical. */
const CANTONS = new Set([
  'ag', 'ai', 'ar', 'be', 'bl', 'bs', 'fr', 'ge', 'gl', 'gr', 'ju', 'lu', 'ne',
  'nw', 'ow', 'sg', 'sh', 'so', 'sz', 'tg', 'ti', 'ur', 'vd', 'vs', 'zg', 'zh',
]);
const COUNTRIES = new Set([
  'switzerland', 'schweiz', 'suisse', 'italy', 'italia', 'italien', 'france', 'frankreich',
  'germany', 'deutschland', 'austria', 'oesterreich', 'spain', 'spanien', 'espana',
]);
const LOCATION_FOLD = {
  'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'ae', 'Ö': 'oe', 'Ü': 'ue', 'ß': 'ss',
};
function normaliseLocationLabel(raw) {
  const folded = [...raw].map((c) => LOCATION_FOLD[c] ?? c).join('');
  const segments = folded.split(',').map((s) => s.trim()).filter(Boolean);
  if (segments.length > 1) {
    const last = segments[segments.length - 1].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (COUNTRIES.has(last)) segments.pop();
  }
  const slug = segments.join('-')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const parts = slug.split('-');
  while (parts.length > 1 && CANTONS.has(parts[parts.length - 1])) parts.pop();
  return parts.join('-');
}
guard('normaliseLocationLabel', LIB('content/diary/util/src/lib/location-normalise.ts'), '0818759018552aa4');

/** Copied from libs/content/diary/util/src/lib/diary-avatar.util.ts. Keep the two identical. */
const LEGACY_DIARY_FIELDS = ['location', 'customLocationLabel', 'places', 'customPeopleLabels'];
function collapseWhitespace(value) {
  return value.trim().replace(/\s+/g, ' ');
}
function customLocationAvatar(label) {
  const text = collapseWhitespace(label);
  return { key: '', name1: text, name2: '', label: text, modelType: 'location', type: '', subType: '' };
}
function customPersonAvatar(label) {
  const parts = collapseWhitespace(label).split(' ');
  const name1 = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
  const name2 = parts[parts.length - 1];
  return { key: '', name1, name2, label: '', modelType: 'person', type: '', subType: '' };
}
function diaryAvatarName(a) {
  return a.label || `${a.name1} ${a.name2}`.trim();
}
function diaryAvatarId(a) {
  if (a.key) return `key:${a.key}`;
  const name = diaryAvatarName(a);
  const plain = name.trim().toLowerCase();
  return a.modelType === 'location' ? `label:${normaliseLocationLabel(name) || plain}` : `label:${plain}`;
}
function addDiaryAvatar(list, a) {
  const id = diaryAvatarId(a);
  return list.some((x) => diaryAvatarId(x) === id) ? list : [...list, a];
}
function needsDiaryLocationMigration(raw) {
  const record = raw;
  if (record['locations'] !== undefined && record['locations'] !== null) return false;
  return LEGACY_DIARY_FIELDS.some((k) => k in record);
}
function isEmptyAvatar(a) {
  return !a.key && !(a.label || `${a.name1 ?? ''} ${a.name2 ?? ''}`).trim();
}
function migrateDiaryReferences(raw, resolveLocation) {
  const fromText = (label) =>
    label.trim() ? (resolveLocation(label) ?? customLocationAvatar(label)) : undefined;

  let locations = [];
  const main = raw.location && !isEmptyAvatar(raw.location) ? raw.location : fromText(raw.customLocationLabel ?? '');
  if (main && !isEmptyAvatar(main)) locations = addDiaryAvatar(locations, main);
  for (const place of raw.places ?? []) {
    const avatar = fromText(place ?? '');
    if (avatar && !isEmptyAvatar(avatar)) locations = addDiaryAvatar(locations, avatar);
  }

  let people = raw.people ?? [];
  for (const label of raw.customPeopleLabels ?? []) {
    if ((label ?? '').trim()) people = addDiaryAvatar(people, customPersonAvatar(label));
  }
  return { locations, people };
}
guard('diary avatar util', LIB('content/diary/util/src/lib/diary-avatar.util.ts'), '8002e8a53451613c', [
  'LEGACY_DIARY_FIELDS', 'collapseWhitespace', 'customLocationAvatar', 'customPersonAvatar', 'diaryAvatarName',
  'diaryAvatarId', 'addDiaryAvatar', 'needsDiaryLocationMigration', 'isEmptyAvatar', 'migrateDiaryReferences',
]);

/** Copied from libs/content/diary/util/src/lib/diary-jass.util.ts. Keep the two identical. */
const JASS_PREFIX = 'Jass ';
const SEP = ' · ';
const PER_SIDE = /^(.+?) (-?\d+(?: : -?\d+)+)$/;
const SIDE_SCORE = /^(.*\S)\s+(-?\d+)$/;
const HANDS = /^\d+ \S.*$/;
function perSide(part, count) {
  const m = part?.match(PER_SIDE);
  if (!m) return undefined;
  const values = m[2].split(' : ').map(Number);
  return values.length === count ? { label: m[1], values } : undefined;
}
function parseJassDiaryLine(line) {
  if (!line.startsWith(JASS_PREFIX)) return undefined;
  const parts = line.split(SEP);
  if (parts.length < 5 || parts.length > 6) return undefined;

  const head = parts[0].slice(JASS_PREFIX.length);
  const colon = head.indexOf(': ');
  if (colon <= 0) return undefined;
  const variant = head.slice(0, colon);
  const sides = head.slice(colon + 2).split(' : ').map((s) => s.match(SIDE_SCORE));
  if (sides.length < 2 || sides.some((s) => !s)) return undefined;

  const weis = perSide(parts[2], sides.length);
  const matches = perSide(parts[3], sides.length);
  if (!weis || !matches || !HANDS.test(parts[4])) return undefined;

  const winColon = parts[1].indexOf(': ');
  const winnerNames = winColon > 0 ? parts[1].slice(winColon + 2) : '';
  return {
    variant,
    sides: sides.map((m, i) => {
      const names = m[1];
      return { names, score: Number(m[2]), weis: weis.values[i], matches: matches.values[i], isWinner: names === winnerNames };
    }),
    isDraw: !winnerNames,
    weisLabel: weis.label,
    matchesLabel: matches.label,
    handsLabel: parts[4],
    duration: parts[5] ?? '',
  };
}
guard('parseJassDiaryLine', LIB('content/diary/util/src/lib/diary-jass.util.ts'), '606712e9a50f7d7c', [
  'JASS_PREFIX', 'SEP', 'PER_SIDE', 'SIDE_SCORE', 'HANDS', 'perSide', 'parseJassDiaryLine',
]);

/** Copied from libs/content/diary/util/src/lib/diary-album.util.ts. Keep the two identical. */
function albumKey(kind, ref) {
  return `${kind}.${ref}`;
}
function diaryAlbumKeys(diary) {
  const keys = new Set();
  for (const person of diary.people ?? []) {
    if (person.key) keys.add(albumKey('person', person.key));
  }
  for (const location of diary.locations ?? []) {
    if (location.key) keys.add(albumKey('location', location.key));
  }
  for (const event of diary.events ?? []) {
    if (event && !parseJassDiaryLine(event)) keys.add(albumKey('event', event));
  }
  for (const tag of (diary.tags ?? '').split(',')) {
    const trimmed = tag.trim();
    if (trimmed) keys.add(albumKey('tag', trimmed));
  }
  return [...keys].sort();
}
guard('diaryAlbumKeys', LIB('content/diary/util/src/lib/diary-album.util.ts'), '1543221a6a12f852', ['albumKey', 'diaryAlbumKeys']);

/** Copied from libs/shared/util-core/src/lib/base-model.util.ts. Keep the two identical. */
function addIndexElement(index, key, value) {
  if (!key || key.length === 0) {
    return index;
  }
  if (typeof (value) === 'string') {
    if (value.length === 0 || (value.length === 1 && value.startsWith(' '))) {
      return index;
    }
  }
  if (index.length === 0) {
    return `${key}:${value}`;
  }
  return `${index} ${key}:${value}`;
}
guard('addIndexElement', LIB('shared/util-core/src/lib/base-model.util.ts'), '5eea8fd091bd9741', ['addIndexElement']);

/** Copied from libs/content/diary/util/src/lib/diary-index.util.ts. Keep the two identical. */
function getDiaryIndex(diary) {
  let index = '';
  index = addIndexElement(index, 'd', diary.date);
  index = addIndexElement(index, 't', diary.title ?? '');
  index = addIndexElement(index, 'l', (diary.locations ?? []).map(diaryAvatarName).filter(Boolean).join(' '));
  index = addIndexElement(index, 'p', (diary.people ?? []).map(diaryAvatarName).filter(Boolean).join(' '));
  index = addIndexElement(index, 'e', (diary.events ?? []).join(' '));
  return index;
}
guard('getDiaryIndex', LIB('content/diary/util/src/lib/diary-index.util.ts'), '17939631914dbe23', ['getDiaryIndex']);

/**
 * The avatar of a linked location, as the app writes it (`locationAvatar` in
 * libs/content/diary/feature/src/lib/diary.store.ts).
 */
function locationAvatar(okey, location) {
  const name = location.name ?? '';
  return { key: okey, name1: name, name2: '', label: name, modelType: 'location', type: location.type ?? '', subType: '' };
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Self-test of the copies (mirrors diary-avatar.util.spec.ts) — runs before anything is read.
// ═══════════════════════════════════════════════════════════════════════════════════════

function selfTest() {
  const eq = (actual, expected, what) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      fail(`self-test failed: ${what}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    }
  };
  const bern = { key: 'l1', name1: 'Bern', name2: '', label: 'Bern', modelType: 'location', type: '', subType: '' };
  const zh = { key: 'l2', name1: 'Zürich', name2: '', label: 'Zürich', modelType: 'location', type: '', subType: '' };
  eq(needsDiaryLocationMigration({ locations: [], places: ['x'] }), false, 'needs: has locations');
  eq(needsDiaryLocationMigration({ places: ['x'] }), true, 'needs: legacy only');
  eq(needsDiaryLocationMigration({ title: 't' }), false, 'needs: nothing');
  eq(migrateDiaryReferences({ location: bern, places: ['bern'] }, (l) => (l === 'bern' ? bern : undefined)).locations.map((a) => a.key),
    ['l1'], 'resolved place dedupes against main');
  eq(migrateDiaryReferences({ customLocationLabel: 'Uetliberg', places: ['zuerich', 'irgendwo-am-see'] },
    (l) => (l === 'zuerich' ? zh : undefined)).locations.map(diaryAvatarName), ['Uetliberg', 'Zürich', 'irgendwo-am-see'], 'order');
  eq(migrateDiaryReferences({ places: ['Zürich ZH', 'zuerich'] }, () => undefined).locations.length, 1, 'free-text dedupe');
  eq(migrateDiaryReferences({ customLocationLabel: ' ', places: [''], customPeopleLabels: [' '] }, () => undefined),
    { locations: [], people: [] }, 'blank labels');
  eq(migrateDiaryReferences({ people: [], customPeopleLabels: ['Anna Maria Muster', 'anna maria muster'] }, () => undefined).people,
    [{ key: '', name1: 'Anna Maria', name2: 'Muster', label: '', modelType: 'person', type: '', subType: '' }], 'person split');
  eq(migrateDiaryReferences({ customLocationLabel: 'Αθήνα', places: ['北京', '🏔️', 'αθήνα'] }, () => undefined).locations.map(diaryAvatarName),
    ['Αθήνα', '北京', '🏔️'], 'empty normalised form falls back to the text');
  eq(migrateDiaryReferences({ location: { key: '', name1: '', name2: '', label: '' }, customLocationLabel: 'Bern' }, () => undefined).locations.map(diaryAvatarName),
    ['Bern'], 'empty location object falls through');
  eq(normaliseLocationLabel('Zürich ZH'), 'zuerich', 'normalise');
  const jass = 'Jass Schieber: Anna & Clara 2530 : Beat & Dora 1870 · Gewonnen: Anna & Clara · Weis 340 : 120 · Match 3 : 0 · 12 Runden';
  eq(diaryAlbumKeys({ people: [{ key: 'p1' }, { key: '' }], locations: [bern, customLocationAvatar('X')], events: ['ostern', jass], tags: 'b, a' }),
    ['event.ostern', 'location.l1', 'person.p1', 'tag.a', 'tag.b'], 'albumKeys');
  eq(getDiaryIndex({ date: '20240101', title: 'T', locations: [bern, customLocationAvatar('See')], people: [customPersonAvatar('Anna Muster')], events: ['ostern'] }),
    'd:20240101 t:T l:Bern See p:Anna Muster e:ostern', 'index');
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════════════════

assertGuards();
selfTest();

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

// Inlined rather than imported (the models import '@okr/shared-constants'). Source of truth:
// libs/shared/models/src/lib/{diary,alias,location}.model.ts.
const DiaryCollection = 'diaries';
const AliasCollection = 'aliases';
const LocationCollection = 'locations';
const APP_CONFIG = 'app-config';
const LOCATION_SPACE = 'location';

const configSnap = await db.collection(APP_CONFIG).doc(tenantId).get();
if (!configSnap.exists) fail(`Tenant '${tenantId}' has no ${APP_CONFIG} document.`);

// Single-field `array-contains` queries only (no composite index needed); the rest is filtered
// in memory — this is a one-off over a few thousand documents.
const [locationSnap, aliasSnap] = await Promise.all([
  db.collection(LocationCollection).where('tenants', 'array-contains', tenantId).get(),
  db.collection(AliasCollection).where('tenants', 'array-contains', tenantId).get(),
]);

/** okey -> location, non-archived only */
const locationsByKey = new Map();
/** normalised name -> okey, or null when two locations share the normalised name (ambiguous) */
const locationByName = new Map();
for (const doc of locationSnap.docs) {
  const data = doc.data();
  if (data.isArchived === true) continue;
  locationsByKey.set(doc.id, data);
  const normalised = normaliseLocationLabel(data.name ?? '');
  if (!normalised) continue;
  locationByName.set(normalised, locationByName.has(normalised) ? null : doc.id);
}
const ambiguousNames = [...locationByName.values()].filter((v) => v === null).length;

/** alias doc id -> location okey; enabled, non-archived location aliases whose target exists */
const aliasTarget = new Map();
let aliasesDangling = 0;
for (const doc of aliasSnap.docs) {
  const data = doc.data();
  if (data.space !== LOCATION_SPACE || data.isArchived === true || data.isEnabled === false) continue;
  const [type, okey] = String(data.targetKey ?? '').split('.');
  if (type !== 'location' || !okey || !locationsByKey.has(okey)) { aliasesDangling++; continue; }
  aliasTarget.set(doc.id, okey);
}

const counts = {
  labelsOffered: 0, resolvedByAlias: 0, resolvedByName: 0, keptFreeText: 0, emptyNormalised: 0,
};
function resolveLocation(label) {
  counts.labelsOffered++;
  const normalised = normaliseLocationLabel(label);
  if (!normalised) { counts.keptFreeText++; counts.emptyNormalised++; return undefined; }
  const viaAlias = aliasTarget.get(`${tenantId}__${LOCATION_SPACE}__${normalised}`);
  if (viaAlias) { counts.resolvedByAlias++; return locationAvatar(viaAlias, locationsByKey.get(viaAlias)); }
  const viaName = locationByName.get(normalised);
  if (viaName) { counts.resolvedByName++; return locationAvatar(viaName, locationsByKey.get(viaName)); }
  counts.keptFreeText++;
  return undefined;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const deleteLegacy = Object.fromEntries(LEGACY_DIARY_FIELDS.map((k) => [k, FieldValue.delete()]));

const snap = await db.collection(DiaryCollection).where('tenants', 'array-contains', tenantId).get();
const stats = {
  scanned: snap.size, migrate: 0, alreadyMigrated: 0, cleanupOnly: 0, nothingToDo: 0,
  mainKeyed: 0, mainFreeText: 0, mainResolved: 0, withoutLocation: 0,
  locationsTotal: 0, locationsKeyed: 0, locationsFreeText: 0, duplicatesDropped: 0,
  personsAdded: 0, personDuplicatesDropped: 0, albumKeysChanged: 0, indexChanged: 0,
};
const writes = [];
for (const doc of snap.docs) {
  const raw = doc.data();
  const legacyPresent = LEGACY_DIARY_FIELDS.filter((k) => k in raw);
  const backup = Object.fromEntries(legacyPresent.map((k) => [k, raw[k]]));

  if (!needsDiaryLocationMigration(raw)) {
    if (raw.locations === undefined || raw.locations === null) { stats.nothingToDo++; continue; }
    if (legacyPresent.length === 0) { stats.alreadyMigrated++; continue; }
    stats.cleanupOnly++;
    const data = Object.fromEntries(legacyPresent.map((k) => [k, FieldValue.delete()]));
    writes.push({ ref: doc.ref, updateTime: doc.updateTime, data, backup });
    continue;
  }

  stats.migrate++;
  // Same rule as migrateDiaryReferences: an empty `location` object falls through to the label.
  const fromLocationField = !!raw.location && !isEmptyAvatar(raw.location);
  const hasMain = fromLocationField || !!(raw.customLocationLabel ?? '').trim();
  const { locations, people } = migrateDiaryReferences(raw, resolveLocation);
  // The main location, when there is one, is always locations[0].
  if (fromLocationField) stats.mainKeyed++;
  else if (hasMain && locations[0]?.key) stats.mainResolved++;
  else if (hasMain) stats.mainFreeText++;
  if (locations.length === 0) stats.withoutLocation++;

  const offered = (hasMain ? 1 : 0) + (raw.places ?? []).filter((p) => (p ?? '').trim()).length;
  stats.duplicatesDropped += offered - locations.length;
  stats.locationsTotal += locations.length;
  stats.locationsKeyed += locations.filter((a) => a.key).length;
  stats.locationsFreeText += locations.filter((a) => !a.key).length;

  const before = (raw.people ?? []).length;
  const labels = (raw.customPeopleLabels ?? []).filter((l) => (l ?? '').trim()).length;
  stats.personsAdded += people.length - before;
  stats.personDuplicatesDropped += labels - (people.length - before);

  const migrated = { ...raw, locations, people };
  const albumKeys = diaryAlbumKeys(migrated);
  const index = getDiaryIndex(migrated);
  if (!same(raw.albumKeys, albumKeys)) stats.albumKeysChanged++;
  if (raw.index !== index) stats.indexChanged++;

  backup.people = raw.people;
  backup.albumKeys = raw.albumKeys;
  backup.index = raw.index;
  writes.push({ ref: doc.ref, updateTime: doc.updateTime, data: { locations, people, albumKeys, index, ...deleteLegacy }, backup });
}

console.log(`tenant=${tenantId} diaries scanned=${stats.scanned}`);
console.log(`  to migrate=${stats.migrate} · already migrated=${stats.alreadyMigrated} `
  + `· migrated but still carrying legacy fields (cleanup only)=${stats.cleanupOnly} · neither (untouched)=${stats.nothingToDo}`);
console.log(`  lookup: locations=${locationsByKey.size} (ambiguous names=${ambiguousNames}) `
  + `· location aliases=${aliasTarget.size} (skipped, target missing/archived=${aliasesDangling})`);
console.log(`  labels offered=${counts.labelsOffered} · resolved via alias=${counts.resolvedByAlias} `
  + `· via name=${counts.resolvedByName} · kept as free text=${counts.keptFreeText} `
  + `(of these with an empty normalised form, identified by their text=${counts.emptyNormalised})`);
console.log(`  main location: from the location field=${stats.mainKeyed} · free text resolved=${stats.mainResolved} `
  + `· free text kept=${stats.mainFreeText} · entries without any location=${stats.withoutLocation}`);
console.log(`  locations written=${stats.locationsTotal} (keyed=${stats.locationsKeyed}, free text=${stats.locationsFreeText}) `
  + `· duplicates dropped=${stats.duplicatesDropped}`);
console.log(`  persons added (free text)=${stats.personsAdded} · duplicate names dropped=${stats.personDuplicatesDropped}`);
console.log(`  albumKeys changed=${stats.albumKeysChanged} · index changed=${stats.indexChanged} · documents to write=${writes.length}`);

if (!isWrite) {
  console.log('dry run, nothing written. Pass --write --backup=<file outside the repo> to apply.');
  process.exit(0);
}

const backupDoc = {
  tenantId, createdAt: new Date().toISOString(), script: 'scripts/migrate-diary-locations.mjs',
  note: 'Original values of every field this run changed or deleted, per diaries document id.',
  docs: Object.fromEntries(writes.map((w) => [w.ref.id, w.backup])),
};
writeFileSync(backupPath, JSON.stringify(backupDoc, null, 1), { flag: 'wx', mode: 0o600 });
console.log(`backup written (${writes.length} documents) to ${backupPath}`);

let written = 0;
let failedBatches = 0;
for (let i = 0; i < writes.length; i += 400) {
  const batch = db.batch();
  const chunk = writes.slice(i, i + 400);
  for (const { ref, updateTime, data } of chunk) batch.update(ref, data, { lastUpdateTime: updateTime });
  try {
    await batch.commit();
    written += chunk.length;
    console.log(`written ${written}/${writes.length}`);
  } catch (error) {
    failedBatches++;
    console.error(`✖ batch ${i / 400 + 1} not written (${error?.code ?? 'error'}): a document changed since it was read? `
      + 'Re-run the script; already migrated documents are skipped.');
  }
}
console.log(`done: written=${written} · failed batches=${failedBatches}`);
process.exit(failedBatches > 0 ? 1 : 0);
