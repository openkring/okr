/**
 * NORMALIZE THE TENANT-ID VOCABULARY — dry run by default, idempotent, re-runnable.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * WHY
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * The database carries TWO tenant-id vocabularies that nothing keeps in sync: the
 * `app-config` document ids the application actually joins on, and the strings that
 * accumulated in `tenants[]` arrays across every content collection. The `enabledFeatures`
 * backfill is blocked on the difference. The fix is to normalise the DATA — making the
 * backfill tolerant of the legacy ids would bake the mess in permanently.
 *
 * Three jobs, all of them idempotent so a partial earlier run cannot break a re-run:
 *
 *   1. STRIP `app-config.tenantId`. Redundant with the document id and never queried:
 *      `AppConfigService.read(key)` → `.doc(key)`; `key = store.tenantId() = env.tenantId`,
 *      derived in `set-env.js:104` from the Nx project name; the same string feeds
 *      `getSystemQuery` and every Cloud Function's `.doc(tenantId)`. Nothing anywhere
 *      issues `where('tenantId', …)` on `app-config`. The stale field already misled one
 *      migration attempt into keying on it. The class field is gone (`AppConfig`, 2026-08-05);
 *      this removes it from the live documents.
 *
 *   2. REMOVE ORPHAN IDS from every `tenants[]` array — ids with no `app-config` document.
 *
 *   3. REPORT what `kring`/`okr` are missing. Deliberately NOT written here — see
 *      "STEP 2.2" below; `applyFeatureSelection` owns that write.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * SAFETY
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *   --dry-run is the DEFAULT and is what this script does when given no arguments.
 *   --write must be explicit, AND is refused unless the operator also names the ids to
 *   remove with --remove=<a,b,c>. There is no "remove everything the dry run listed"
 *   shortcut: the whole point of the review step is that a human chooses the list.
 *
 * Usage:
 *   node scripts/normalize-tenant-ids.mjs                       # dry run (default)
 *   node scripts/normalize-tenant-ids.mjs --json                # machine-readable
 *   node scripts/normalize-tenant-ids.mjs --check               # guard only, exit 3 on drift
 *   node scripts/normalize-tenant-ids.mjs --write --remove=kwo,pzu   # THE write form
 *   node scripts/normalize-tenant-ids.mjs --write --strip-tenant-id  # job 1 only
 *
 * Exit codes: 0 clean · 1 unexpected error · 2 refused · 3 vocabulary drift detected.
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { createJiti } from 'jiti';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MODELS_DIR = path.join(ROOT, 'libs/shared/models/src/lib');

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { scanCollections, findTenantVocabularyDrift, formatDrift } =
  await jiti.import(path.join(ROOT, 'libs/tenant/util/src/lib/tenant-scope.util.ts'));
const { FEATURE_BLOCKS } = await jiti.import(path.join(ROOT, 'libs/tenant/util/src/lib/feature-blocks.ts'));
const { menuSpecNames, indexMenuDocsByName } =
  await jiti.import(path.join(ROOT, 'libs/tenant/util/src/lib/menu-seed.util.ts'));

const APP_CONFIG = 'app-config';
const MENU_ITEMS = 'menuItems';
/** Firestore caps a WriteBatch at 500 ops; 400 leaves the same headroom the rest of the repo uses. */
const BATCH_SIZE = 400;

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * PRESERVED_TENANTS — ids that have NO app-config document but must NOT be swept.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ DO NOT "CLEAN THESE UP". ⚠️
 *
 * An entry here is a tenant that is coming back, not a leftover. Having no config document
 * today does not prove a tenant is dead — `bka` is the proof of that. Keeping an id is
 * reversible in one command; stripping it is not, and reconstructing a thousand
 * memberships after the fact means rebuilding data this script destroyed.
 *
 * These ids are excluded from the orphan sweep AND from the drift guard's failure set —
 * but they are still REPORTED in the dry run, with their full per-collection footprint, so
 * the exemption stays visible and the owner can narrow it later.
 */
