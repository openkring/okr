#!/usr/bin/env node
/**
 * Seeds the diary alias spaces and their aliases for one tenant (spec 1.34 §V3).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * SAFETY
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *   --dry-run is the DEFAULT. `--write` must be explicit.
 *   `--tenant=<id>` is mandatory and VALIDATED against `app-config/<id>` before anything is
 *   read or counted — a typo would otherwise be written into every alias document id, where
 *   it cannot be corrected in place because the id IS the lookup key.
 *   `--decisions=<path>` is mandatory and MUST lie outside this repository: the file lists
 *   real names from a personal diary. The script refuses a path under the repo root.
 *
 * Aliases are created with `.create()`, never `set()`: the document id is deterministic, so a
 * second run would otherwise silently overwrite a decision someone made by hand.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? '';
const has = (name) => args.includes(`--${name}`);

const tenantId = flag('tenant');
const decisionsPath = flag('decisions');
const archive = flag('archive') || process.env.DIARY_ARCHIVE || '';
const isWrite = has('write');

if (!tenantId) fail('--tenant=<id> is mandatory.');
if (!decisionsPath) fail('--decisions=<path> is mandatory.');
if (!archive) fail('--archive=<path> or $DIARY_ARCHIVE is mandatory.');

const resolvedDecisions = path.resolve(decisionsPath);
if (resolvedDecisions.startsWith(ROOT + path.sep)) {
  fail(`--decisions must lie OUTSIDE the repository (${ROOT}). The file holds real names.`);
}

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

// Collection names are inlined rather than imported: the models import '@okr/shared-constants',
// an alias jiti cannot resolve from a plain node script. Source of truth stays
// libs/shared/models/src/lib/{alias,alias-space,person,location}.model.ts — Step 4 guards drift.
const AliasCollection = 'aliases';
const AliasSpaceCollection = 'aliasSpaces';
const PersonCollection = 'persons';
const LocationCollection = 'locations';
const APP_CONFIG = 'app-config';

const configSnap = await db.collection(APP_CONFIG).doc(tenantId).get();
if (!configSnap.exists) {
  fail(`Tenant '${tenantId}' has no ${APP_CONFIG} document — refusing to write its id into alias ids.`);
}

/** The two lookup spaces the diary import reads. Field values follow spec 1.34 §V3. */
const SPACES = [
  // `label` is plain text on purpose. It is an i18n key OR a literal: I18nService.translate()
  // returns anything not starting with '@' unchanged. Inventing '@system/alias/util.space.person'
  // here would render the raw key until someone adds it to five JSON files, for two rows that
  // only an admin of a single-user tenant ever sees.
  { name: 'person',   label: 'Personen', okey: `${tenantId}-person` },
  { name: 'location', label: 'Orte',     okey: `${tenantId}-location` },
];

async function ensureSpaces() {
  for (const spec of SPACES) {
    const ref = db.collection(AliasSpaceCollection).doc(spec.okey);
    const existing = await ref.get();
    if (existing.exists) {
      console.log(`= space '${spec.name}' exists (${spec.okey})`);
      continue;
    }
    const doc = {
      tenants: [tenantId], isArchived: false, notes: '',
      name: spec.name, label: spec.label,
      kind: 'lookup',              // resolved in-app, never a 302
      length: 6, charset: 'base32-safe',
      allowCustom: true,           // the alias IS the human slug, not a generated code
      caseSensitive: false,        // 'Barbara' and 'barbara' are the same person
      targetTypes: ['model'],
      defaultValidDays: 0, defaultMaxUses: 0,
      trackingLevel: 'off',        // a diary lookup is not a click to be measured
      retentionDays: 0,
      roleNeeded: 'admin',
      isEnabled: true,
    };
    if (!isWrite) { console.log(`+ would create space '${spec.name}' (${spec.okey})`); continue; }
    await ref.create(doc);
    console.log(`+ created space '${spec.name}' (${spec.okey})`);
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
  return folded.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Fail loudly if the library version has moved on. A silently diverged slug would write aliases
// the import can never find — the failure would surface as "no person matched", far from here.
const librarySource = readFileSync(
  path.join(ROOT, 'libs/system/alias/util/src/lib/alias-slug.util.ts'), 'utf8');
for (const fragment of ["replace(/[^a-z0-9]+/g, '-')", "ø: 'oe'", "ü: 'ue'"]) {
  if (!librarySource.includes(fragment)) {
    fail(`toAliasSlug drifted: '${fragment}' is no longer in alias-slug.util.ts. Re-copy the function.`);
  }
}

function markdownFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? markdownFiles(full) : (full.endsWith('.md') ? [full] : []);
  });
}

