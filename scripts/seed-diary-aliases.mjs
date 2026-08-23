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
const decisionsPath = flag('decisions');
const archive = flag('archive') || process.env.DIARY_ARCHIVE || '';
const isWrite = has('write');
const isDryWrite = has('dry-write');

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
const AliasSpaceCollection = 'aliasSpaces';
const AliasCollection = 'aliases';
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

/**
 * The copied toAliasSlug must stay behaviourally identical to the library's. Comments and
 * formatting are stripped before hashing, so documentation edits do not trip the guard while
 * any change to the FOLD map or the transform chain does.
 */
const LIB_SLUG = path.join(ROOT, 'libs/system/alias/util/src/lib/alias-slug.util.ts');
const LIB_SLUG_FINGERPRINT = 'dd9ffb84093ccc9b';
const libBehaviour = readFileSync(LIB_SLUG, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')
  .replace(/\s+/g, '');
const actual = createHash('sha256').update(libBehaviour).digest('hex').slice(0, 16);
if (actual !== LIB_SLUG_FINGERPRINT) {
  fail(`toAliasSlug drifted: ${LIB_SLUG} no longer matches the copy in this script `
     + `(fingerprint ${actual}, expected ${LIB_SLUG_FINGERPRINT}). Re-copy the function and the `
     + `FOLD map, then update LIB_SLUG_FINGERPRINT.`);
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

/**
 * `fullSlug` is the FIRST+LAST name slug, kept apart from the other two partial slugs
 * (`slugs` still holds all three, for the candidates column). It is the only slug the
 * pre-fill decision may ever match against -- see buildRows.
 */
async function loadTargets() {
  const persons = await db.collection(PersonCollection)
    .where('tenants', 'array-contains', tenantId).get();
  const locations = await db.collection(LocationCollection)
    .where('tenants', 'array-contains', tenantId).get();
  return {
    persons: persons.docs.map((d) => {
      const fullSlug = toAliasSlug(`${d.data().firstName ?? ''} ${d.data().lastName ?? ''}`);
      return {
        okey: d.id,
        slugs: [
          toAliasSlug(`${d.data().firstName ?? ''}`),
          toAliasSlug(`${d.data().lastName ?? ''}`),
          fullSlug,
        ].filter(Boolean),
        fullSlug,
        display: `${d.data().firstName ?? ''} ${d.data().lastName ?? ''}`.trim(),
      };
    }),
    locations: locations.docs.map((d) => {
      // A location has only one name -- its single slug doubles as its full-name slug.
      const fullSlug = toAliasSlug(d.data().name ?? '');
      return {
        okey: d.id,
        slugs: [fullSlug].filter(Boolean),
        fullSlug,
        display: d.data().name ?? '',
      };
    }),
  };
}

/**
 * Tolerant parser for a decisions file that may have been hand-edited in an editor that turns
 * some TABS into SPACES on the touched rows, shifting later columns left and losing the column
 * boundary. Used by --refresh below and by the future --write path — both need the operator's
 * decisions back, and both must never guess one.
 *
 * Rules (validated by the controller against a real damaged file: 105 decisions recovered
 * directly, 3 more where the slug cell had absorbed the decision, 0 unrecoverable):
 *   - split each data line on runs of TAB or SPACE
 *   - token[0] = space ('person' | 'location'), token[1] = slug
 *   - token[2]: if it is ALL DIGITS, the decision cell is EMPTY — that digit string is `uses`,
 *     shifted left because the decision cell was blank; otherwise token[2] IS the decision
 *   - every further token (`uses`, `candidates`, `original`) is ignored: those columns are
 *     regenerated from source on every run, never read back
 *   - a decision token that is not a known person/location okey for THIS tenant is never
 *     guessed. It is collected and returned so the caller can fail loudly before writing
 *     anything, rather than silently dropping or misfiling a human decision.
 *
 * @param {string} content raw file content
 * @param {{ person: Set<string>, location: Set<string> }} validOkeys known okeys per space
 * @returns {{ decisions: Map<string, string>, unknown: Array<{ line: number, space: string }> }}
 *   `decisions` keys are `${space}\t${slug}`; values are okeys, or '' for an explicit blank.
 *   `unknown` never contains slugs or decisions — line numbers only, so this stays safe to log.
 */
function parseDecisionsTolerant(content, validOkeys) {
  const decisions = new Map();
  const unknown = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    const tokens = trimmed.split(/[\t ]+/);
    const space = tokens[0];
    if (space !== 'person' && space !== 'location') continue; // header row or stray line
    const slug = tokens[1];
    if (!slug) continue;
    const third = tokens[2];
    const decision = third !== undefined && !/^\d+$/.test(third) ? third : '';
    if (decision && !validOkeys[space]?.has(decision)) {
      unknown.push({ line: i + 1, space });
      continue;
    }
    decisions.set(`${space}\t${slug}`, decision);
  }
  return { decisions, unknown };
}

/**
 * Builds the decisions rows fresh from source (labels + Firestore targets), optionally keeping
 * decisions already made for a slug. `oldDecisions` is an empty Map for a brand-new file, so the
 * "prefill only what's blank" rule degenerates to the original exact-match-prefill behaviour.
 *
 * Padding/alignment is deliberately never applied to any column: alignment is what invites an
 * editor to "fix" whitespace, which is exactly the corruption this task exists to recover from.
 * Fields stay separated by exactly one tab.
 */
function buildRows(labels, targets, oldDecisions) {
  const rows = [];
  let carried = 0;
  let prefilled = 0;    // blank, unique FULL-NAME match -- the only case ever pre-filled
  let partialOnly = 0;  // blank, no full-name match, but exactly one partial match -- guidance
  let ambiguous = 0;
  let unmatched = 0;
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
      // `hits` (first/last/full partial match) still drives the candidates column -- the
      // operator wants to see every plausible person, including first-name-only hints.
      const hits = candidates.filter((c) => c.slugs.includes(slug));
      // `fullHits` (first+last together) is the ONLY thing the pre-fill decision may act on.
      // A first- or last-name-only match is usually wrong here: many diary people are
      // deliberately absent from the database, and a blank decision usually means "decided:
      // not this person", not "undecided". 2026-08-23: 27 rows were wrongly pre-filled on a
      // partial match (two of them on a surname-only match) and had to be reverted by hand.
      const fullHits = candidates.filter((c) => c.fullSlug === slug);
      const old = oldDecisions.get(`${space}\t${slug}`);
      let decision;
      if (old) {
        decision = old; // never overwrite an existing decision
        carried++;
      } else if (fullHits.length === 1) {
        decision = fullHits[0].okey; // still blank, exactly one FULL-NAME match: pre-fill
        prefilled++;
      } else {
        decision = ''; // never blank one, and never guess on a partial match
        if (hits.length === 1) partialOnly++;
        else if (hits.length > 1) ambiguous++;
        else unmatched++;
      }
      rows.push([
        space, slug, decision, String(entry.uses),
        hits.length === 0 ? '(no match)' : hits.map((h) => `${h.okey}=${h.display}`).join(' | '),
        entry.originals.join(' | '),                        // every spelling behind this slug
      ].join('\t'));
    }
  };
  push('person', labels.people, targets.persons);
  push('location', labels.locations, targets.locations);
  return { rows, carried, prefilled, partialOnly, ambiguous, unmatched };
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const HEADER = ['space', 'slug', 'decision', 'uses', 'candidates', 'original'].join('\t');