const PRESERVED_TENANTS = {
  bka: {
    ruling: 'owner, 2026-08-05',
    reason: 'Tenant to be re-provisioned. Owner: "keep the 958 bka tenants within transfers. ' +
            'We will add that tenant later." Applied to EVERY collection, not just `transfers`: ' +
            'the reasoning is that the tenant is coming back, and a half-kept membership set ' +
            'would be worse than either extreme.',
  },
};

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * NON_TENANT_MARKERS — strings that appear in `tenants[]` but are not tenant ids at all.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * Distinct from PRESERVED_TENANTS: those are tenants, these are not. The guard allowlists
 * them; the sweep leaves them alone. Every entry needs a citation, because an unjustified
 * entry here is a hole in the drift guard.
 */
const NON_TENANT_MARKERS = {
  default: {
    reason: 'Seed/template marker on `tags`, documented in AppStore.getTags ' +
            '(libs/shared/feature/src/lib/app.store.ts): "You will find a database entry ' +
            "'default' to start with or extend the tenants for an existing entry with your own " +
            'tenantId." It is a starter row, not a tenant, and no app-config document is ' +
            'expected. Removing it would destroy the template every new tenant copies from.',
  },
};

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * QUARANTINE — ids that require the owner to name them, individually, before any write.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * `test` is listed as an orphan but is the second-largest content tenant in the database.
 * Removing it detaches all of that at once. It is refused even when passed to --remove
 * unless --i-really-mean-test is ALSO given, so it cannot be swept in by a copy-pasted list.
 */
const QUARANTINED = ['test'];

