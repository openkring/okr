#!/usr/bin/env node
/**
 * Audits person document ids and person aliases for one tenant. READ-ONLY — this script has no
 * write path at all, by design: every finding here needs a human decision about WHICH of two
 * plausible records is the real one, and that is not a decision a script may take.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * The bka diary import (2026-08-23, spec 1.34 §V3) hand-minted SEMANTIC person ids
 * (`p_<lastname>_<firstname>`, also `m_`/`c_`/`b_` prefixes and bare slugs like `suessli`)
 * instead of the random ids `FirestoreService.createModel` generates. A semantic id is a
 * second, unverified copy of the name, and nothing in the app, the rules or the seeding
 * scripts ever reconciles the two.
 *
 * On 2026-08-23 14:45 one batch row paired the PREVIOUS row's id with the NEXT row's payload:
 * `persons/p_schaller_darinka` was created holding Barbara Loepfe — a byte-identical duplicate
 * of `persons/p_loepfe_baba`. Nothing complained, because every write path is a blind upsert
 * (`setDoc`/`.set()` with no existence check). At 18:05 the alias seeder then wired
 * `aliases/bka__person__darinka` to it, because the decision was made by reading the OKEY,
 * which spells "schaller darinka". The mistake was invisible for 18 days and only surfaced when
 * the real Darinka Schaller arrived from tenant kwa and produced two records claiming the name.
 *
 * Both documents were repaired by hand on 2026-09-10. This script exists to find the others.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * WHAT IT CHECKS
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *   A  persons with a semantic id whose id disagrees with firstName/lastName
 *   B  aliases in the `person` space whose target is missing, or whose slug disagrees with the
 *      target's name
 *   C  two non-archived persons in this tenant sharing the same first+last name
 *
 * Findings are graded, because an exact-match rule would drown the real defects in noise:
 *   OK        every token of the id/slug matches a token of the name
 *   PARTIAL   some tokens match, some do not — usually a nickname (`p_loepfe_baba` for
 *             Barbara "Baba" Loepfe). Worth a glance, rarely wrong.
 *   MISMATCH  NO token matches. In check A that is the p_schaller_darinka signature and is
 *             almost certainly a wrong document. In check B it is ambiguous: the diary uses
 *             nicknames heavily, so a person alias legitimately has no overlap with the name.
 *             Read the target name printed beside it and decide.
 *
 * Exit code is 1 when check A found a MISMATCH or check B found a DANGLING target — those are
 * unambiguous defects. Nicknames and duplicates never fail the run.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * PRIVACY
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * The output lists real names from a personal diary. It goes to stdout; `--out=<path>` writes
 * a report file instead and REFUSES a path inside this repository, matching the rule
 * seed-diary-aliases.mjs applies to its decisions file.
 *
 * Run with:  node scripts/audit-person-key-consistency.mjs --tenant=bka
 *            node scripts/audit-person-key-consistency.mjs --tenant=bka --out=~/okr-audit.txt
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? '';

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const tenantId = flag('tenant');
if (!tenantId) fail('--tenant=<id> is mandatory.');

const outPath = flag('out');
const resolvedOut = outPath ? path.resolve(outPath.replace(/^~(?=$|\/)/, process.env.HOME ?? '~')) : '';
if (resolvedOut && resolvedOut.startsWith(ROOT + path.sep)) {
  fail(`--out must lie OUTSIDE the repository (${ROOT}). The report holds real names.`);
}

/**
 * The slug function is duplicated from libs/system/alias/util/src/lib/alias-slug.util.ts because
 * a plain node script cannot resolve '@okr/*'. It must produce the SAME slug the alias seeder
 * and the diary import produce, or this audit compares against slugs nobody ever wrote.
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
 * Same drift guard as seed-diary-aliases.mjs: comments and formatting are stripped before
 * hashing, so documentation edits do not trip it while any change to the FOLD map or the
 * transform chain does. The fingerprint is shared with that script — when one moves, both do.
 */