/**
 * MEASURED 2026-08-23: the archive writes `people` as an INLINE array (`people: [a, b, c]`) in
 * all 2338 files that have the key — never the YAML block list. `tags` uses the block form. Parse
 * both: a block-only parser yields 0 people across the whole archive and reports success.
 */
function frontmatterList(front, key) {
  const inline = new RegExp(`^${key}:\\s*\\[(.*)\\]\\s*$`, 'm').exec(front)?.[1];
  if (inline !== undefined) {
    return inline.split(',').map((v) => v.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  const block = new RegExp(`^${key}:\\s*\\n((?:[ \\t]*-[ \\t].*\\n?)*)`, 'm').exec(front)?.[1] ?? '';
  return block.split('\n')
    .map((line) => /^[ \t]*-[ \t]+(.*)$/.exec(line)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '')
    .filter(Boolean);
}

function frontmatterScalar(front, key) {
  return new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(front)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
}

/** Distinct `people` entries and `location` scalars with their occurrence counts. */
function collectLabels() {
  const people = new Map();
  const locations = new Map();
  const bump = (map, value) => map.set(value, (map.get(value) ?? 0) + 1);
  for (const file of markdownFiles(archive)) {
    const front = /^---\n([\s\S]*?)\n---/.exec(readFileSync(file, 'utf8'))?.[1];
    if (!front) continue;
    const location = frontmatterScalar(front, 'location');
    if (location) bump(locations, location);
    for (const value of frontmatterList(front, 'people')) bump(people, value);
  }
  return { people, locations };
}

async function loadTargets() {
  const persons = await db.collection(PersonCollection)
    .where('tenants', 'array-contains', tenantId).get();
  const locations = await db.collection(LocationCollection)
    .where('tenants', 'array-contains', tenantId).get();
  return {
    persons: persons.docs.map((d) => ({
      okey: d.id,
      slugs: [
        toAliasSlug(`${d.data().firstName ?? ''}`),
        toAliasSlug(`${d.data().lastName ?? ''}`),
        toAliasSlug(`${d.data().firstName ?? ''} ${d.data().lastName ?? ''}`),
      ].filter(Boolean),
      display: `${d.data().firstName ?? ''} ${d.data().lastName ?? ''}`.trim(),
    })),
    locations: locations.docs.map((d) => ({
      okey: d.id,
      slugs: [toAliasSlug(d.data().name ?? '')].filter(Boolean),
      display: d.data().name ?? '',
    })),
  };
}

function writeDecisions(labels, targets) {
  const rows = [];
  const push = (space, map, candidates) => {
    // Group by SLUG, not by label: 6 person slugs have two spellings each (umlaut vs.
    // transcription, or a capitalisation difference), and both must land on ONE row. Two rows
    // sharing a slug would mean two writes to the same document id — the second silently lost
    // to ALREADY_EXISTS, with a human decision behind it.
    const bySlug = new Map();
    for (const [original, uses] of map.entries()) {
      const slug = toAliasSlug(original);
      const entry = bySlug.get(slug) ?? { uses: 0, originals: [] };
      entry.uses += uses;
      entry.originals.push(original);
      bySlug.set(slug, entry);
    }
    for (const [slug, entry] of [...bySlug.entries()].sort((a, b) => b[1].uses - a[1].uses)) {
      const hits = candidates.filter((c) => c.slugs.includes(slug));
      rows.push([
        space, slug,
        hits.length === 1 ? hits[0].okey : '',              // exact match pre-filled
        String(entry.uses),
        hits.length === 0 ? '(no match)' : hits.map((h) => `${h.okey}=${h.display}`).join(' | '),
        entry.originals.join(' | '),                        // every spelling behind this slug
      ].join('\t'));
    }
  };
  push('person', labels.people, targets.persons);
  push('location', labels.locations, targets.locations);
  const header = ['space', 'slug', 'decision', 'uses', 'candidates', 'original'].join('\t');
  writeFileSync(resolvedDecisions, [header, ...rows].join('\n') + '\n', 'utf8');
  return rows.length;
}

await ensureSpaces();
const labels = collectLabels();
const targets = await loadTargets();

if (!isWrite) {
  const written = writeDecisions(labels, targets);
  console.log(`\n${labels.people.size} person labels, ${labels.locations.size} location labels`);
  console.log(`${written} rows written to ${resolvedDecisions}`);
  console.log('Edit the `decision` column (a person/location okey, or blank to keep it free text),');
  console.log('then re-run with --write.');
  process.exit(0);
}