const ARGS = process.argv.slice(2);
const has = (flag) => ARGS.includes(flag);
const valueOf = (name) => {
  const hit = ARGS.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

const WRITE = has('--write');
const CHECK_ONLY = has('--check');
const JSON_OUT = has('--json');
const STRIP_ONLY = has('--strip-tenant-id');
const TEST_CONFIRMED = has('--i-really-mean-test');
const REMOVE = (valueOf('remove') ?? '').split(',').map(s => s.trim()).filter(Boolean);

const log = (...a) => { if (!JSON_OUT) console.log(...a); };
const rule = (ch = '─') => log(ch.repeat(100));

function refuse(message) {
  console.error(`\nREFUSED: ${message}\n`);
  process.exit(2);
}

if (WRITE && REMOVE.length === 0 && !STRIP_ONLY) {
  refuse(
    '--write requires either --remove=<id,id,…> or --strip-tenant-id.\n' +
    'There is deliberately no "remove everything the dry run found" flag: the dry run exists\n' +
    'so a human chooses the list, and a bare --write would sweep every orphan — including the\n' +
    'quarantined ones — in a single unreviewed command.',
  );
}
for (const id of REMOVE) {
  if (PRESERVED_TENANTS[id]) {
    refuse(`"${id}" is in PRESERVED_TENANTS (${PRESERVED_TENANTS[id].ruling}) and must not be removed.\n` +
           PRESERVED_TENANTS[id].reason);
  }
  if (NON_TENANT_MARKERS[id]) {
    refuse(`"${id}" is not a tenant id — it is a marker.\n${NON_TENANT_MARKERS[id].reason}`);
  }
  if (QUARANTINED.includes(id) && !TEST_CONFIRMED) {
    refuse(`"${id}" is QUARANTINED. It is the second-largest content tenant in the database and\n` +
           'removing it detaches all of that content at once. Read the "QUARANTINED" section of the\n' +
           'dry run, then pass --i-really-mean-test in addition to --remove if that is genuinely\n' +
           'what the owner asked for.');
  }
}

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

// ───────────────────────────────────────────────────────────────────────────────────────
// 1. DERIVE THE COLLECTION SET FROM `@okr/shared-models` — never a hardcoded list.
// ───────────────────────────────────────────────────────────────────────────────────────
function deriveCollections() {
  const files = fs.readdirSync(MODELS_DIR)
    .filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .map(f => ({ file: f, source: fs.readFileSync(path.join(MODELS_DIR, f), 'utf8') }));
  return scanCollections(files);
}

async function main() {
  const scan = deriveCollections();

  if (scan.ambiguous.length > 0) {
    console.error('\nREFUSED: the collection derivation could not classify these constants:\n');
    scan.ambiguous.forEach(a => console.error(`  ${a.constName} ('${a.collection}') in ${a.file}\n    ${a.reason}`));
    console.error('\nA migration that silently skips a collection is worse than one that stops and asks.');
    console.error('Resolve the ambiguity in libs/shared/models, or teach scanCollections the new shape.\n');
    process.exit(2);
  }

  const scoped = scan.scoped.map(s => s.collection);
  const liveCollections = new Set((await db.listCollections()).map(c => c.id));

  // Reconcile source against Firestore in BOTH directions before trusting either.
  const modelledButAbsent = scoped.filter(c => !liveCollections.has(c)).sort();
  const declaredUnscoped = new Set(scan.unscoped.map(u => u.collection));
  const liveWithoutModel = [...liveCollections]
    .filter(c => !scoped.includes(c) && !declaredUnscoped.has(c))
    .sort();

  rule('=');
  log(`NORMALIZE TENANT IDS — ${WRITE ? 'WRITE' : CHECK_ONLY ? 'CHECK' : 'DRY RUN'}`);
  log(new Date().toISOString());
  rule('=');

  // ── collection derivation ────────────────────────────────────────────────────────────
  log('\nCOLLECTION DERIVATION (from libs/shared/models/src/lib/*.model.ts)');
  rule();
  log(`  tenant-scoped collections : ${scoped.length}`);
  log(`  excluded (no tenants[])   : ${scan.unscoped.length} — ` +
      scan.unscoped.map(u => u.collection).join(', '));
  if (scan.tenantModelsWithoutCollection.length) {
    log('  models carrying tenants[] but declaring NO *Collection constant:');
    scan.tenantModelsWithoutCollection.forEach(m => log(`      ${m.model} (${m.file})`));
    log('      ^ expected for base/embedded types; check none of these is a real collection.');
  }
  if (modelledButAbsent.length) {
    log(`  modelled but not present in Firestore (0 docs, harmless): ${modelledButAbsent.join(', ')}`);
  }
  if (liveWithoutModel.length) {
    log('  ⚠️  LIVE COLLECTIONS WITH NO MODEL CONSTANT — not scanned, reported not guessed:');
    liveWithoutModel.forEach(c => log(`      ${c}`));
  }

  // ── census ───────────────────────────────────────────────────────────────────────────
  const present = scoped.filter(c => liveCollections.has(c));
  const census = {};       // collection -> { tenantId: docCount }
  const docsByCollection = {}; // collection -> [{ id, tenants }]
  let noArrayCount = 0;
  const noArrayWhere = {};

  for (const c of present) {
    const snap = await db.collection(c).select('tenants').get();
    const ids = {};
    const docs = [];
    for (const d of snap.docs) {
      const t = d.get('tenants');
      if (!Array.isArray(t)) {
        noArrayCount++;
        noArrayWhere[c] = (noArrayWhere[c] ?? 0) + 1;
        continue;
      }
      docs.push({ id: d.id, tenants: t });
      for (const x of t) ids[x] = (ids[x] ?? 0) + 1;
    }
    census[c] = ids;
    docsByCollection[c] = docs;
  }

  const configSnap = await db.collection(APP_CONFIG).get();
  const configIds = configSnap.docs.map(d => d.id).sort();

  log(`\n  scanned ${present.length} live collection(s), ` +
      `${Object.values(docsByCollection).reduce((n, d) => n + d.length, 0)} document(s) with a tenants[] array`);
  if (noArrayCount) {
    log(`  ⚠️  ${noArrayCount} document(s) in a tenant-scoped collection have NO tenants array ` +
        `(${Object.entries(noArrayWhere).map(([c, n]) => `${c}:${n}`).join(', ')}) — ` +
        'invisible to every tenant-scoped query. Skipped here; a separate data defect.');
  }

  // ── the app-config set, re-queried live ──────────────────────────────────────────────
  log(`\nLIVE app-config SET — ${configIds.length} document(s)`);
  rule();
  for (const d of configSnap.docs) {
    const x = d.data();
    log(`  ${d.id.padEnd(8)} tenantId field: ${x.tenantId === undefined ? '<absent>' :
        x.tenantId === d.id ? `"${x.tenantId}" (matches doc id)` : `"${x.tenantId}" ⚠️ DISAGREES`}` +
        `   enabledFeatures: ${x.enabledFeatures ? `${x.enabledFeatures.length} blocks` : '<absent>'}`);
  }

  // ── THE DRIFT GUARD ──────────────────────────────────────────────────────────────────
  const allowlist = [...Object.keys(NON_TENANT_MARKERS), ...Object.keys(PRESERVED_TENANTS)];
  const drift = findTenantVocabularyDrift(configIds, census, allowlist);

  log('\nDRIFT GUARD — every tenants[] id must exist as an app-config document id');
  rule();
  log(`  allowlisted markers  : ${Object.keys(NON_TENANT_MARKERS).join(', ') || '(none)'}`);
  log(`  preserved tenants    : ${Object.keys(PRESERVED_TENANTS).join(', ') || '(none)'}`);
  log('  ' + formatDrift(drift).split('\n').join('\n  '));
  if (drift.configsWithoutContent.length) {
    log(`  app-config ids no document claims: ${drift.configsWithoutContent.join(', ')}`);
  }

  if (CHECK_ONLY) {
    if (!drift.ok) process.exit(3);
    log('\n(--check: guard only, nothing else run.)');
    return;
  }

  // ── footprints: what removing each id would actually detach ──────────────────────────
  const footprint = (id) => Object.entries(census)
    .filter(([, ids]) => ids[id] > 0)
    .map(([c, ids]) => ({ collection: c, docs: ids[id] }))
    .sort((a, b) => b.docs - a.docs || a.collection.localeCompare(b.collection));
  const total = (fp) => fp.reduce((n, x) => n + x.docs, 0);

  const printFootprint = (id, fp, indent = '    ') => {
    log(`${indent}${id} — ${total(fp)} document(s) across ${fp.length} collection(s)`);
    fp.forEach(x => log(`${indent}  ${x.collection.padEnd(22)} ${String(x.docs).padStart(6)}`));
  };

  log('\n' + '='.repeat(100));
  log('PRESERVED — NOT swept (owner ruling). Footprint shown so the exemption can be narrowed.');
  log('='.repeat(100));
  for (const [id, meta] of Object.entries(PRESERVED_TENANTS)) {
    log(`\n  ${id}  [${meta.ruling}]`);
    log(`  ${meta.reason.replace(/(.{92}) /g, '$1\n  ')}`);
    printFootprint(id, footprint(id));
  }

  log('\n' + '='.repeat(100));
  log('MARKERS — NOT swept (not tenant ids at all).');
  log('='.repeat(100));
  for (const [id, meta] of Object.entries(NON_TENANT_MARKERS)) {
    log(`\n  ${id}`);
    log(`  ${meta.reason.replace(/(.{92}) /g, '$1\n  ')}`);
    printFootprint(id, footprint(id));
  }

  log('\n' + '!'.repeat(100));
  log('!! QUARANTINED — REQUIRES THE OWNER TO CONFIRM BY NAME BEFORE ANY WRITE');
  log('!'.repeat(100));
  for (const id of QUARANTINED) {
    const fp = footprint(id);
    log(`\n  "${id}" is on the orphan list (no app-config document) but is the SECOND-LARGEST`);
    log('  content tenant in the database. Removing it detaches all of the following at once,');
    log('  irreversibly, and no app-config document exists to serve it afterwards:');
    printFootprint(id, fp, '      ');
    const sole = fp.filter(x => {
      const others = Object.entries(census[x.collection]).filter(([k, n]) => k !== id && n > 0);
      return others.length === 0;
    });
    if (sole.length) {
      log(`  ⚠️  ${id} is the ONLY tenant in: ${sole.map(s => s.collection).join(', ')} — ` +
          'those collections would be left with orphaned documents no tenant can reach.');
    }
    const near = fp.filter(x => {
      const totalDocs = Object.values(census[x.collection]).reduce((n, v) => n + v, 0);
      return x.docs / totalDocs > 0.5;
    });
    if (near.length) {
      log(`  ⚠️  ${id} carries the MAJORITY of: ` +
          near.map(n => `${n.collection} (${n.docs})`).join(', '));
    }
    log('  DO NOT include it in --remove without --i-really-mean-test and an explicit owner say-so.');
  }

  // ── 2.1 orphan removal plan ──────────────────────────────────────────────────────────
  const sweepable = drift.unknown.map(u => u.tenantId).filter(id => !QUARANTINED.includes(id));

  log('\n' + '='.repeat(100));
  log('STEP 2.1 — ORPHAN REMOVAL (per collection, per id)');
  log('='.repeat(100));
  log(`  candidates (excluding preserved, markers and quarantined): ${sweepable.join(', ') || '(none)'}`);

  const plan = {};   // collection -> { docsTouched, byId: {id: n}, docsEmptied }
  for (const c of present) {
    const byId = {};
    let docsTouched = 0;
    let docsEmptied = 0;
    for (const d of docsByCollection[c]) {
      const hits = d.tenants.filter(t => sweepable.includes(t));
      if (hits.length === 0) continue;
      docsTouched++;
      hits.forEach(h => { byId[h] = (byId[h] ?? 0) + 1; });
      if (d.tenants.filter(t => !sweepable.includes(t)).length === 0) docsEmptied++;
    }
    if (docsTouched > 0) plan[c] = { docsTouched, byId, docsEmptied };
  }

  log('');
  log('  collection             docs touched   would be left with EMPTY tenants[]   removals by id');
  rule();
  let grandTouched = 0, grandEmptied = 0;
  for (const [c, p] of Object.entries(plan).sort()) {
    grandTouched += p.docsTouched;
    grandEmptied += p.docsEmptied;
    log(`  ${c.padEnd(22)} ${String(p.docsTouched).padStart(8)}   ${String(p.docsEmptied).padStart(30)}   ` +
        Object.entries(p.byId).sort().map(([k, n]) => `${k}:${n}`).join(' '));
  }
  rule();
  log(`  ${'TOTAL'.padEnd(22)} ${String(grandTouched).padStart(8)}   ${String(grandEmptied).padStart(30)}`);
  if (grandEmptied > 0) {
    log('\n  ⚠️  Documents left with an EMPTY tenants[] become invisible to every tenant-scoped');
    log('      query (getSystemQuery issues `tenants array-contains <id>`). They are NOT deleted');
    log('      by this script — deletion is a separate decision — but they will be unreachable.');
  }

  // ── 2.2 — what kring/okr are missing ─────────────────────────────────────────────────
  await reportStep22(configSnap, docsByCollection[MENU_ITEMS] ?? []);

  // ── job 1 — strip the tenantId field ─────────────────────────────────────────────────
  const stripTargets = configSnap.docs.filter(d => d.data().tenantId !== undefined).map(d => d.id);
  log('\n' + '='.repeat(100));
  log('STEP 1 — STRIP app-config.tenantId');
  log('='.repeat(100));
  log(`  documents still carrying the field: ${stripTargets.length ? stripTargets.join(', ') : '(none — already clean)'}`);
  log('  The class field is already gone (AppConfig, 2026-08-05). Removing it from the live');
  log('  documents is idempotent: FieldValue.delete() on a doc without the field is a no-op.');

  // ── writes ───────────────────────────────────────────────────────────────────────────
  if (!WRITE) {
    log('\n' + '='.repeat(100));
    log('DRY RUN — NOTHING WAS WRITTEN.');
    log('='.repeat(100));
    log('  To strip the redundant field only:');
    log('    node scripts/normalize-tenant-ids.mjs --write --strip-tenant-id');
    log('  To sweep orphans, name them explicitly after the counts above have been reviewed:');
    log(`    node scripts/normalize-tenant-ids.mjs --write --remove=${sweepable.join(',') || '<ids>'}`);
    log('  Step 2.2 is NOT written by this script — see its section above.');
  } else {
    await applyWrites({ stripTargets, present, docsByCollection });
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({
      configIds, scoped, unscoped: scan.unscoped, ambiguous: scan.ambiguous,
      liveWithoutModel, modelledButAbsent, census, drift, plan,
      preserved: Object.keys(PRESERVED_TENANTS), markers: Object.keys(NON_TENANT_MARKERS),
      quarantined: QUARANTINED, stripTargets,
    }, null, 1));
  }

  if (!drift.ok && !WRITE) process.exitCode = 3;
}