const LIB_SLUG = path.join(ROOT, 'libs/system/alias/util/src/lib/alias-slug.util.ts');
const LIB_SLUG_FINGERPRINT = 'dd9ffb84093ccc9b';
const libBehaviour = readFileSync(LIB_SLUG, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')
  .replace(/\s+/g, '');
const actualSlugFingerprint = createHash('sha256').update(libBehaviour).digest('hex').slice(0, 16);
if (actualSlugFingerprint !== LIB_SLUG_FINGERPRINT) {
  fail(`toAliasSlug drifted: ${LIB_SLUG} no longer matches the copy in this script `
     + `(fingerprint ${actualSlugFingerprint}, expected ${LIB_SLUG_FINGERPRINT}). Re-copy the `
     + `function and the FOLD map, then update LIB_SLUG_FINGERPRINT here AND in `
     + `scripts/seed-diary-aliases.mjs.`);
}

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

// Inlined for the same reason as in seed-diary-aliases.mjs: '@okr/shared-constants' is not
// resolvable from a plain node script. Source of truth stays libs/shared/models/src/lib/.
const PersonCollection = 'persons';
const AliasCollection = 'aliases';
const APP_CONFIG = 'app-config';

const configSnap = await db.collection(APP_CONFIG).doc(tenantId).get();
if (!configSnap.exists) fail(`Tenant '${tenantId}' has no ${APP_CONFIG} document.`);

/**
 * An opaque id: a Firestore auto-id or generateRandomString(20) (both 20 chars), or a Firebase
 * Auth uid (28) — a handful of person docs are keyed by their owner's uid. Anything else (an
 * underscore, or shorter than 20 like `etter` and `suessli`) was minted by a human or a one-off
 * script and therefore encodes meaning that can go stale.
 *
 * The length floor is 20, not exactly 20: an `{20}` rule reported all eight uid-keyed persons as
 * MISMATCH on the first run, because no part of a uid can ever appear in a name.
 */
const isRandomId = (id) => /^[A-Za-z0-9]{20,}$/.test(id);

/** `p_schaller_darinka` → ['schaller', 'darinka']; the single-letter prefix carries no name. */
function idTokens(id) {
  return id.replace(/^[a-z]_/, '').split(/[_-]+/).map(toAliasSlug).filter(Boolean);
}

/**
 * Every spelling of the name a hand-minted id or an alias slug could plausibly use: the
 * individual words of both names, plus the two concatenations — `estherMaerki` and
 * `p_vonaarburg_georg` are both real, and both collapse a two-word name into one token.
 */
function nameTokens(firstName, lastName) {
  const first = toAliasSlug(firstName ?? '');
  const last = toAliasSlug(lastName ?? '');
  const words = [...first.split('-'), ...last.split('-')].filter(Boolean);
  const joined = [first.replace(/-/g, ''), last.replace(/-/g, '')].filter(Boolean);
  return new Set([
    ...words,
    ...joined,
    joined.join(''),
    [...joined].reverse().join(''),
  ].filter(Boolean));
}

/**
 * A token counts as matching when it equals a name token, or when one is a prefix of the other
 * and at least 4 characters long — `bjoern` vs `bjoernsson`, not `bab` vs `bar`. The floor
 * matters: at 3 characters a prefix rule starts declaring unrelated people identical.
 */
function tokenMatches(token, names) {
  if (names.has(token)) return true;
  if (token.length < 4) return false;
  for (const name of names) {
    if (name.length < 4) continue;
    if (name.startsWith(token) || token.startsWith(name)) return true;
  }
  return false;
}

/** OK (all tokens match) | PARTIAL (some do) | MISMATCH (none does). */
function grade(tokens, names) {
  if (tokens.length === 0) return 'MISMATCH';
  const matched = tokens.filter((t) => tokenMatches(t, names)).length;
  if (matched === tokens.length) return 'OK';
  return matched > 0 ? 'PARTIAL' : 'MISMATCH';
}

const lines = [];
const say = (line = '') => lines.push(line);

const personSnap = await db.collection(PersonCollection)
  .where('tenants', 'array-contains', tenantId).get();
const persons = new Map(personSnap.docs.map((d) => [d.id, d.data()]));
const display = (p) => `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || '(no name)';

say(`PERSON KEY CONSISTENCY AUDIT — tenant '${tenantId}' — ${new Date().toISOString()}`);
say(`${persons.size} person documents carry this tenant.`);
say();

/* ── A: semantic person ids vs. their content ──────────────────────────────────────────── */
const semantic = [...persons.entries()].filter(([id]) => !isRandomId(id));
const graded = { OK: [], PARTIAL: [], MISMATCH: [] };
for (const [id, p] of semantic) {
  graded[grade(idTokens(id), nameTokens(p.firstName, p.lastName))].push([id, p]);
}

say('══ A. PERSONS WITH A SEMANTIC (HAND-MINTED) DOCUMENT ID ═══════════════════════════════');
say(`${semantic.length} of ${persons.size} ids are not random. `
  + `${graded.OK.length} agree with the name, ${graded.PARTIAL.length} partially, `
  + `${graded.MISMATCH.length} not at all.`);
say();
if (graded.MISMATCH.length > 0) {
  say('  MISMATCH — no part of the id appears in the name. This is the p_schaller_darinka');
  say('  signature: the document almost certainly holds somebody else. Before deleting one,');
  say('  check whether the person it CLAIMS to be exists elsewhere, and repoint every alias.');
  for (const [id, p] of graded.MISMATCH) say(`    ${id.padEnd(28)} holds  ${display(p)}`);
  say();
}
if (graded.PARTIAL.length > 0) {
  say('  PARTIAL — usually a nickname in the id (p_loepfe_baba = Barbara "Baba" Loepfe).');
  for (const [id, p] of graded.PARTIAL) say(`    ${id.padEnd(28)} holds  ${display(p)}`);
  say();
}

/* ── B: person aliases vs. their target ────────────────────────────────────────────────── */
const aliasSnap = await db.collection(AliasCollection)
  .where('tenants', 'array-contains', tenantId).get();
const personAliases = aliasSnap.docs.filter((d) => d.data().space === 'person');
const dangling = [];
const aliasGraded = { OK: [], PARTIAL: [], MISMATCH: [] };
for (const d of personAliases) {
  const a = d.data();
  const okey = (a.targetKey ?? '').split('.').slice(1).join('.');
  const target = okey ? persons.get(okey) : undefined;
  if (!target) { dangling.push([d.id, a.targetKey ?? '(none)']); continue; }
  const tokens = idTokens(a.alias ?? '');
  aliasGraded[grade(tokens, nameTokens(target.firstName, target.lastName))].push([d.id, a, target]);
}

say('══ B. ALIASES IN THE `person` SPACE ═══════════════════════════════════════════════════');
say(`${personAliases.length} person aliases. ${aliasGraded.OK.length} agree with their target, `
  + `${aliasGraded.PARTIAL.length} partially, ${aliasGraded.MISMATCH.length} not at all, `
  + `${dangling.length} point at nothing.`);
say();
if (dangling.length > 0) {
  say('  DANGLING — the target person does not exist in this tenant. The diary lookup for this');
  say('  slug silently resolves to nothing.');
  for (const [id, key] of dangling) say(`    ${id.padEnd(36)} → ${key}`);
  say();
}
if (aliasGraded.MISMATCH.length > 0) {
  say('  NO OVERLAP — the slug shares nothing with the target\'s name. AMBIGUOUS BY NATURE: the');
  say('  diary uses nicknames constantly, so most of these are correct. Read the pairs and');
  say('  decide. `bka__person__darinka → Barbara Loepfe` was how this bug looked.');
  for (const [id, a, t] of aliasGraded.MISMATCH) {
    say(`    ${id.padEnd(36)} '${a.alias}' → ${display(t)}`);
  }
  say();
}

/* ── C: duplicate persons by name ──────────────────────────────────────────────────────── */
const byName = new Map();
for (const [id, p] of persons) {
  if (p.isArchived === true) continue;
  const key = `${toAliasSlug(p.firstName ?? '')}|${toAliasSlug(p.lastName ?? '')}`;
  if (key === '|') continue;
  byName.set(key, [...(byName.get(key) ?? []), id]);
}
const dupes = [...byName.entries()].filter(([, ids]) => ids.length > 1);

say('══ C. DUPLICATE PERSONS (SAME NAME, NOT ARCHIVED) ═════════════════════════════════════');
say(`${dupes.length} name${dupes.length === 1 ? '' : 's'} held by more than one document.`);
say();
for (const [key, ids] of dupes) {
  const p = persons.get(ids[0]);
  say(`    ${display(p)}`);
  for (const id of ids) {
    const semanticFlag = isRandomId(id) ? '' : '  (semantic id)';
    say(`      ${id}${semanticFlag}`);
  }
}
if (dupes.length > 0) {
  say();
  say('  A duplicate pair where one side has a SEMANTIC id and the other a random one is the');
  say('  shape this incident had: a hand-made diary person, then the real record allocated in');
  say('  from another tenant. Keep the allocated one — it carries the cross-tenant history.');
}
say();

const report = lines.join('\n') + '\n';
if (resolvedOut) {
  writeFileSync(resolvedOut, report, 'utf8');
  console.log(`Report written to ${resolvedOut} (${lines.length} lines).`);
} else {
  process.stdout.write(report);
}

const defects = graded.MISMATCH.length + dangling.length;
if (defects > 0) {
  console.error(`\n✖ ${defects} unambiguous defect(s): `
    + `${graded.MISMATCH.length} person id(s) disagreeing with their content, `
    + `${dangling.length} dangling alias target(s).`);
  process.exit(1);
}