/** Fresh generation: the file must not already exist (checked by the caller). */
function writeDecisionsFresh(labels, targets) {
  const { rows } = buildRows(labels, targets, new Map());
  writeFileSync(resolvedDecisions, [HEADER, ...rows].join('\n') + '\n', 'utf8');
  return rows.length;
}

/**
 * --refresh: parse the existing file tolerantly, keep every decision it holds, recompute
 * `uses`/`candidates` from current source + Firestore, pre-fill only rows that are still blank
 * and now unambiguous, back up the old file, then write the new one.
 */
function refreshDecisions(labels, targets) {
  const validOkeys = {
    person: new Set(targets.persons.map((p) => p.okey)),
    location: new Set(targets.locations.map((l) => l.okey)),
  };
  const oldContent = readFileSync(resolvedDecisions, 'utf8');
  const { decisions: oldDecisions, unknown } = parseDecisionsTolerant(oldContent, validOkeys);
  if (unknown.length > 0) {
    console.error(`✖ ${unknown.length} decision(s) in ${resolvedDecisions} do not match a known `
      + `person/location okey for tenant '${tenantId}'. Refusing to write anything.`);
    for (const u of unknown) console.error(`  line ${u.line} (${u.space})`);
    process.exit(1);
  }

  const backupPath = `${resolvedDecisions}.bak-${timestamp()}`;
  writeFileSync(backupPath, oldContent, 'utf8');

  const { rows, carried, prefilled, partialOnly, ambiguous, unmatched } =
    buildRows(labels, targets, oldDecisions);
  writeFileSync(resolvedDecisions, [HEADER, ...rows].join('\n') + '\n', 'utf8');

  console.log(`\nbackup written to ${backupPath}`);
  console.log(`${carried} decisions carried over, ${prefilled} pre-filled (full-name match), `
    + `${partialOnly} single partial candidate (left blank for you), `
    + `${ambiguous} still ambiguous, ${unmatched} still unmatched`);
  console.log(`${rows.length} total rows written to ${resolvedDecisions}`);
}