/**
 * STEP 2.2 — add `kring` and `okr` to the menu documents they should own.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * THIS SCRIPT DELIBERATELY DOES NOT WRITE THIS. `applyFeatureSelection` does.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * "Where they belong" is not a fact about the current data — it is a function of the
 * tenant's `enabledFeatures` and the block catalogue's `menu` specs. `applyFeatureSelection`
 * already computes exactly that and already adds the tenant to `tenants[]`
 * (`planMenuOps` → op `add-tenant`, menu-seed.util.ts). Reimplementing it here would mean
 * reimplementing, and then keeping in sync:
 *   - `resolveWithDeps` + `resolveAvailability` (a bespoke migration adding menu docs for
 *     blocks a rollout withholds would grant access the runtime gate refuses);
 *   - `indexMenuDocsByName` — indexing by doc id instead of the `name` FIELD is blind to
 *     the eleven live legacy-autoid docs and writes a duplicate for each;
 *   - `resolveCandidates`, the per-tenant name-collision resolver (exhaustively verified,
 *     2048 configurations, zero drift) that picks `resource-menu-scs` for `scs` and the
 *     generic `resource-menu` for everyone else;
 *   - the create path for docs that do not exist yet, with `isArchived: false` and a
 *     computed `index` — without which a newly created menu doc is invisible to
 *     `getSystemQuery`;
 *   - the shared-parent write-fold that stops two blocks appending to one parent from
 *     silently dropping each other's child.
 * Every one of those is a way for a hand-rolled sweep to be quietly wrong, and none of
 * them is easier to reason about locally than calling the function that already does it.
 *
 * What this section does instead is REPORT the gap, using the same pure functions
 * `applyFeatureSelection` uses, so the size of the write is visible before it is made.
 */
