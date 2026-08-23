#!/usr/bin/env node
/**
 * Seeds `locations` and their `location` aliases from the diary archive's `location` frontmatter
 * scalar for one tenant (spec 1.34, Task 2, V4).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * SAFETY
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *   --write is required to touch Firestore. Every other invocation is read-only.
 *   `--tenant=<id>` is mandatory and VALIDATED against `app-config/<id>` before anything is
 *   read or counted — a typo would otherwise be written into every document id, where it
 *   cannot be corrected in place because the id IS the lookup key.
 *   `--out=<path>` MUST lie outside this repository: the decision file lists real place names
 *   from a personal diary next to real occurrence counts. The script refuses a path under the
 *   repo root. (Place names themselves are public geography and are fine to print to the
 *   terminal — only diary titles and person names must never surface here.)
 *
 * Locations and aliases are created with `.create()`, never `set()`: the document id is
 * deterministic, so a second run would otherwise silently overwrite a record someone has since
 * edited in the app.
 *
 * DECISION-FILE FLOW (mirrors scripts/seed-diary-aliases.mjs, with one deliberate difference):
 *   - file missing              -> harvest + geocode, write the file, exit. No Firestore reads.
 *   - `--refresh` + file exists -> recompute counts/labels, keep every decision, re-geocode only
 *                                  rows still missing coordinates, back up the old file, exit.
 *   - bare invocation + file exists (no --refresh, no --write) -> DRY-RUN REPORT: read the
 *     decisions, check Firestore for each included row, print per-row + totals. Unlike
 *     seed-diary-aliases.mjs, this does NOT fail when the file already exists — Task brief
 *     Step 5 asks for exactly this as the default no-flag verification path.
 *   - `--write` + file exists   -> same as the dry-run report, but creates the documents.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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
const outFlag = flag('out');
const isWrite = has('write');
const isRefresh = has('refresh');

if (!tenantId) fail('--tenant=<id> is mandatory.');
if (!archive) fail('--archive=<path> or $DIARY_ARCHIVE is mandatory.');

const resolvedArchive = path.resolve(archive);
const resolvedOut = path.resolve(outFlag || path.join(path.dirname(resolvedArchive), 'diary-locations-decisions.tsv'));
if (resolvedOut.startsWith(ROOT + path.sep)) {
  fail(`--out must lie OUTSIDE the repository (${ROOT}). The file lists real place names.`);
}

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

// Collection names are inlined rather than imported: the models import '@okr/shared-constants',
// an alias jiti cannot resolve from a plain node script. Source of truth stays
// libs/shared/models/src/lib/{alias,location}.model.ts.
const AliasCollection = 'aliases';
const LocationCollection = 'locations';
const APP_CONFIG = 'app-config';

const configSnap = await db.collection(APP_CONFIG).doc(tenantId).get();
if (!configSnap.exists) {
  fail(`Tenant '${tenantId}' has no ${APP_CONFIG} document — refusing to write its id into document ids.`);
}

/**
 * DEFAULT_LOCATION_TYPE, read off libs/shared/constants/src/lib/constants.ts:70. Inlined rather
 * than imported for the same reason as the collection names above.
 */
const LOCATION_TYPE = 'address';

/**
 * Matches the file name of a diary entry in a day folder. Copied from
 * libs/content/diary/util/src/lib/diary-file.ts — a plain regex constant, not a function, so it
 * is inlined with this drift comment rather than behaviour-fingerprinted.
 */
const DIARY_FILE_NAME = /^\d{8}diary.*\.md$/;

// ═══════════════════════════════════════════════════════════════════════════════════════
// Copied library functions — a plain node script cannot resolve '@okr/*'. Each copy is guarded
// by a behaviour fingerprint over its source file so this script fails loudly instead of
// silently drifting from the library it must agree with.
// ═══════════════════════════════════════════════════════════════════════════════════════

function fingerprintOf(filePath) {
  const behaviour = readFileSync(filePath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\s+/g, '');
  return createHash('sha256').update(behaviour).digest('hex').slice(0, 16);
}