/**
 * Turns the tab-string rows from `buildRows` back into the objects the write path needs
 * (`space`, `slug`, `uses`, `original`). Reuses `buildRows` rather than duplicating the
 * bySlug/candidates computation — the decision column it produces is discarded here because
 * the write path's decisions come from the operator's file, not from a fresh pre-fill.
 */
function freshRowsAsObjects(labels, targets) {
  const { rows } = buildRows(labels, targets, new Map());
  return rows.map((line) => {
    const [space, slug, , uses, , original] = line.split('\t');
    return { space, slug, uses, original };
  });
}

/**
 * The decision is the only operator-authored value in the file. Everything else is derived, so
 * it is recomputed from the archive rather than read back — a mangled `original` column would
 * otherwise be written onto the alias document as its human-readable form.
 */
function decidedRows(decisions, freshRows) {
  const bySlug = new Map(freshRows.map((r) => [`${r.space}__${r.slug}`, r]));
  const out = [];
  for (const d of decisions) {
    if (d.decision === '') continue;
    const fresh = bySlug.get(`${d.space}__${d.slug}`);
    if (!fresh) fail(`Row '${d.space}/${d.slug}' is not in the archive any more. Re-run --refresh.`);
    out.push({ ...d, uses: fresh.uses, original: fresh.original });
  }
  return out;
}

function assertDecisionsValid(rows, targets) {
  const known = {
    person: new Set(targets.persons.map((p) => p.okey)),
    location: new Set(targets.locations.map((l) => l.okey)),
  };
  const unknown = rows.filter((r) => !known[r.space]?.has(r.decision));
  if (unknown.length > 0) {
    // Listing ALL of them: fixing one typo per run, with a full archive read between attempts,
    // is how a fifteen-minute job becomes an afternoon.
    fail(`${unknown.length} decision(s) name an okey that does not exist in tenant ${tenantId}:\n`
       + unknown.map((r) => `  ${r.space}/${r.slug} -> '${r.decision}'`).join('\n'));
  }
  const empty = rows.filter((r) => r.slug === '');
  if (empty.length > 0) fail(`${empty.length} decided row(s) have an empty slug — cannot build a document id.`);

  const seen = new Set();
  for (const r of rows) {
    const id = `${tenantId}__${r.space}__${r.slug}`;
    if (seen.has(id)) fail(`Two decided rows map to the same alias id '${id}'. Merge them first.`);
    seen.add(id);
  }
}