async function reportStep22(configSnap, menuDocs) {
  log('\n' + '='.repeat(100));
  log('STEP 2.2 — kring / okr menu membership (REPORT ONLY — applyFeatureSelection owns this write)');
  log('='.repeat(100));

  const byId = new Map(FEATURE_BLOCKS.map(b => [b.id, b]));
  const raw = menuDocs.map(d => ({ id: d.id, tenants: d.tenants }));

  for (const tenantId of ['kring', 'okr']) {
    const cfg = configSnap.docs.find(d => d.id === tenantId);
    log(`\n  ${tenantId}`);
    if (!cfg) { log('    no app-config document — nothing to do here.'); continue; }

    const enabled = cfg.data().enabledFeatures;
    const held = raw.filter(d => (d.tenants ?? []).includes(tenantId)).length;
    log(`    enabledFeatures     : ${enabled === undefined ? '<absent>' : `${enabled.length} blocks`}`);
    log(`    menuItems docs held : ${held}`);

    if (enabled === undefined) {
      log('    → NO ACTION POSSIBLE YET. With no `enabledFeatures` there is nothing to derive a');
      log('      menu set from, and applyFeatureSelection would have nothing to apply. The owner');
      log('      must pick this tenant\'s blocks first (feature-picker, or the enabledFeatures');
      log('      backfill once the vocabulary is clean). Do not invent a set here.');
      continue;
    }

    const wanted = new Set();
    for (const id of enabled) {
      const block = byId.get(id);
      if (!block?.menu) continue;
      menuSpecNames(block.menu).forEach(n => wanted.add(n));
    }
    log(`    menu doc names implied by those blocks : ${wanted.size}`);
    log(`    → run applyFeatureSelection('${tenantId}', <its ${enabled.length} blocks>) to reconcile.`);
    log('      It will add the tenant to the docs it should inherit, create the ones that do not');
    log('      exist, and leave every other tenant\'s membership untouched.');
  }
  log('\n  Why not write it here: see the doc comment on reportStep22() in this file.');
  // `indexMenuDocsByName` is imported so this file fails loudly if the seed API it defers
  // to ever changes shape, rather than silently reporting against a stale contract.
  void indexMenuDocsByName;
}

async function applyWrites({ stripTargets, present, docsByCollection }) {
  log('\n' + '='.repeat(100));
  log('WRITING');
  log('='.repeat(100));

  let ops = 0;
  let batch = db.batch();
  const flush = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  };
  const queue = async (ref, data) => {
    batch.set(ref, data, { merge: true });
    if (++ops >= BATCH_SIZE) await flush();
  };

  if (STRIP_ONLY || REMOVE.length === 0) {
    for (const id of stripTargets) {
      await queue(db.collection(APP_CONFIG).doc(id), { tenantId: FieldValue.delete() });
      log(`  ${APP_CONFIG}/${id}: delete tenantId`);
    }
  }

  if (REMOVE.length > 0) {
    for (const c of present) {
      let touched = 0;
      for (const d of docsByCollection[c]) {
        const next = d.tenants.filter(t => !REMOVE.includes(t));
        if (next.length === d.tenants.length) continue; // idempotent: nothing to do
        await queue(db.collection(c).doc(d.id), { tenants: next });
        touched++;
      }
      if (touched) log(`  ${c}: ${touched} document(s) updated`);
    }
  }

  await flush();
  log('\n  done.');
}

main().catch((e) => { console.error(e); process.exit(1); });