function assertFingerprint(filePath, expected, what) {
  const actual = fingerprintOf(filePath);
  if (actual !== expected) {
    fail(`${what} drifted: ${filePath} no longer matches the copy in this script `
      + `(fingerprint ${actual}, expected ${expected}). Re-copy the function, then update the `
      + 'fingerprint constant.');
  }
}

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
    const last = segments[segments.length - 1].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (COUNTRIES.has(last)) segments.pop();
  }
  const slug = segments.join('-')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const parts = slug.split('-');
  while (parts.length > 1 && CANTONS.has(parts[parts.length - 1])) parts.pop();
  return parts.join('-');
}
const LIB_LOCATION_NORMALISE = path.join(ROOT, 'libs/content/diary/util/src/lib/location-normalise.ts');
const LIB_LOCATION_NORMALISE_FINGERPRINT = '0818759018552aa4';
assertFingerprint(LIB_LOCATION_NORMALISE, LIB_LOCATION_NORMALISE_FINGERPRINT, 'normaliseLocationLabel');

/** Copied from libs/content/diary/util/src/lib/diary-parse.ts. Keep the two identical. */
const FENCE = '---\n';
const KEY_LINE = /^([A-Za-z_][\w-]*):(.*)$/;
const HEADING = /^#{1,6} .*$/gm;
function splitFrontmatter(text) {
  if (!text.startsWith(FENCE)) return { block: '', body: text };
  const end = text.indexOf(`\n${FENCE}`, FENCE.length - 1);
  if (end < 0) return { block: '', body: text };
  return { block: text.slice(FENCE.length, end), body: text.slice(end + 1 + FENCE.length) };
}
function parseFrontmatter(block) {
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
function parseSections(body) {
  const marks = [];
  HEADING.lastIndex = 0;
  let match;
  while ((match = HEADING.exec(body)) !== null) marks.push({ index: match.index, text: match[0] });
  const sections = [];
  const firstAt = marks.length > 0 ? marks[0].index : body.length;
  if (firstAt > 0 || marks.length === 0) sections.push({ heading: '', content: body.slice(0, firstAt) });
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index + marks[i].text.length;
    const end = i + 1 < marks.length ? marks[i + 1].index : body.length;
    sections.push({ heading: marks[i].text, content: body.slice(start, end) });
  }
  return sections;
}
function parseDiaryMarkdown(text) {
  const { block, body } = splitFrontmatter(text);
  return { frontmatter: parseFrontmatter(block), sections: parseSections(body) };
}
const LIB_DIARY_PARSE = path.join(ROOT, 'libs/content/diary/util/src/lib/diary-parse.ts');
const LIB_DIARY_PARSE_FINGERPRINT = 'e9b95a5f016bd530';
assertFingerprint(LIB_DIARY_PARSE, LIB_DIARY_PARSE_FINGERPRINT, 'parseDiaryMarkdown');

/** Copied from libs/content/diary/util/src/lib/diary-frontmatter.ts. Keep the two identical. */
function rawValue(file, key) {
  return file.frontmatter.find((entry) => entry.key === key)?.raw;
}
function fmScalar(file, key) {
  const raw = rawValue(file, key);
  if (raw === undefined) return '';
  const trimmed = raw.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 1
    ? trimmed.slice(1, -1)
    : trimmed;
}
const LIB_DIARY_FRONTMATTER = path.join(ROOT, 'libs/content/diary/util/src/lib/diary-frontmatter.ts');
const LIB_DIARY_FRONTMATTER_FINGERPRINT = 'ca3233fcbb2acadc';
assertFingerprint(LIB_DIARY_FRONTMATTER, LIB_DIARY_FRONTMATTER_FINGERPRINT, 'fmScalar');

// ═══════════════════════════════════════════════════════════════════════════════════════
// Step 2: collect and rank the places
// ═══════════════════════════════════════════════════════════════════════════════════════

function diaryFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return diaryFiles(full);
    return DIARY_FILE_NAME.test(entry) ? [full] : [];
  });
}

/**
 * Distinct normalised location keys with their occurrence count and every raw spelling seen
 * for that key (needed for the alias `original` column and for picking the most frequent raw
 * spelling as the record's display label).
 */
function collectLocations() {
  const byKey = new Map(); // key -> { count, rawCounts: Map<raw, count> }
  for (const file of diaryFiles(resolvedArchive)) {
    const parsed = parseDiaryMarkdown(readFileSync(file, 'utf8'));
    const raw = fmScalar(parsed, 'location');
    if (!raw) continue;
    const key = normaliseLocationLabel(raw);
    if (!key) continue;
    const entry = byKey.get(key) ?? { count: 0, rawCounts: new Map() };
    entry.count++;
    entry.rawCounts.set(raw, (entry.rawCounts.get(raw) ?? 0) + 1);
    byKey.set(key, entry);
  }
  return byKey;
}