/** Builds the same document object --write would send to Firestore, without sending it. */
function buildAliasDoc(row) {
  return {
    tenants: [tenantId], isArchived: false, tags: '', notes: 'diary import (spec 1.34 V3)',
    space: row.space, alias: row.slug,
    targetType: 'model', targetUrl: '', targetKey: `${row.space}.${row.decision}`,
    original: row.original,          // every spelling behind this slug, ' | ' joined
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

async function writeAliases(rows) {
  let created = 0, existed = 0;
  for (const row of rows) {
    const docId = `${tenantId}__${row.space}__${row.slug}`;   // buildAliasDocId, caseSensitive=false
    const doc = buildAliasDoc(row);
    try {
      await db.collection(AliasCollection).doc(docId).create(doc);
      created++;
    } catch (error) {
      // .create() throws ALREADY_EXISTS. That is the point: a re-run must not overwrite an alias
      // someone has since changed in the app.
      if (String(error).includes('ALREADY_EXISTS')) { existed++; continue; }
      throw error;
    }
  }
  console.log(`\n${created} created · ${existed} already existed`);
}

await ensureSpaces();
const labels = collectLabels();
const targets = await loadTargets();

if (isWrite || isDryWrite) {
  if (!existsSync(resolvedDecisions)) {
    fail(`${resolvedDecisions} does not exist — run without --write/--dry-write first to generate it.`);
  }
  const validOkeys = {
    person: new Set(targets.persons.map((p) => p.okey)),
    location: new Set(targets.locations.map((l) => l.okey)),
  };
  const content = readFileSync(resolvedDecisions, 'utf8');
  const { decisions: parsedMap, unknown } = parseDecisionsTolerant(content, validOkeys);
  if (unknown.length > 0) {
    console.error(`✖ ${unknown.length} decision(s) in ${resolvedDecisions} do not match a known `
      + `person/location okey for tenant '${tenantId}'. Refusing to write anything.`);
    for (const u of unknown) console.error(`  line ${u.line} (${u.space})`);
    process.exit(1);
  }
  const decisionRows = [...parsedMap.entries()].map(([key, decision]) => {
    const [space, slug] = key.split('\t');
    return { space, slug, decision };
  });
  const freshRows = freshRowsAsObjects(labels, targets);
  const rows = decidedRows(decisionRows, freshRows);
  // Validate the WHOLE set before writing anything — never validate-as-you-go.
  assertDecisionsValid(rows, targets);

  if (isDryWrite) {
    const ids = rows.map((r) => `${tenantId}__${r.space}__${r.slug}`);
    // Building each document object proves the write path works, but nothing here touches
    // Firestore: buildAliasDoc is pure, and no db.collection(...).create() call is made.
    for (const r of rows) buildAliasDoc(r);
    console.log(`\n--dry-write: would create ${ids.length} alias document(s) (0 already existed check `
      + 'skipped — that requires a Firestore read per id, done only by real --write)');
    console.log('first 3 ids:');
    for (const id of ids.slice(0, 3)) console.log(`  ${id}`);
    process.exit(0);
  }

  await writeAliases(rows);
  process.exit(0);
}

const refresh = has('refresh');
if (existsSync(resolvedDecisions) && !refresh) {
  fail(`${resolvedDecisions} exists — pass --refresh to regenerate it while keeping your `
    + 'decisions, or choose another path.');
}
if (refresh && existsSync(resolvedDecisions)) {
  refreshDecisions(labels, targets);
} else {
  const written = writeDecisionsFresh(labels, targets);
  console.log(`\n${labels.people.size} person labels, ${labels.locations.size} location labels`);
  console.log(`${written} rows written to ${resolvedDecisions}`);
  console.log('Edit the `decision` column (a person/location okey, or blank to keep it free text),');
  console.log('then re-run with --write.');
}
process.exit(0);