function mostFrequentRaw(rawCounts) {
  let best = '';
  let bestCount = -1;
  for (const [raw, count] of rawCounts) {
    if (count > bestCount) { best = raw; bestCount = count; }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Step 3: geocode with Open-Meteo — same provider as the weather step, free, no API key.
// A suggestion, not the truth: the decision file is the review surface, and --refresh never
// overwrites a row whose source is 'manual', nor a row that already carries coordinates.
//
// The raw diary label is frequently NOT a query Open-Meteo's free-text search can parse
// ('Stäfa ZH' with a trailing canton code, 'Dieni/Sedrun GR' a compound of two places): a query
// ladder tries the raw label, then a human (non-slug) form with the trailing canton code and/or
// country segment stripped, then each '/'- or ','-separated segment of that stripped form,
// LONGEST first — first hit wins. A short single-word fallback segment can still land a
// confidently wrong result in another country ('Dieni' -> a village in Mali, not the Sedrun
// valley) with a name that superficially matches, so every hit is made auditable rather than
// trusted: `matched_name`/`country_code` are recorded next to the coordinates, and any hit whose
// name differs materially from the query, or whose country contradicts a canton code or country
// name the diary label itself named, is tagged `open-meteo-review` instead of `open-meteo` so
// the operator's eye goes straight there. This is NOT a Swiss-only filter — the archive holds
// real foreign trips (Malta, Tanzania, Zambia, Brittany, Tuscany, Sarajevo) and those are meant
// to geocode to their real country; the check only fires when the LABEL ITSELF names a canton or
// country that the result then contradicts.
// ═══════════════════════════════════════════════════════════════════════════════════════

/** Maps the country names already in COUNTRIES (see normaliseLocationLabel above) to their
 * ISO country_code, for the cross-check below. Script-local — not a copy of library code. */
const COUNTRY_CODE = {
  switzerland: 'CH', schweiz: 'CH', suisse: 'CH',
  italy: 'IT', italia: 'IT', italien: 'IT',
  france: 'FR', frankreich: 'FR',
  germany: 'DE', deutschland: 'DE',
  austria: 'AT', oesterreich: 'AT',
  spain: 'ES', spanien: 'ES', espana: 'ES',
};

function fold(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/**
 * The country the RAW label itself implies, if any — a trailing Swiss canton code ('Stäfa ZH')
 * or a trailing comma country segment ('Barcelona, Spain'). Undefined when the label names
 * neither, which is the common case and carries no audit signal either way.
 */
function expectedCountryFromLabel(label) {
  const cantonMatch = /^(.*\S)\s+([A-Za-z]{2})$/.exec(label);
  if (cantonMatch && CANTONS.has(cantonMatch[2].toLowerCase())) return 'CH';
  const segments = label.split(',').map((s) => s.trim()).filter(Boolean);
  if (segments.length > 1) {
    const code = COUNTRY_CODE[fold(segments[segments.length - 1])];
    if (code) return code;
  }
  return undefined;
}

/**
 * Query forms to try, first hit wins: the raw label; the label with a trailing canton code
 * and/or trailing country segment stripped (a HUMAN form, not the slug normaliseLocationLabel
 * produces — 'staefa' is not a query Open-Meteo should be asked); then each '/'- or ','-separated
 * segment of that stripped form, longest first (a longer segment is less likely to collide with
 * an unrelated same-named place elsewhere in the world).
 */
function queryForms(label) {
  const forms = [label];

  const cantonMatch = /^(.*\S)\s+([A-Za-z]{2})$/.exec(label);
  let stripped = cantonMatch && CANTONS.has(cantonMatch[2].toLowerCase()) ? cantonMatch[1] : label;

  const segments = stripped.split(',').map((s) => s.trim()).filter(Boolean);
  if (segments.length > 1 && COUNTRIES.has(fold(segments[segments.length - 1]))) segments.pop();
  stripped = segments.join(', ');
  if (!forms.includes(stripped)) forms.push(stripped);

  const parts = [...new Set(stripped.split(/[/,]/).map((s) => s.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  for (const part of parts) {
    if (!forms.includes(part)) forms.push(part);
  }
  return forms;
}

async function geocodeRaw(query) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', query);
  url.searchParams.set('count', '1'); // only the top hit is ever read — see geocodeLadder below
  url.searchParams.set('language', 'de');
  url.searchParams.set('format', 'json');
  const res = await fetch(url);
  if (!res.ok) return [];
  return (await res.json())?.results ?? [];
}

/** Tries the query ladder for `label`, first hit wins. Returns null when every form draws a blank. */
async function geocodeLadder(label) {
  const expectedCountry = expectedCountryFromLabel(label);
  for (const query of queryForms(label)) {
    const results = await geocodeRaw(query);
    await sleep(300); // a few requests per second
    if (results.length === 0) continue;
    const top = results[0];
    const countryCode = (top.country_code ?? '').toUpperCase();
    const nameFolded = fold(top.name ?? '');
    const queryFolded = fold(query);
    const nameDiffers = nameFolded !== queryFolded
      && !nameFolded.includes(queryFolded) && !queryFolded.includes(nameFolded);
    const countryMismatch = expectedCountry !== undefined && countryCode !== expectedCountry;
    return {
      latitude: top.latitude, longitude: top.longitude,
      matchedName: top.name ?? '', countryCode,
      review: nameDiffers || countryMismatch,
    };
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Skips rows that already have coordinates and every 'manual' row — never touches either. */
async function geocodeMissing(rows) {
  let geocoded = 0;
  let review = 0;
  for (const row of rows) {
    if (row.source === 'manual') continue;      // never touch a hand-verified row
    if (row.latitude !== '' && row.longitude !== '') continue; // already has coordinates
    const hit = await geocodeLadder(row.label);
    if (hit) {
      row.latitude = String(hit.latitude);
      row.longitude = String(hit.longitude);
      row.matchedName = hit.matchedName;
      row.countryCode = hit.countryCode;
      row.source = hit.review ? 'open-meteo-review' : 'open-meteo';
      geocoded++;
      if (hit.review) review++;
    }
  }
  return { geocoded, review };
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Step 4: build the two documents
// ═══════════════════════════════════════════════════════════════════════════════════════

/** Deterministic ids, same reasoning as the aliases and the trips: the id IS the lookup key. */
function locationDocId(tenant, key) { return `${tenant}__${key}`; }
function locationAliasDocId(tenant, key) { return `${tenant}__location__${key}`; }

/**
 * Validates a decision-file coordinate pair rather than trusting `Number(...)`: a hand-edited
 * European-style decimal comma ('47,3769') would otherwise become NaN and reach Firestore, and an
 * empty pair would otherwise be coerced to (0, 0) — a real point in the Atlantic off West Africa,
 * not "no coordinates". Both must be caught before a write, not silently written.
 */
function parseCoordinatePair(latitude, longitude) {
  if (latitude === '' || longitude === '') return { valid: false, reason: 'missing coordinates' };
  const lat = Number(latitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { valid: false, reason: `invalid latitude '${latitude}'` };
  }
  const lon = Number(longitude);
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return { valid: false, reason: `invalid longitude '${longitude}'` };
  }
  return { valid: true, lat, lon };
}

/** `latitude`/`longitude` must already be validated numbers — see parseCoordinatePair. */
function buildLocation(tenant, row) {
  return {
    tenants: [tenant], isArchived: false,
    index: '', name: row.label, address: '', tags: '',
    type: LOCATION_TYPE,
    latitude: row.latitude,
    longitude: row.longitude,
    placeId: '', what3words: '', seaLevel: 0, speed: 0, direction: 0, distance: 0,
    notes: '',
  };
}

/** Mirrors buildAliasDoc in scripts/seed-diary-aliases.mjs, so both spaces stay one shape. */
function buildLocationAlias(tenant, row, okey) {
  return {
    tenants: [tenant], isArchived: false, tags: '', notes: 'diary import (spec 1.34 V4)',
    space: 'location', alias: row.key,
    targetType: 'model', targetUrl: '', targetKey: `location.${okey}`,
    original: row.originals,
    isEnabled: true, validFrom: '', validUntil: '', maxUses: 0, useCount: 0, lastUsedAt: '',
    trackingLevel: 'inherit', retentionDays: 0,
    createdBy: '',
    // StoreDateTime is 'YYYY-MM-DD HH:mm' LOCAL wall clock. Built from the local parts rather
    // than toISOString(), which is UTC and would be an hour or two off in a stored date.
    createdAt: (() => {
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    })(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Decision file (TSV): one row per normalised key. `key`, `label`, `count` and `originals` are
// always regenerated from source. `include`, `latitude`, `longitude`, `source`, `matched_name`
// and `country_code` are the geocode decision and are carried over on --refresh — the last two
// are the audit trail (what Open-Meteo actually matched, and in which country) that lets the
// operator judge an `open-meteo-review` row without re-running the query by hand. Fields are
// separated by exactly one tab — deliberately no column alignment, since alignment is what
// invites an editor to "fix" whitespace and corrupt a cell.
// ═══════════════════════════════════════════════════════════════════════════════════════

const HEADER = ['key', 'label', 'count', 'include', 'latitude', 'longitude', 'source', 'matched_name', 'country_code'].join('\t');

function buildFreshRows(byKey) {
  return [...byKey.entries()]
    .map(([key, entry]) => ({
      key,
      label: mostFrequentRaw(entry.rawCounts),
      count: entry.count,
      originals: [...entry.rawCounts.keys()].join(' | '),
    }))
    .sort((a, b) => b.count - a.count);
}

function toLine(row) {
  return [row.key, row.label, String(row.count), row.include, row.latitude, row.longitude,
    row.source, row.matchedName, row.countryCode].join('\t');
}

/** Parses the decision file. Strict tab-split: `label` can contain spaces, so no whitespace
 * collapsing (unlike seed-diary-aliases.mjs, whose columns never contain spaces). */
function parseDecisionFile(content) {
  const decisions = new Map(); // key -> { include, latitude, longitude, source, matchedName, countryCode }
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    if (cols[0] === 'key') continue; // header row
    const [key, , , include, latitude, longitude, source, matchedName, countryCode] = cols;
    if (!key) continue;
    decisions.set(key, {
      include: include === 'false' ? 'false' : 'true',
      latitude: latitude ?? '',
      longitude: longitude ?? '',
      source: source ?? '',
      matchedName: matchedName ?? '',
      countryCode: countryCode ?? '',
    });
  }
  return decisions;
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const FRESH_DECISION = { include: 'true', latitude: '', longitude: '', source: '', matchedName: '', countryCode: '' };

async function writeFreshDecisionFile(byKey) {
  const rows = buildFreshRows(byKey).map((r) => ({ ...r, ...FRESH_DECISION }));
  const { geocoded, review } = await geocodeMissing(rows);
  writeFileSync(resolvedOut, [HEADER, ...rows.map(toLine)].join('\n') + '\n', 'utf8');
  console.log(`\n${byKey.size} distinct location keys, ${geocoded} geocoded (${review} flagged open-meteo-review)`);
  console.log(`${rows.length} rows written to ${resolvedOut}`);
  console.log('Edit `include`/`latitude`/`longitude` as needed (set `source` to `manual` on any');
  console.log('row you hand-correct, so --refresh never overwrites it), then re-run with --write.');
}

async function refreshDecisionFile(byKey) {
  const oldContent = readFileSync(resolvedOut, 'utf8');
  const oldDecisions = parseDecisionFile(oldContent);
  const backupPath = `${resolvedOut}.bak-${timestamp()}`;
  writeFileSync(backupPath, oldContent, 'utf8');

  const fresh = buildFreshRows(byKey);
  let carried = 0;
  const rows = fresh.map((r) => {
    const old = oldDecisions.get(r.key);
    if (old) {
      carried++;
      return { ...r, ...old };
    }
    return { ...r, ...FRESH_DECISION };
  });
  const { geocoded, review } = await geocodeMissing(rows);
  writeFileSync(resolvedOut, [HEADER, ...rows.map(toLine)].join('\n') + '\n', 'utf8');

  console.log(`\nbackup written to ${backupPath}`);
  console.log(`${carried} decisions carried over, ${geocoded} newly geocoded (${review} flagged open-meteo-review)`);
  console.log(`${rows.length} total rows written to ${resolvedOut}`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Step 5: dry run / write against Firestore, reading the decision file as-is.
// ═══════════════════════════════════════════════════════════════════════════════════════

// gRPC status code for ALREADY_EXISTS (google.rpc.Code.ALREADY_EXISTS = 6). Firestore Admin SDK
// errors carry it in `.code`; matching on it instead of the error message means a real failure
// (e.g. PERMISSION_DENIED, DEADLINE_EXCEEDED) can never be miscounted as "already existed".
const GRPC_ALREADY_EXISTS = 6;

async function seed(byKey) {
  const content = readFileSync(resolvedOut, 'utf8');
  const decisions = parseDecisionFile(content);
  const fresh = new Map(buildFreshRows(byKey).map((r) => [r.key, r]));

  // Validate the WHOLE set before writing anything. An included row with missing or unusable
  // coordinates must never reach Firestore: a silent (0, 0) fallback is a real point in the
  // Atlantic off West Africa, and a silently skipped row is a place whose diary entries lose
  // their weather with no explanation. The operator is already reviewing this file right before
  // --write, so an explicit abort here — naming every offending row — is the right place to stop.
  if (isWrite) {
    const invalid = [];
    for (const [key, decision] of decisions) {
      if (!fresh.has(key) || decision.include !== 'true') continue;
      const parsed = parseCoordinatePair(decision.latitude, decision.longitude);
      if (!parsed.valid) invalid.push(`  ${key}: ${parsed.reason}`);
    }
    if (invalid.length > 0) {
      fail(`${invalid.length} included row(s) in ${resolvedOut} have no usable coordinates. Fill in `
        + `latitude/longitude, or set include=false, before --write:\n${invalid.join('\n')}`);
    }
  }

  let included = 0, excluded = 0, missingCoords = 0;
  let locationsExisting = 0, aliasesExisting = 0;
  let locationsCreated = 0, aliasesCreated = 0;
  let locationsAlreadyExisted = 0, aliasesAlreadyExisted = 0;

  for (const [key, decision] of decisions) {
    const info = fresh.get(key);
    if (!info) continue; // a decided key no longer present in the archive; nothing to do

    if (decision.include !== 'true') {
      excluded++;
      if (!isWrite) console.log(`- ${key} count=${info.count} include=false`);
      continue;
    }
    included++;
    const hasCoords = decision.latitude !== '' && decision.longitude !== '';
    if (!hasCoords) missingCoords++;

    const okey = locationDocId(tenantId, key);
    const locationRef = db.collection(LocationCollection).doc(okey);
    const aliasRef = db.collection(AliasCollection).doc(locationAliasDocId(tenantId, key));

    if (!isWrite) {
      const [locSnap, aliasSnap] = await Promise.all([locationRef.get(), aliasRef.get()]);
      if (locSnap.exists) locationsExisting++;
      if (aliasSnap.exists) aliasesExisting++;
      console.log(`${locSnap.exists ? '=' : '+'} ${key} count=${info.count} include=true `
        + `coords=${hasCoords ? 'yes' : 'no'}${locSnap.exists ? ' (location exists)' : ''}`
        + `${aliasSnap.exists ? ' (alias exists)' : ''}`);
      continue;
    }

    // Reached only when isWrite: the validation pass above already guarantees this parses.
    const parsed = parseCoordinatePair(decision.latitude, decision.longitude);
    const locationDoc = buildLocation(tenantId, { label: info.label, latitude: parsed.lat, longitude: parsed.lon });
    const aliasDoc = buildLocationAlias(tenantId, { key, originals: info.originals }, okey);

    try {
      await locationRef.create(locationDoc);
      locationsCreated++;
    } catch (error) {
      if (error?.code === GRPC_ALREADY_EXISTS) locationsAlreadyExisted++;
      else throw error;
    }
    try {
      await aliasRef.create(aliasDoc);
      aliasesCreated++;
    } catch (error) {
      if (error?.code === GRPC_ALREADY_EXISTS) aliasesAlreadyExisted++;
      else throw error;
    }
    console.log(`+ ${key}`);
  }

  if (!isWrite) {
    console.log(`\n${included} included · ${excluded} excluded · ${missingCoords} missing coordinates`);
    console.log(`${locationsExisting} location(s) existing · ${aliasesExisting} alias(es) existing`);
  } else {
    console.log(`\n${locationsCreated} location(s) created · ${locationsAlreadyExisted} already existed`);
    console.log(`${aliasesCreated} alias(es) created · ${aliasesAlreadyExisted} already existed`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Entry point
// ═══════════════════════════════════════════════════════════════════════════════════════

const byKey = collectLocations();

if (!existsSync(resolvedOut)) {
  // Fresh generation, regardless of --refresh: there is nothing to carry over yet. This is the
  // same degeneration seed-diary-aliases.mjs relies on (`refresh && existsSync` is false).
  await writeFreshDecisionFile(byKey);
  process.exit(0);
}

if (isRefresh) {
  await refreshDecisionFile(byKey);
  process.exit(0);
}

// Bare invocation or --write, with an existing decision file: read it and act against Firestore.
// Deliberately does NOT fail when --refresh was not passed (unlike seed-diary-aliases.mjs) — a
// bare re-run must double as the dry-run verification step (task brief Step 5).
await seed(byKey);
process.exit(0);
