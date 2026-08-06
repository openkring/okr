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
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * REQUIRED SEQUENCE — the sweep and step 2.2 write the same documents
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * `applyFeatureSelection` ADDS tenants to `menuItems.tenants[]`; this script REMOVES them.
 * They touch the same collection, so the order matters and they must not overlap:
 *
 *   1. dry run, reviewed by the owner
 *   2. `--write --strip-tenant-id`     (job 1; touches only app-config)
 *   3. `--write --remove=<ids>`        (job 2.1; the sweep)
 *   4. DRY RUN AGAIN — confirm the sweep landed and the counts are what you expect
 *   5. only then `applyFeatureSelection(...)` for `okr` / `kring`   (job 2.2)
 *   6. only then re-run the `enabledFeatures` backfill
 *
 * Step 4 is not optional. Do not run 3 and 5 concurrently. The writes themselves are
 * concurrency-safe (`FieldValue.arrayRemove`, see `applyWrites`), so an overlap can no
 * longer silently revert a seed — but the REPORTED counts would still be computed against
 * a database being changed underneath them, and a count nobody can trust is not a review.
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

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * R-10 — OWNER RULING, 2026-08-05. `test` leaves quarantine. VERBATIM:
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 *   "delete all firestore documents that have 'test' as the only tenant ['test'].
 *    firestore documents that have 'test' and some other tenantIds (e.g. ['scs','test']),
 *    must be kept, but the tenantId 'test' removed from the tenants field ['scs']."
 *
 * Two dispositions, decided per document by its CURRENT `tenants[]`:
 *   tenants === ['test']              → DELETE the document      (irreversible)
 *   tenants ⊇ {test} and |tenants|>1  → KEEP, strip 'test' only
 *
 * ⚠️ "test-only" MEANS LITERALLY `['test']` AS THE DATA READS TODAY. ⚠️
 * It is not "would be test-only after the orphan sweep". Those are different document sets
 * and the ORDER of the two operations changes which documents die — see
 * `reportOrderInteraction`. The ruling speaks about the data the owner looked at, so R-10
 * is evaluated against today's `tenants[]` and the difference is reported to the owner as
 * its own line rather than being silently folded into either operation.
 *
 * `bka` (R-9) is unaffected by this: a `['test','bka']` document is NOT test-only, so it
 * takes the strip path and keeps `bka`. That is the 958 `transfers` rows.
 */
const R10 = {
  ruling: 'R-10',
  date: '2026-08-05',
  tenant: 'test',
};

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * R-11 — OWNER RULINGS, 2026-08-06. Resolves the two cascade STOPs that blocked R-10.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * The cascade check refused R-10 twice, and the owner ruled on the specifics rather than
 * on the category. Two documents are RETAGGED out of the delete set; two resulting dangles
 * are ACCEPTED. Both halves are encoded as data, below, so the STOP still fires for
 * anything that is not exactly what was ruled on.
 *
 * RETAGS — the mis-tagging class. These documents are tagged `['test']` but are demonstrably
 * live-tenant data; the tag is the defect, not the document.
 *   orgs/p13                      → ['p13']   It is `app-config/p13.ownerOrgId`. Deleting it
 *                                             would have taken out the live p13 tenant's own
 *                                             owner organisation, and 13 p13 memberships
 *                                             point at it.
 *   persons/WeJRI923rpCaEEOj5kLr  → ['scs']   "Jan Paulich", who carries a live scs
 *                                             membership. A person with live scs membership
 *                                             is scs data. Retagging keeps person and
 *                                             membership consistent, so no identity is
 *                                             orphaned and the erasure pipeline can still
 *                                             reach him from the person record.
 */
const R11_RETAGS = [
  { collection: 'orgs',    docId: 'p13',                  tenants: ['p13'],
    why: 'app-config/p13.ownerOrgId — the live p13 tenant\'s own owner org, mis-tagged as test' },
  { collection: 'persons', docId: 'WeJRI923rpCaEEOj5kLr', tenants: ['scs'],
    why: '"Jan Paulich" — carries a live scs membership; person + membership stay consistent' },
];

/**
 * ⚠️ ACCEPTED DANGLING REFERENCES — R-11, 2026-08-06. NOT A BLANKET OVERRIDE. ⚠️
 *
 * The owner ruled that `orgs/BCYEdhxc48jzU8RlfPde` ("Segelclub Stäfa") and
 * `resources/test_default` ("Bootshaus") ARE deleted per R-10, with the consequence stated:
 * exactly two live `scs` documents are left pointing at records that no longer exist.
 *
 * That consequence is accepted for THESE TWO PAIRS ONLY. It is deliberately expressed as an
 * allow-list of (referencing document, field, target document) triples rather than as a
 * `--force` flag, because a flag would accept a CATEGORY — every present and future dangle
 * — whereas the owner accepted two specific documents. Any dangle not listed here still
 * fires STOP 2 and still blocks the delete.
 *
 * If a third dangle appears, the correct response is to stop and ask, not to extend this
 * list on your own authority.
 */
const R11_ACCEPTED_DANGLES = [
  {
    ref: 'memberships/kZn8vywT51xeyijAcReK', field: 'orgKey',
    target: 'orgs/BCYEdhxc48jzU8RlfPde',
    ruling: 'R-11 (2026-08-06)',
    why: 'org "Segelclub Stäfa" is deleted per R-10; this scs membership keeps naming it',
  },
  {
    ref: 'ownerships/qtTudReXwaTlJnALHDkM', field: 'resourceKey',
    target: 'resources/test_default',
    ruling: 'R-11 (2026-08-06)',
    why: 'resource "Bootshaus" is deleted per R-10; this scs ownership keeps naming it',
  },
];

/**
 * ⚠️ STALE DENORMALISED SEARCH INDEX — one targeted repair, not a sweep. ⚠️
 *
 * `MembershipModel.index` denormalises the foreign keys for search:
 *     "mn:<name> mk:<memberKey> ok:<orgKey> on:<orgName>"
 * The owner's repointing (see R-11) updated `orgKey` but NOT `index`, so this document now
 * searches by a deleted organisation's key.
 *
 * A full scan of all 1 702 memberships found the pattern is BROADER than this document —
 * 22 carry an `index` whose `ok:` disagrees with `orgKey`. They split three ways:
 *   -  1  kZn8vywT51xeyijAcReK  [test,scs]  in the STRIP set — repaired here, by instruction.
 *   -  1  jg8crnouuuo2ey7y6f7d  [test]      in the DELETE set — no repair needed, it goes away.
 *   - 20  [scs]-only, pre-existing and unrelated: `orgKey` was migrated to group names
 *         (`breitensport`, `leistungssport`, `Redaktion`) while `index` kept the old key.
 *         OUTSIDE the R-10/R-11 write scope. REPORTED, deliberately NOT fixed here — a
 *         silent bulk rewrite of live scs search data is not what was authorised.
 *
 * Verified before writing: the new org (`IUEMOYsvj2XAbiniZQQT`) carries the same name
 * "Segelclub Stäfa", so only the `ok:` token changes and `on:` stays correct.
 */
const R11_INDEX_FIXES = [
  {
    collection: 'memberships', docId: 'kZn8vywT51xeyijAcReK', field: 'index',
    expectContains: 'ok:BCYEdhxc48jzU8RlfPde',
    from: 'ok:BCYEdhxc48jzU8RlfPde', to: 'ok:IUEMOYsvj2XAbiniZQQT',
    why: 'orgKey was repointed to the live scs org; the denormalised index still named the deleted one',
  },
];

/** Key a dangle the same way the allow-list spells it. */
const dangleKey = (childColl, docId, field, parentColl, parentKey) =>
  `${childColl}/${docId}#${field}->${parentColl}/${parentKey}`;
const ACCEPTED_DANGLE_KEYS = new Set(
  R11_ACCEPTED_DANGLES.map(d => `${d.ref}#${d.field}->${d.target}`),
);

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

// ── R-10 flags. The DELETE path has its own flag, deliberately NOT reachable from
// `--write` alone, so no existing or copy-pasted invocation can start deleting.
const R11_RETAG = has('--r11-retag');   // with --write: apply the two R-11 retags
const R10_ANALYSE = has('--r10');            // read-only analysis: partition, cascade, order
const R10_STRIP = has('--r10-strip');        // with --write: strip 'test' from multi-tenant docs
const R10_DELETE = has('--r10-delete');      // with --write: DELETE the test-only documents
const R10_BACKUP = valueOf('backup');        // required for --r10-delete
const CASCADE_ACK = has('--cascade-reviewed'); // required for --r10-delete

const log = (...a) => { if (!JSON_OUT) console.log(...a); };
const rule = (ch = '─') => log(ch.repeat(100));

function refuse(message) {
  console.error(`\nREFUSED: ${message}\n`);
  process.exit(2);
}

if (WRITE && CHECK_ONLY) {
  refuse(
    '--check and --write are mutually exclusive.\n' +
    '--check returns after the drift guard and never reaches the write branch, so the\n' +
    'combination silently performs NO write while looking like it asked for one. Believing\n' +
    'you wrote when you did not is its own failure mode: the next run reports the same\n' +
    'orphans, and the natural conclusion is that the write failed rather than never ran.\n' +
    'Pick one: --check to inspect the guard, --write (with --remove/--strip-tenant-id) to act.',
  );
}
if ((R10_STRIP || R10_DELETE || R11_RETAG) && !WRITE) {
  refuse('--r10-strip / --r10-delete / --r11-retag are write operations and require --write as well.');
}
if (R11_RETAG && (R10_STRIP || R10_DELETE)) {
  refuse(
    '--r11-retag must be run as its own invocation, before --r10-strip / --r10-delete.\n\n' +
    'The census and the delete/strip partition are computed at the START of a run. The retags\n' +
    'MOVE TWO DOCUMENTS OUT OF THE DELETE SET, so a partition computed before them is stale by\n' +
    'exactly the documents the retags were meant to rescue — orgs/p13 and the person would be\n' +
    'deleted anyway, which is the outcome R-11 exists to prevent.\n\n' +
    'Run:  --write --r11-retag        then re-run --r10 and check, then --write --r10-strip --r10-delete',
  );
}
if (R10_DELETE) {
  // The delete is irreversible and destroys 402 documents including person records.
  // Three independent preconditions, each naming something a human had to have done.
  if (!R10_BACKUP) {
    refuse('--r10-delete requires --backup=<path>. Deletion is irreversible; the full contents\n' +
           'of every document to be deleted must be exported and verified first.');
  }
  if (!CASCADE_ACK) {
    refuse('--r10-delete requires --cascade-reviewed.\n' +
           'Deleting a person does not delete their addresses: `addresses` links by\n' +
           'parentKey ("person.<okey>"), a foreign key, NOT by tenants[] — so a child with\n' +
           'another tenant survives its parent and becomes orphaned personal data.\n' +
           'Run with --r10 first, read the CASCADE CHECK, and only then pass this flag.');
  }
  if (!TEST_CONFIRMED) {
    refuse('--r10-delete also requires --i-really-mean-test.');
  }
}
if (WRITE && REMOVE.length === 0 && !STRIP_ONLY && !R10_STRIP && !R10_DELETE && !R11_RETAG) {
  refuse(
    '--write requires either --remove=<id,id,…> or --strip-tenant-id.\n' +
    'There is deliberately no "remove everything the dry run found" flag: the dry run exists\n' +
    'so a human chooses the list, and a bare --write would sweep every orphan — including the\n' +
    'quarantined ones — in a single unreviewed command.',
  );
}
// ── STATIC refusals — decidable without touching Firestore. ─────────────────────────────
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

/**
 * ── DYNAMIC refusals — need the live `app-config` set and the computed orphan set. ──────
 *
 * ⚠️ THIS IS THE GUARD THAT STOPS A ONE-CHARACTER TYPO DESTROYING PRODUCTION. ⚠️
 *
 * The static list above checks only the three hand-maintained exception sets. It does NOT
 * check that the id being removed is actually an orphan — so before this function existed,
 * `--write --remove=scs` was ACCEPTED and would have stripped the live production tenant
 * from every document that carries it, in one command, with no confirmation.
 *
 * That is not a hypothetical: this script's own dry run prints a copy-pasteable
 * `--remove=…` line containing `sc7`, which is one character away from `scs`. Adjacent on
 * the list, adjacent on the keyboard, and the failure is silent and total.
 *
 * Two independent conditions, both required:
 *   1. NOT a live tenant — refuse anything with an `app-config` document. A tenant that
 *      exists is never an orphan, whatever the operator typed.
 *   2. IN the computed orphan set — refuse anything the dry run did not itself derive as
 *      sweepable. This catches ids that are neither live nor orphaned (typos that match
 *      nothing, ids from a stale copy-paste, ids already swept by an earlier run).
 * Condition 2 alone would be enough to stop `scs` today, but condition 1 is stated
 * separately and first because it is the one that must never depend on a derivation being
 * correct — it is checked against the authoritative `app-config` set directly.
 */
function refuseUnsafeRemovals(configIds, sweepable) {
  const live = REMOVE.filter(id => configIds.includes(id));
  if (live.length > 0) {
    refuse(
      `${live.map(id => `"${id}"`).join(', ')} ${live.length === 1 ? 'is a LIVE TENANT' : 'are LIVE TENANTS'} — ` +
      `${live.length === 1 ? 'it has' : 'they have'} an app-config document.\n\n` +
      'Removing a live tenant from tenants[] would detach that tenant from its own data and\n' +
      'is never what normalisation means. If a tenant is genuinely being retired, delete its\n' +
      'app-config document first — deliberately, as its own reviewed step — and only then is\n' +
      'its id an orphan this script will touch.\n\n' +
      `live app-config ids: ${configIds.join(', ')}\n` +
      'Check for a typo: `sc7` and `scs` differ by one character and sit next to each other\n' +
      'in this script\'s own suggested command line.',
    );
  }

  const notOrphaned = REMOVE.filter(id => !sweepable.includes(id) && !QUARANTINED.includes(id));
  if (notOrphaned.length > 0) {
    refuse(
      `${notOrphaned.map(id => `"${id}"`).join(', ')} ${notOrphaned.length === 1 ? 'is' : 'are'} ` +
      'not in the computed orphan set.\n\n' +
      'Only ids this run itself derived as sweepable may be removed — the operator does not\n' +
      'get to name an id the analysis did not produce. An id can miss the set because it is\n' +
      'a typo that matches nothing, because it was already swept by an earlier run, or\n' +
      'because the data changed since the dry run was reviewed. All three mean: re-run the\n' +
      'dry run and read it again.\n\n' +
      `sweepable this run: ${sweepable.join(', ') || '(none)'}`,
    );
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

/**
 * ⚠️ THE CHECK THAT CATCHES A COLLECTION THE MODEL LAYER DESCRIBES *WRONGLY*. ⚠️
 *
 * `liveWithoutModel` (computed in main) subtracts BOTH `scoped` AND `unscoped`, so it can
 * only ever surface a collection the model layer does not describe at all. That is a real
 * but different failure. The failure that ACTUALLY OCCURRED while writing this script was
 * the other one: a narrowed `tenants` member regex moved nineteen collections — `persons`,
 * `orgs`, `users`, `transfers` among them — out of `scoped` and into `unscoped`. From
 * there they are subtracted out of `liveWithoutModel` as well, so the bidirectional
 * reconciliation printed no warning at all: the scan silently fell 63 → 44 collections and
 * 71 426 → 67 909 documents, `transfers` appeared in the "excluded" line as though that
 * were normal, and the exit code did not change. Only a unit test caught it — and a unit
 * test lives next to the regex it guards and is editable in the same breath.
 *
 * So the reconciliation is not enough, and this is the check that actually bites: go to
 * the DATA. Every collection classified as unscoped, and every live collection with no
 * model at all, is probed for a single document carrying a `tenants` array. One hit means
 * the classification is wrong — a tenant-scoped collection is about to be skipped — and
 * the run is REFUSED rather than reported, because a migration that silently skips a
 * collection is exactly the failure mode this whole script exists to avoid.
 *
 * Cost: one `limit(1)` read per suspect — 9 collections on a healthy run, 26 when the
 * derivation is broken (which is when it matters). Negligible next to the 71 k-document
 * census.
 */
/**
 * Return one document in `collection` whose `tenants` field is an ARRAY, or undefined if
 * the collection contains no such document. Exactly one `limit(1)` read.
 *
 * ⚠️ WHY NOT `where('tenants', '!=', null).limit(1)` — IT HAS A PROVEN FALSE NEGATIVE. ⚠️
 *
 * Firestore sorts values of DIFFERENT types by a fixed type order before comparing values
 * within a type. The documented order (identical in the Firebase and Google Cloud tables)
 * is:
 *
 *     Null < Boolean < NaN < Number < Timestamp < String < Bytes < Reference
 *           < GeoPoint < Array < Vector embedding < Map
 *
 * `!= null` is an inequality against a value, not a type constraint, so it SPANS every
 * type above Null. Ordered ascending it therefore returns whichever document holds the
 * LOWEST-TYPED `tenants` value — and one malformed string-valued field outranks every
 * correct array in the collection.
 *
 * That is not hypothetical. On the narrowed-regex run the old probe named 16 collections
 * and MISSED `tags`, which holds 72 genuine `tenants[]` documents, because
 * `tags/all_tenants` carries `tenants` as the STRING "[test, default, scs, …]" and sorts
 * first. The one dead legacy document this task set out to clean up was blinding the guard
 * meant to protect the cleanup. Verified directly:
 *     tags  !=null → all_tenants (string)   >=[] → account_default (array)
 *
 * THE FIX — constrain the TYPE instead of sampling the order. Firestore BOUNDS A RANGE
 * FILTER BY THE TYPE OF ITS OPERAND: a range comparison only ever matches values of the
 * same type as the value compared against. So `where('tenants', '>=', [])` selects
 * EXACTLY the array-typed values — not "arrays and everything above them". Proven on
 * production `tags`, which holds 72 arrays and 1 string:
 *     >= ''  → 1 document  (the String; the 72 arrays are excluded even though Array > String)
 *     >= []  → 72 documents (every array; zero non-arrays)
 *     orderBy asc, no filter → 73 documents, spanning both types
 *
 * Within the array type `[]` is the least value, so `>= []` admits every array including
 * the empty one. Type-bounding is what makes this sound; the ordering merely picks which
 * array comes back first, and any of them answers the question.
 *
 * ⚠️ DO NOT "SIMPLIFY" THIS BACK TO AN ORDER-BASED ARGUMENT. ⚠️ An earlier version of this
 * comment claimed arrays were contiguous with "Map the only type above" and that `>= []`
 * matched `{arrays} ∪ {maps}`. Both are false — Vector embedding sits between Array and
 * Map, and the filter is type-bounded so no map is ever matched. The code was right by
 * accident under that reasoning; someone reasoning from it could weaken this and be wrong.
 *
 * WHAT THIS GUARANTEES: if the collection contains ≥1 array-valued `tenants`, this returns
 * one. NO number of values of any other type — string, number, bytes, geopoint, vector,
 * map — can hide it, because none of them is in the filter's type range at all. That is
 * soundness, not merely a wider sample:
 *   - `.limit(20) + .some(Array.isArray)` still spans all types, so it only raises the
 *     number of malformed documents needed to blind it from 1 to 20;
 *   - a two-ended asc/desc read on `!= null` still spans all types, and the descending end
 *     is claimed by the types ABOVE Array — Vector embedding and Map, not Map alone.
 * (Verified on the emulator: a map alongside real arrays, 50 maps + 1 array, all eight
 * lower types + 1 array, and a vector + array all return the array; maps-only, vector-only
 * and field-absent correctly return nothing.)
 *
 * The `Array.isArray` check below is therefore redundant under the documented semantics.
 * It is kept deliberately: it costs nothing and it makes the function's contract true by
 * inspection rather than by trusting a doc page.
 *
 * WHAT IT DOES NOT GUARANTEE: nothing about HOW MANY such documents exist, nor that a
 * collection returning none is semantically tenant-scoped-but-empty. Those are the census's
 * job, not the probe's — the probe answers exactly one question, "does the data contradict
 * the classification", and answers it soundly.
 */
async function firstArrayValuedTenants(collection) {
  const snap = await db.collection(collection)
    .where('tenants', '>=', [])       // type-bounded: array-typed values ONLY — see above
    .orderBy('tenants', 'asc')        // any array answers the question; this picks the least
    .select('tenants').limit(1).get();
  const doc = snap.docs[0];
  if (!doc) return undefined;
  const tenants = doc.get('tenants');
  return Array.isArray(tenants) ? { id: doc.id, tenants } : undefined;
}

async function refuseOnMisclassifiedCollection(scan, liveWithoutModel, liveCollections) {
  const suspects = [
    ...scan.unscoped
      .filter(u => liveCollections.has(u.collection))
      .map(u => ({ collection: u.collection, why: `classified unscoped: ${u.reason}` })),
    ...liveWithoutModel.map(c => ({ collection: c, why: 'no *Collection constant in shared-models' })),
  ];

  const wrong = [];
  for (const s of suspects) {
    const hit = await firstArrayValuedTenants(s.collection);
    if (hit) wrong.push({ ...s, docId: hit.id, tenants: hit.tenants });
  }

  log(`\n  classification probe: ${suspects.length} excluded/unmodelled collection(s) checked ` +
      `for a stray tenants[] — ${wrong.length === 0 ? 'none found (classification holds)' : `${wrong.length} MISCLASSIFIED`}`);

  if (wrong.length === 0) return;

  console.error('\nREFUSED: a collection classified as NOT tenant-scoped contains documents that ' +
                'carry a tenants[] array.\n');
  for (const w of wrong) {
    console.error(`  ${w.collection}  (${w.why})`);
    console.error(`      e.g. ${w.collection}/${w.docId} → tenants: ${JSON.stringify(w.tenants)}`);
  }
  console.error('\nThe derivation and the data disagree. Either the model is missing a `tenants`');
  console.error('member / a *Collection constant, or scanCollections cannot read the shape it is');
  console.error('written in. Until that is resolved this migration would silently SKIP the');
  console.error('collection(s) above — leaving orphan ids in place while reporting success.\n');
  process.exit(2);
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

  await refuseOnMisclassifiedCollection(scan, liveWithoutModel, liveCollections);

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
    log(`  ${noArrayCount} document(s) in a tenant-scoped collection have NO tenants ARRAY ` +
        `(${Object.entries(noArrayWhere).map(([c, n]) => `${c}:${n}`).join(', ')}) — ` +
        'invisible to every tenant-scoped query, skipped here. Both are identified:');
    log('      tags/all_tenants — `tenants` is a STRING, not an array ("[test, default, scs, …]"),');
    log('        with tagModel: \'\'. Documented in the `tag-model` skill: zero code references,');
    log('        safe to delete. Not a defect this script needs to route around.');
    log('      ownerships/izeqYTgIIfJnKa5NtIkK — an EMPTY document (zero fields). Genuinely');
    log('        ⚠️  UNEXPLAINED; most likely a Firestore "missing document" left behind as the');
    log('        parent of a subcollection, or a partial write. Flagged, not swept, not guessed.');
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

  /**
   * How many documents would be left with an EMPTY `tenants[]` — i.e. permanently
   * unreachable by any tenant-scoped query — if `ids` were removed.
   *
   * Computed for ANY id set, not just the sweepable one. That distinction is the whole
   * point: "detached" and "unreachable" are different numbers, and the second is the one
   * that should drive an irreversible decision. A document losing one of several tenants
   * survives; a document losing its only tenant is gone from the application even though
   * the row is still there. Reporting only the first understates a quarantined id's true
   * cost by an order of magnitude — `test` detaches 2 307 documents but strands a much
   * smaller, much more consequential subset, including person records.
   */
  const emptiesFor = (ids) => {
    const idSet = new Set(ids);
    const byCollection = {};
    const docIds = {};
    let totalEmpties = 0;
    for (const c of present) {
      let n = 0;
      for (const d of docsByCollection[c]) {
        if (d.tenants.length === 0) continue;               // already empty — not caused by us
        if (!d.tenants.some(t => idSet.has(t))) continue;    // untouched
        if (d.tenants.some(t => !idSet.has(t))) continue;    // a tenant survives
        n++;
        (docIds[c] ??= []).push(d.id);
      }
      if (n > 0) { byCollection[c] = n; totalEmpties += n; }
    }
    return { byCollection, docIds, total: totalEmpties };
  };

  const printEmpties = (label, e, indent = '      ') => {
    log(`${indent}${label}: ${e.total} document(s) left with an EMPTY tenants[]`);
    Object.entries(e.byCollection)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .forEach(([c, n]) => log(`${indent}  ${c.padEnd(22)} ${String(n).padStart(6)}`));
  };

  const sweepable = drift.unknown.map(u => u.tenantId).filter(id => !QUARANTINED.includes(id));

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

    // ── THE NUMBER THAT SHOULD ACTUALLY DRIVE THE RULING ──────────────────────────────
    // "2 307 documents detached" is the headline, but most of those documents have another
    // tenant and survive. The documents that do NOT are the irreversible part, and they
    // were previously invisible here because the empties calculation ran only over the
    // sweepable set — which excludes quarantined ids by construction.
    const eAlone = emptiesFor([id]);
    log('');
    log(`  ⚠️⚠️  REMOVING "${id}" ALONE WOULD PERMANENTLY STRAND ${eAlone.total} DOCUMENT(S):`);
    printEmpties(`${id} only`, eAlone);
    const persons = eAlone.byCollection['persons'] ?? 0;
    if (persons > 0) {
      log(`  ⚠️⚠️  ${persons} of those are PERSON records — personal data that would become`);
      log('        unreachable through the application while remaining stored. That is a privacy');
      log('        question (revDSG retention/erasure), not just a data-hygiene one.');
    }
    const eBoth = emptiesFor([...sweepable, id]);
    log(`  Combined with the ${sweepable.length} sweepable orphan(s): ${eBoth.total} document(s) stranded in total.`);
    log('  DO NOT include it in --remove without --i-really-mean-test and an explicit owner say-so.');
  }

  // ── 2.1 orphan removal plan ──────────────────────────────────────────────────────────
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
    const e = emptiesFor(sweepable);
    log('\n  ⚠️  Documents left with an EMPTY tenants[] become invisible to every tenant-scoped');
    log('      query (getSystemQuery issues `tenants array-contains <id>`). They are NOT deleted');
    log('      by this script — deletion is a separate decision — but they will be unreachable.');
    // Naming the menuItems docs specifically: a zero-tenant menu document is worse than
    // merely unreachable. `indexMenuDocsByName` groups live docs by their `name` FIELD and
    // `resolveCandidates` then picks among them; a stranded doc under a GENERIC name stays
    // a candidate for every future tenant seed (rung 3 skips it — no tenant claims it — but
    // rung 4 prefers `id === name`, which is exactly what a generic leftover looks like).
    // So it can win the tie-break and be extended by applyFeatureSelection later.
    for (const c of ['menuItems']) {
      if (!e.docIds[c]) continue;
      log(`\n  ⚠️  RECOMMEND DELETING rather than emptying these ${c} doc(s): ${e.docIds[c].join(', ')}`);
      log('      A zero-tenant menu doc is not inert: indexMenuDocsByName indexes by the `name`');
      log('      FIELD, and resolveCandidates\' rung 4 PREFERS the doc whose id equals its name —');
      log('      precisely the shape a generic leftover has. It can therefore be selected and');
      log('      extended by a later applyFeatureSelection run for an unrelated tenant.');
    }
  }

  // ── what the guard will say AFTER the sanctioned sweep ────────────────────────────────
  const remainingAfterSweep = drift.unknown
    .map(u => u.tenantId)
    .filter(id => !sweepable.includes(id));
  log('\n  AFTER a --remove of the sweepable set, the drift guard will still report: ' +
      `${remainingAfterSweep.join(', ') || '(nothing — it would go green)'}`);
  if (remainingAfterSweep.length) {
    log('  i.e. --check STILL EXITS 3 after a fully successful sweep, because ' +
        `${remainingAfterSweep.join(', ')} ${remainingAfterSweep.length === 1 ? 'remains' : 'remain'}`);
    log('  quarantined and unresolved. A persistent red here is NOT a failed sweep — the guard');
    log('  goes green only once the quarantined id(s) are ruled on, one way or the other.');
  }

  // ── R-10 ─────────────────────────────────────────────────────────────────────────────
  let r10 = null;
  if (R10_ANALYSE || R10_STRIP || R10_DELETE) {
    r10 = await runR10({ present, docsByCollection, sweepable, footprint, emptiesFor, configIds });
  } else {
    log('\n  (R-10 analysis not run — pass --r10 for the test delete/strip partition, the');
    log('   cascade check and the order interaction with the orphan sweep.)');
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
    log('  ⚠️  That line contains `sc7`, one character from the live tenant `scs`. A live tenant');
    log('      id is refused outright, as is any id not in the sweepable set above — but read it.');
    log('  Step 2.2 is NOT written by this script — see its section above.');
    log('  Required order: strip → sweep → DRY RUN AGAIN → applyFeatureSelection → backfill.');
  } else {
    // Both refusals need live data: `configIds` is authoritative, `sweepable` is derived.
    // Checked here — after the census, before the first write — so no write path exists
    // that has not passed them.
    refuseUnsafeRemovals(configIds, sweepable);
    if (R11_RETAG) await applyR11Retags();
    if (R10_STRIP || R10_DELETE) {
      // Last line of defence: refuse on anything the read-only analysis flagged. The
      // operator's flags say "I have reviewed this"; these checks verify the thing they
      // claim to have reviewed is still true of the data in front of us right now.
      if (r10.mismatches.length) {
        refuse('the R-10 reconciliation does not match the reviewed figures:\n  ' +
               r10.mismatches.join('\n  ') + '\nThe data moved. Re-run the dry run and have it reviewed again.');
      }
      if (R10_DELETE && r10.cascade.stops.length > 0) {
        refuse('the CASCADE CHECK found blocking conditions:\n  - ' + r10.cascade.stops.join('\n  - ') +
               '\nSee the CASCADE CHECK above. These need an owner ruling, not a flag. ' +
               '--cascade-reviewed\nacknowledges that you READ the check; it does not override a STOP.');
      }
      if (R10_DELETE && r10.backup.verified !== r10.part.delCount) {
        refuse(`backup holds ${r10.backup.verified} document(s) but the delete set is ${r10.part.delCount}. ` +
               'Refusing to delete what is not backed up.');
      }
      await applyR10Writes(r10.part);
    }
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

// ═════════════════════════════════════════════════════════════════════════════════════════
// R-10 — partition, order interaction, cascade, backup.
// ═════════════════════════════════════════════════════════════════════════════════════════

/**
 * The R-10 pipeline, in the order the owner asked for: partition → reconcile → order
 * interaction → cascade → backup. Every stage is READ-ONLY. Nothing here writes; the write
 * decision is taken by the caller, and only after this has returned a clean bill.
 */
async function runR10({ present, docsByCollection, sweepable, footprint, emptiesFor, configIds }) {
  const part = partitionR10(present, docsByCollection);

  log('\n' + '='.repeat(100));
  log(`R-10 (${R10.date}) — "${R10.tenant}" DELETE / STRIP PARTITION`);
  log('='.repeat(100));
  log('  Ruling, verbatim:');
  log('    "delete all firestore documents that have \'test\' as the only tenant [\'test\'].');
  log('     firestore documents that have \'test\' and some other tenantIds (e.g. [\'scs\',\'test\']),');
  log('     must be kept, but the tenantId \'test\' removed from the tenants field [\'scs\']."');
  log('');
  log('  collection                DELETE (tenants===[test])   STRIP (test + others)');
  rule();
  const colls = [...new Set([...Object.keys(part.del), ...Object.keys(part.strip)])].sort();
  for (const c of colls) {
    log(`  ${c.padEnd(24)} ${String((part.del[c] ?? []).length).padStart(12)}   ` +
        `${String((part.strip[c] ?? []).length).padStart(21)}`);
  }
  rule();
  log(`  ${'TOTAL'.padEnd(24)} ${String(part.delCount).padStart(12)}   ${String(part.stripCount).padStart(21)}`);

  // ── RECONCILIATION — a moved number means the data moved underneath us ───────────────
  const fpTotal = footprint(R10.tenant).reduce((n, x) => n + x.docs, 0);
  // emptiesFor() knows nothing about R-11, so subtract the retagged-out documents to compare
  // like with like. Both retag targets are test-ONLY today, hence they land in the delete
  // side of that figure.
  const expectedDelete = emptiesFor([R10.tenant]).total - part.retaggedOut.length;
  const expectedStrip = fpTotal - part.retaggedOut.length - expectedDelete;
  log(`\n  R-11 retagged OUT of the delete set (${part.retaggedOut.length}): ${part.retaggedOut.join(', ') || '(none)'}`);
  log('\n  RECONCILIATION against the previously reported figures');
  rule();
  log(`    documents carrying "test"      : ${fpTotal}`);
  log(`    delete set (test-only, R-11 adj): ${part.delCount}   (internal cross-check: ${expectedDelete})`);
  log(`    strip set  (test + others)     : ${part.stripCount}   (internal cross-check: ${expectedStrip})`);
  const mismatches = [];
  if (part.delCount !== expectedDelete) mismatches.push(`delete set ${part.delCount} != emptiesFor([test]) ${expectedDelete}`);
  if (part.stripCount !== expectedStrip) mismatches.push(`strip set ${part.stripCount} != ${expectedStrip}`);
  if (part.delCount + part.stripCount + part.retaggedOut.length !== fpTotal) mismatches.push(`delete+strip+retagged ${part.delCount + part.stripCount + part.retaggedOut.length} != footprint ${fpTotal}`);
  /**
   * Two baselines, because applying the R-11 retags legitimately moves the numbers.
   *
   * PRE-RETAG  2307 carrying test / 400 delete / 1905 strip
   * POST-RETAG 2303 carrying test / 398 delete / 1905 strip
   *
   * The −4 is fully accounted for and is a consequence of OUR OWN authorised write, not of
   * anything moving underneath us:
   *   −2  the retagged entities themselves (orgs/p13, persons/WeJRI923rpCaEEOj5kLr) stop
   *       carrying `test` — that is the point of the retag;
   *   −2  their `address-directory` PROJECTIONS, rewritten by the replication Cloud Function
   *       seconds later (verified: address-directory/test_org.p13 and
   *       test_person.WeJRI923rpCaEEOj5kLr deleted, p13_org.p13 ['p13'] and
   *       scs_person.WeJRI923rpCaEEOj5kLr ['scs'] created at 09:48:51/09:48:52 — the only two
   *       documents written to that collection in sixteen hours).
   * The projections correctly follow their parents out of the delete set; deleting them
   * would have been wrong.
   *
   * The expectation is RE-BASELINED rather than the check relaxed: a run matching neither
   * baseline still fails. `retaggedOut` distinguishes them — it is 2 before the retag write
   * and 0 after, because the retagged documents no longer carry `test` at all.
   */
  // A THIRD baseline for the completed state. Without it, every run after R-10 succeeds
  // reports "THE DATA MOVED" forever — a guard that is permanently red teaches people to
  // ignore it, which is worse than not having it. Zero is the intended terminal state.
  const retagApplied = part.retaggedOut.length === 0;
  const baseline = (fpTotal === 0 && part.delCount === 0 && part.stripCount === 0)
    ? { label: 'R-10 COMPLETE (test fully removed)', carrying: 0, del: 0, strip: 0 }
    : retagApplied
      ? { label: 'POST-retag', carrying: 2303, del: 398, strip: 1905 }
      : { label: 'PRE-retag',  carrying: 2307, del: 400, strip: 1905 };
  log(`    baseline in force              : ${baseline.label} ` +
      `(${baseline.carrying} carrying / ${baseline.del} delete / ${baseline.strip} strip)`);
  if (fpTotal !== baseline.carrying || part.delCount !== baseline.del || part.stripCount !== baseline.strip) {
    mismatches.push(`figures differ from the ${baseline.label} expectation ` +
      `(${baseline.carrying} carrying test / ${baseline.del} delete / ${baseline.strip} strip) — THE DATA MOVED`);
  }
  if (mismatches.length) {
    log('    ⚠️  ' + mismatches.join('\n    ⚠️  '));
    log('    A number that moved means the database changed since the reviewed dry run.');
  } else {
    log(`    ✓ internally consistent AND identical to the ${baseline.label} expectation.`);
  }

  const order = reportOrderInteraction(present, docsByCollection, sweepable);
  const cascade = await reportCascade(part.del, configIds);
  reportUncheckedParents(part.del);

  let backup = null;
  if (R10_BACKUP) {
    backup = await exportBackup(part.del, path.resolve(ROOT, R10_BACKUP));
    log('\n  BACKUP EXPORT');
    rule();
    log(`    file            : ${backup.path}`);
    log(`    documents written: ${backup.written}`);
    log(`    read back & count: ${backup.verified}  ${backup.verified === part.delCount ? '✓ matches the delete set' : '⚠️ MISMATCH'}`);
  }

  return { part, order, cascade, backup, mismatches };
}

/**
 * A batched writer whose NOT_FOUND handling covers EVERY commit, not just the last one.
 *
 * ⚠️ THIS EXISTS BECAUSE WRAPPING ONLY THE FINAL FLUSH IS A TRAP. ⚠️
 * The first version caught NOT_FOUND around the closing `flush()` only. Any INTERMEDIATE
 * flush — one triggered by crossing BATCH_SIZE mid-run — escaped as a raw stack trace and
 * exit 1. At 247 ops that was latent (a single batch, so the only flush was the last one).
 * R-10 is ~1 905 strips plus ~402 deletes: intermediate flushes are guaranteed, and a
 * concurrently deleted document is exactly the case `update()`-over-`set(merge)` exists to
 * handle. A mid-run raw crash on a DESTRUCTIVE, IRREVERSIBLE pass is the worst available
 * failure mode: an unknown number of batches already committed, and no read-back.
 *
 * So the handling lives inside `flush` itself, and every code path that commits goes
 * through it. `committed` is reported on failure so the operator knows how far it got.
 */
function makeBatcher(label) {
  let batch = db.batch();
  let ops = 0;
  let committed = 0;

  const flush = async () => {
    if (ops === 0) return;
    const n = ops;
    try {
      await batch.commit();
    } catch (e) {
      const notFound = String(e?.code) === '5' || /NOT_FOUND|No document to update/i.test(String(e?.message));
      if (notFound) {
        refuse(
          `${label}: a document in this batch no longer exists — it was deleted after the census.\n\n` +
          `Firestore said: ${e.message}\n\n` +
          `NOTHING in this batch of ${n} operation(s) was written (batches are atomic), but ` +
          `${committed} operation(s)\nin EARLIER batches were already committed. This is the ` +
          'intended behaviour: the alternative,\nset(merge), would have RESURRECTED the deleted ' +
          'document.\n\nRe-run — every operation here is idempotent, and the fresh census will ' +
          'not include the\ndeleted document. Then verify by read-back.',
        );
      }
      throw e;
    }
    committed += n;
    batch = db.batch();
    ops = 0;
  };

  return {
    /** `fn` receives the batch; queue one operation. Flushes automatically at BATCH_SIZE. */
    add: async (fn) => { fn(batch); if (++ops >= BATCH_SIZE) await flush(); },
    flush,
    get committed() { return committed; },
  };
}

/** Split every document carrying `test` into the ruling's two dispositions. */
function partitionR10(present, docsByCollection) {
  const del = {};    // collection -> [docId]        tenants === ['test']
  const strip = {};  // collection -> [docId]        tenants ⊇ {test}, |tenants| > 1
  const retaggedOut = [];
  // R-11 ruled these are NOT test data — the tag is the defect. They leave the delete set
  // BY RULING, so the partition must reflect that whether or not `--r11-retag` has been
  // applied yet. Otherwise the dry run the owner reviews and the backup taken from it would
  // both still contain the two documents R-11 exists to rescue.
  const retagIds = new Set(R11_RETAGS.map(r => `${r.collection}/${r.docId}`));

  for (const c of present) {
    for (const d of docsByCollection[c]) {
      if (!d.tenants.includes(R10.tenant)) continue;
      if (retagIds.has(`${c}/${d.id}`)) { retaggedOut.push(`${c}/${d.id}`); continue; }
      // A set, so a hypothetical ['test','test'] still counts as test-only rather than
      // silently taking the strip path and leaving a duplicate behind.
      const distinct = new Set(d.tenants);
      if (distinct.size === 1) (del[c] ??= []).push(d.id);
      else (strip[c] ??= []).push(d.id);
    }
  }
  const count = (m) => Object.values(m).reduce((n, a) => n + a.length, 0);
  return { del, strip, retaggedOut, delCount: count(del), stripCount: count(strip) };
}

/**
 * ⚠️ THE ORDER OF R-10 AND THE ORPHAN SWEEP CHANGES WHICH DOCUMENTS DIE. ⚠️
 *
 * A document reading `['sc7','test']` today is NOT test-only, so R-10 strips `test` and
 * leaves `['sc7']` — which the 11-id orphan sweep then empties. Run the orphan sweep FIRST
 * and the same document reads `['test']`, which R-10 then DELETES. Same two operations,
 * same ruling, opposite outcome for the document.
 *
 * This is not something to let fall out of an implementation detail. R-10 is evaluated
 * against TODAY's data, as the owner wrote it, and the affected documents are reported
 * here as their own line so the owner can rule on the residue explicitly.
 */
function reportOrderInteraction(present, docsByCollection, sweepable) {
  const affected = {};
  for (const c of present) {
    for (const d of docsByCollection[c]) {
      if (!d.tenants.includes(R10.tenant)) continue;
      const others = d.tenants.filter(t => t !== R10.tenant);
      if (others.length === 0) continue;                        // already test-only
      if (others.some(t => !sweepable.includes(t))) continue;    // a real tenant survives
      (affected[c] ??= []).push({ id: d.id, tenants: d.tenants });
    }
  }
  const total = Object.values(affected).reduce((n, a) => n + a.length, 0);

  log('\n' + '='.repeat(100));
  log('R-10 × ORPHAN SWEEP — ORDER INTERACTION (report only; nothing is folded in silently)');
  log('='.repeat(100));
  if (total === 0) {
    log('  No document carries `test` together with ONLY sweepable-orphan ids. The two');
    log('  operations are independent on today\'s data and the order does not matter.');
    return { total, affected };
  }
  log(`  ${total} document(s) carry \`test\` plus ONLY sweepable-orphan ids and nothing else.`);
  log('  For these, the order of operations decides their fate:');
  log(`    R-10 first (WHAT THIS SCRIPT DOES): not test-only today → 'test' stripped, document KEPT,`);
  log('      then the orphan sweep empties its tenants[] → survives as an unreachable document.');
  log('    Orphan sweep first: becomes [\'test\'] → R-10 would DELETE it.');
  Object.entries(affected).sort().forEach(([c, list]) => {
    log(`      ${c.padEnd(22)} ${String(list.length).padStart(5)}   e.g. ${list.slice(0, 3).map(x => `${x.id}[${x.tenants.join(',')}]`).join(', ')}`);
  });
  log('  ⚠️  RESIDUE FOR THE OWNER: applying R-10 as written leaves these alive but tenant-less.');
  log('      They are NOT deleted by this script. Ruling needed on whether they should be.');
  return { total, affected };
}

/**
 * ⚠️ THE CASCADE CHECK — run BEFORE any delete, and it can stop the whole operation. ⚠️
 *
 * Deleting a person document does NOT remove that person's data. This repo deliberately
 * keeps sensitive personal data OUT of the person record: `addresses` is a flat top-level
 * collection linked by `parentKey: 'person.<okey>'`, holding email, phone, postal address,
 * IBAN and the sensitive `ssn`/`dob` channels. That link is a FOREIGN KEY, not a
 * `tenants[]` relationship — so a child document with its own, different tenant is NOT
 * touched by R-10 and SURVIVES its parent.
 *
 * The result would be orphaned personal data with no person record to reach it: invisible
 * to the app, unreachable by the erasure pipeline (which walks from the person), and still
 * stored. That is a revDSG retention problem, not untidiness — and "delete the person,
 * keep their address vault" is not a coherent outcome and is not what R-10 asks for.
 *
 * So this is a STOP condition, not a warning: if any person in the delete set has a
 * surviving PII child, the delete does not proceed without a further owner ruling.
 */
/**
 * Every foreign key that points INTO a collection with documents in the delete set.
 *
 * `carriesPersonIdentity` marks children that DENORMALISE a person's name/gender onto
 * themselves. That flag is the difference between a broken link and a privacy problem:
 * `memberships` deliberately copies `memberName1`/`memberName2`/`memberType` ("we
 * deliberately do not use a nested object here to simplify queries" — membership.model.ts),
 * so a surviving membership still SAYS "Jan Paulich, male" long after the person record is
 * gone. Restricting the PII notion to the `addresses` vault would have missed exactly that.
 */
const CASCADE_EDGES = [
  // child collection      field           parent        key builder             label                                   personIdentity
  ['addresses',          'parentKey',      'persons',    k => `person.${k}`, 'PII VAULT — email/phone/postal/IBAN/ssn/dob', true],
  ['address-directory',  'parentKey',      'persons',    k => `person.${k}`, 'PII projection',                             true],
  ['users',              'personKey',      'persons',    k => k,             'login account',                              true],
  ['memberships',        'memberKey',      'persons',    k => k,             'membership (denormalises member name+gender)', true],
  ['ownerships',         'ownerKey',       'persons',    k => k,             'ownership (denormalises owner name)',        true],
  ['personal-rels',      'subjectKey',     'persons',    k => k,             'personal relation (subject)',                true],
  ['personal-rels',      'objectKey',      'persons',    k => k,             'personal relation (object)',                 true],
  ['workrels',           'subjectKey',     'persons',    k => k,             'work relation (subject)',                    true],
  ['workrels',           'objectKey',      'persons',    k => k,             'work relation (object)',                     true],
  ['comments',           'authorKey',      'persons',    k => k,             'authored comment',                           true],
  ['comments',           'parentKey',      'persons',    k => `person.${k}`, 'comment on the person',                      true],
  ['docs',               'authorKey',      'persons',    k => k,             'authored document',                          true],
  ['addresses',          'parentKey',      'orgs',       k => `org.${k}`,    'org addresses (PII)',                        false],
  ['address-directory',  'parentKey',      'orgs',       k => `org.${k}`,    'org address projection',                     false],
  ['memberships',        'orgKey',         'orgs',       k => k,             'membership in this org',                     false],
  ['ownerships',         'resourceKey',    'resources',  k => k,             'ownership of this resource',                 false],
  ['reservations',       'resourceKey',    'resources',  k => k,             'reservation of this resource',               false],
];

/**
 * ⚠️ THE CASCADE CHECK — run BEFORE any delete, and it can stop the whole operation. ⚠️
 *
 * Deleting a document does not delete what points AT it. Those links are FOREIGN KEYS, not
 * `tenants[]` relationships, so R-10 does not touch a child that carries a different
 * tenant — the child simply outlives its parent. Two distinct harms result, and both are
 * stop conditions:
 *
 *  1. ORPHANED PERSONAL DATA. A surviving child that denormalises a deleted person's
 *     identity keeps that personal data alive under ANOTHER tenant, invisible to the app
 *     and unreachable by the erasure pipeline (which walks from the person record). That is
 *     a revDSG retention problem, not untidiness.
 *  2. A LIVE TENANT LEFT WITH A DANGLING REFERENCE. A surviving child whose remaining
 *     tenants include a real, live tenant now points at a document that no longer exists.
 *     R-10 is a cleanup of a dead test tenant; breaking `p13` or `scs` is not something it
 *     asks for and not something to discover afterwards.
 *
 * Neither is a warning. If either fires the delete does not proceed without a further
 * owner ruling.
 */
async function reportCascade(del, configIds) {
  const delSets = Object.fromEntries(Object.entries(del).map(([c, ids]) => [c, new Set(ids)]));
  const parentsOf = (coll) => del[coll] ?? [];

  log('\n' + '!'.repeat(100));
  log(`!! CASCADE CHECK — what references the ${(del['persons'] ?? []).length} person(s) and the other ` +
      'documents about to be deleted');
  log('!'.repeat(100));

  const surviving = [];
  let alsoDeleted = 0;
  let probes = 0;

  for (const [childColl, field, parentColl, mk, label, personIdentity] of CASCADE_EDGES) {
    for (const pk of parentsOf(parentColl)) {
      probes++;
      const snap = await db.collection(childColl).where(field, '==', mk(pk)).get();
      for (const d of snap.docs) {
        if (delSets[childColl]?.has(d.id)) { alsoDeleted++; continue; }
        const x = d.data();
        const t = Array.isArray(x.tenants) ? x.tenants : [];
        const after = t.filter(v => v !== R10.tenant);          // tenants after the R-10 strip
        surviving.push({
          childColl, field, parentColl, parentKey: pk, docId: d.id, label, personIdentity,
          tenants: t, after,
          liveTenants: after.filter(v => configIds.includes(v)),
          who: [x.memberName1, x.memberName2].filter(Boolean).join(' ') ||
               [x.ownerName1, x.ownerName2].filter(Boolean).join(' ') || '',
        });
      }
    }
  }

  log(`  ${CASCADE_EDGES.length} edge type(s), ${probes} FK probe(s)`);
  log(`  children that are ALSO in the delete set (die with the parent, fine) : ${alsoDeleted}`);
  log(`  children that SURVIVE their deleted parent                           : ${surviving.length}`);

  const orphanedPII = surviving.filter(r => r.personIdentity && r.parentColl === 'persons');
  const allLiveDangling = surviving.filter(r => r.liveTenants.length > 0);
  // R-11 accepted exactly two (referencing doc, field, target doc) triples — never a
  // category. Anything not matching one of them still blocks.
  const isAccepted = (r) => ACCEPTED_DANGLE_KEYS.has(
    dangleKey(r.childColl, r.docId, r.field, r.parentColl, r.parentKey));
  const acceptedDangles = allLiveDangling.filter(isAccepted);
  const liveDangling = allLiveDangling.filter(r => !isAccepted(r));

  if (surviving.length > 0) {
    log('\n  SURVIVING CHILDREN (tenants shown as they will read AFTER the R-10 strip):');
    const by = {};
    surviving.forEach(r => { (by[`${r.parentColl} → ${r.childColl}.${r.field}`] ??= []).push(r); });
    for (const [k, rows] of Object.entries(by).sort()) {
      log(`    ${k}  — ${rows.length}`);
      rows.slice(0, 15).forEach(r => log(
        `        ${r.docId}  [${r.tenants.join(',')}] → [${r.after.join(',') || '(empty)'}]` +
        `${r.who ? `  "${r.who}"` : ''}  →missing ${r.parentColl}/${r.parentKey}`));
      if (rows.length > 15) log(`        … and ${rows.length - 15} more`);
    }
  }

  const stops = [];
  if (orphanedPII.length > 0) {
    stops.push(`${orphanedPII.length} document(s) carrying a DELETED PERSON's identity survive`);
    log('\n' + '⚠'.repeat(50));
    log('  STOP 1 — ORPHANED PERSONAL DATA');
    log(`  ${orphanedPII.length} surviving document(s) denormalise the identity of a person in the`);
    log('  delete set. After R-10 the person record is gone but the name/gender remains, under a');
    log('  DIFFERENT tenant, unreachable by the erasure pipeline (which walks from the person).');
    orphanedPII.forEach(r => log(`      ${r.childColl}/${r.docId}  "${r.who}"  → [${r.after.join(',')}]  (${r.label})`));
    log('  revDSG retention problem. R-10 does not speak to it. Needs the owner\'s ruling.');
    log('⚠'.repeat(50));
  }
  if (liveDangling.length > 0) {
    stops.push(`${liveDangling.length} document(s) of LIVE tenants would point at a deleted document`);
    log('\n' + '⚠'.repeat(50));
    log('  STOP 2 — LIVE TENANTS LEFT WITH DANGLING REFERENCES');
    const byTenant = {};
    liveDangling.forEach(r => r.liveTenants.forEach(t => { (byTenant[t] ??= []).push(r); }));
    for (const [t, rows] of Object.entries(byTenant).sort()) {
      log(`      tenant "${t}": ${rows.length} document(s) would reference a deleted parent`);
      const byEdge = {};
      rows.forEach(r => { (byEdge[`${r.childColl}.${r.field} → ${r.parentColl}`] ??= []).push(r); });
      Object.entries(byEdge).sort().forEach(([e, rs]) => log(`         ${e}: ${rs.length}`));
    }
    log('  These are LIVE, in-use tenants. R-10 is a cleanup of a dead test tenant; it does not');
    log('  ask for this and it must not be discovered after the fact. Needs the owner\'s ruling.');
    log('⚠'.repeat(50));
  }
  {
    log('\n  ACCEPTED DANGLING REFERENCES (R-11, 2026-08-06) — ruled on individually, not waived');
    rule();
    if (acceptedDangles.length === 0) {
      log(`    none matched this run — all ${R11_ACCEPTED_DANGLES.length} allow-list entr(y/ies) are INERT.`);
      log('    An allow-list that matches nothing is not a failure, but it IS a claim that has');
      log('    stopped being true and must not be left unexamined: it means the dangle the owner');
      log('    accepted no longer occurs. Verify WHY before treating the list as dead weight.');
    }
    acceptedDangles.forEach(r => {
      const spec = R11_ACCEPTED_DANGLES.find(d => `${d.ref}#${d.field}->${d.target}` ===
        dangleKey(r.childColl, r.docId, r.field, r.parentColl, r.parentKey));
      log(`    ${r.childColl}/${r.docId}.${r.field} → ${r.parentColl}/${r.parentKey}  [${r.after.join(',')}]`);
      log(`      ${spec?.ruling}: ${spec?.why}`);
    });
    const unused = R11_ACCEPTED_DANGLES.filter(d => !acceptedDangles.some(r =>
      `${d.ref}#${d.field}->${d.target}` === dangleKey(r.childColl, r.docId, r.field, r.parentColl, r.parentKey)));
    if (unused.length) {
      log(`    NOTE: ${unused.length} allow-list entr(y/ies) did not match anything this run:`);
      unused.forEach(d => log(`      ${d.ref}#${d.field} -> ${d.target}  (stale? already resolved?)`));
    }
  }
  if (stops.length === 0) {
    log('\n  ✓ No surviving child carries a deleted person\'s identity, and every remaining');
    log('    live-tenant dangle is one the owner ruled on individually (R-11). Safe on both counts.');
  }

  return { surviving, alsoDeleted, orphanedPII, liveDangling, acceptedDangles, stops };
}

/** Parent collections in the delete set that no edge in CASCADE_EDGES covers. */
function reportUncheckedParents(del) {
  const covered = new Set(CASCADE_EDGES.map(e => e[2]));
  const uncovered = Object.keys(del).filter(c => !covered.has(c)).sort();
  log('\n  PARENT COLLECTIONS IN THE DELETE SET WITH NO FK EDGE MODELLED HERE');
  rule();
  log(`    ${uncovered.join(', ') || '(none)'}`);
  log('    These are checked for tenant scope but NOT for inbound foreign keys. Most are leaf');
  log('    or self-contained (comments, invitations, tags, tasks, calevents, locations,');
  log('    calendars, docs, sections, menuItems, personal-rels). `pages`/`sections` reference');
  log('    each other by key within the CMS; both are in the delete set together (12 pages,');
  log('    13 sections), so a cross-tenant dangle there is possible in principle — reported as');
  log('    a known gap rather than silently claimed clean.');
}

/**
 * Apply the R-11 retags. These are the PRECONDITION for R-10, not part of it: they move two
 * documents OUT of the delete set by correcting a tag that was wrong, which is why they run
 * first and why the analysis must be re-run afterwards rather than reused.
 *
 * `set(..., {merge:true})` is deliberately NOT used (see makeBatcher); `update` fails if the
 * document has gone. Each retag is verified by read-back immediately, because everything
 * downstream depends on these two having landed.
 */
async function applyR11Retags() {
  log('\n' + '='.repeat(100));
  log('R-11 — RETAGS (precondition for R-10)');
  log('='.repeat(100));
  const b = makeBatcher('R-11 retag');
  for (const r of R11_RETAGS) {
    await b.add(w => w.update(db.collection(r.collection).doc(r.docId), { tenants: r.tenants }));
    log(`  ${r.collection}/${r.docId} → [${r.tenants.join(',')}]`);
    log(`      ${r.why}`);
  }
  await b.flush();
  log(`  committed: ${b.committed} operation(s)`);

  // Same invocation as the retags: both are corrections to the mis-tagging/repointing that
  // R-11 resolves, and neither belongs in the strip or delete passes.
  if (R11_INDEX_FIXES.length) {
    log('\n  STALE INDEX REPAIR');
    const ib = makeBatcher('R-11 index repair');
    for (const f of R11_INDEX_FIXES) {
      const snap = await db.collection(f.collection).doc(f.docId).get();
      if (!snap.exists) refuse(`${f.collection}/${f.docId} does not exist — cannot repair its index.`);
      const cur = String(snap.get(f.field) ?? '');
      if (!cur.includes(f.expectContains)) {
        log(`    ${f.collection}/${f.docId}: already repaired or changed underneath us — SKIPPED`);
        log(`      current ${f.field}: ${JSON.stringify(cur)}`);
        continue;
      }
      const next = cur.split(f.from).join(f.to);
      await ib.add(w => w.update(db.collection(f.collection).doc(f.docId), { [f.field]: next }));
      log(`    ${f.collection}/${f.docId}.${f.field}`);
      log(`      ${f.why}`);
      log(`      before: ${JSON.stringify(cur)}`);
      log(`      after : ${JSON.stringify(next)}`);
    }
    await ib.flush();
    log(`    committed: ${ib.committed} operation(s)`);
  }

  log('\n  READ-BACK:');
  let ok = true;
  for (const f of R11_INDEX_FIXES) {
    const d = await db.collection(f.collection).doc(f.docId).get();
    const v = String(d.get(f.field) ?? '');
    const good = v.includes(f.to) && !v.includes(f.from);
    if (!good) ok = false;
    log(`    ${f.collection}/${f.docId}.${f.field} = ${JSON.stringify(v)}  ${good ? '✓' : '⚠️ MISMATCH'}`);
  }
  for (const r of R11_RETAGS) {
    const d = await db.collection(r.collection).doc(r.docId).get();
    const got = d.get('tenants');
    const good = Array.isArray(got) && got.length === r.tenants.length &&
                 r.tenants.every((t, i) => got[i] === t);
    if (!good) ok = false;
    log(`    ${r.collection}/${r.docId} reads [${(got ?? []).join(',')}]  ${good ? '✓' : '⚠️ MISMATCH'}`);
  }
  if (!ok) refuse('an R-11 retag did not read back as expected. Nothing further will run.');
  return true;
}

/**
 * Apply R-10. STRIP first, then DELETE — deliberately, not arbitrarily.
 *
 * The strip path is reversible in practice (the id can be added back); the delete path is
 * not. Doing the reversible half first means that if anything fails midway, the failure
 * happens before the irreversible half rather than after it. The two sets are disjoint by
 * construction (a document is either test-only or it is not), so neither pass can affect
 * the other's membership and the order cannot change the outcome — only the blast radius
 * of a mid-run failure.
 *
 * The strip uses `FieldValue.arrayRemove('test')` and `update`, for the same reasons the
 * orphan sweep does: server-evaluated so a concurrent write survives, and never resurrects
 * a concurrently deleted document.
 */
async function applyR10Writes(part) {
  log('\n' + '='.repeat(100));
  log('R-10 — WRITING (strip first, then the irreversible delete)');
  log('='.repeat(100));

  if (R10_STRIP) {
    const b = makeBatcher('R-10 strip');
    log('\n  STRIP PASS');
    for (const [c, ids] of Object.entries(part.strip).sort()) {
      for (const id of ids) {
        await b.add(w => w.update(db.collection(c).doc(id), { tenants: FieldValue.arrayRemove(R10.tenant) }));
      }
      log(`    ${c.padEnd(24)} ${String(ids.length).padStart(5)} stripped`);
    }
    await b.flush();
    log(`    committed: ${b.committed} operation(s)`);
  }

  if (R10_DELETE) {
    const b = makeBatcher('R-10 delete');
    log('\n  DELETE PASS — irreversible');
    for (const [c, ids] of Object.entries(part.del).sort()) {
      for (const id of ids) await b.add(w => w.delete(db.collection(c).doc(id)));
      log(`    ${c.padEnd(24)} ${String(ids.length).padStart(5)} deleted`);
    }
    await b.flush();
    log(`    committed: ${b.committed} operation(s)`);
  }
  log('\n  R-10 writes committed. Verify by READ-BACK, never from these counts.');
}

/**
 * Export every document that is about to be deleted, in full, before deleting it.
 * Deletion is irreversible; a few hundred documents cost nothing to keep.
 * Written, then READ BACK and counted — an export nobody verified is not a backup.
 */
async function exportBackup(del, filePath) {
  const out = { ruling: R10.ruling, date: R10.date, exportedAt: new Date().toISOString(), documents: [] };
  for (const [coll, ids] of Object.entries(del)) {
    for (const id of ids) {
      const snap = await db.collection(coll).doc(id).get();
      if (!snap.exists) continue; // deleted underneath us since the census
      out.documents.push({ collection: coll, docId: id, data: snap.data() });
    }
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(out, null, 1));
  // read back — verify, do not assume
  const readBack = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return { path: filePath, written: out.documents.length, verified: readBack.documents.length };
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

/**
 * ⚠️ WHY THIS WRITES `FieldValue.arrayRemove` AND NOT A COMPUTED ARRAY. ⚠️
 *
 * The census is read at the START of the run — a 71 000-document scan across 45
 * collections that takes minutes. The earlier implementation then wrote
 * `set({ tenants: <array computed from that snapshot> }, { merge: true })`, which replaces
 * the WHOLE array with a value derived from data that is by then minutes stale. Any write
 * that landed in between was silently reverted.
 *
 * That is not theoretical here: step 2.2 is `applyFeatureSelection`, whose entire job is
 * to ADD tenants to `menuItems.tenants[]`. Run it concurrently with — or simply between
 * the read and the write of — this sweep, and the sweep quietly undoes it. The tenant
 * would appear to have been seeded, and would silently not be.
 *
 * `FieldValue.arrayRemove(...ids)` is evaluated by the SERVER against the document's
 * current value. It removes exactly the named elements and touches nothing else, so a
 * concurrent `add-tenant` survives. It is also idempotent by construction — removing an
 * absent element is a no-op — which is what makes a partial earlier run safe to re-run.
 * No read-modify-write, therefore no race and no need for a transaction.
 *
 * Chosen over the alternatives deliberately:
 *   - a per-document transaction would also be correct, but costs a re-read per document
 *     and buys nothing `arrayRemove` does not already give;
 *   - a freshness check (re-read, compare, then write) narrows the window without closing
 *     it — the classic check-then-act race.
 *
 * The candidate list still comes from the stale census, which is fine: a document that
 * gained one of these ids after the census would merely be missed, and the next dry run
 * would show it. Missing a document is recoverable; clobbering one is not.
 */
async function applyWrites({ stripTargets, present, docsByCollection }) {
  log('\n' + '='.repeat(100));
  log('WRITING');
  log('='.repeat(100));

  const batcher = makeBatcher('orphan sweep');
  /**
   * `update`, never `set(…, { merge: true })`.
   *
   * `set` with merge CREATES the document if it does not exist. The census is minutes old
   * by the time these writes land, and the owner has been DELETING documents concurrently
   * all week (`app-config` went 19 → 14 → 5 in an hour, and one document vanished between
   * two consecutive snapshots of an earlier task). With `set(merge)` a document deleted
   * after the census would be RESURRECTED here as a near-empty husk — an `app-config` doc
   * with no fields, or a content doc whose only field is `tenants` — quietly undoing a
   * deliberate deletion and leaving a broken record behind.
   *
   * `update` throws NOT_FOUND instead, which fails the whole batch. That is the right
   * trade: the run aborts having written nothing of that batch, the operator re-runs, and
   * because every operation here is idempotent a re-run is free. Failing closed on a
   * concurrent delete beats silently re-creating what someone chose to remove.
   */
  const queue = (ref, data) => batcher.add(w => w.update(ref, data));

  // `--write` is unreachable without one of these two (guarded at parse time), so the
  // strip runs exactly when it was asked for. (An earlier `|| REMOVE.length === 0`
  // disjunct here was dead code: that state is refused before Firestore is even opened.)
  if (STRIP_ONLY) {
    for (const id of stripTargets) {
      await queue(db.collection(APP_CONFIG).doc(id), { tenantId: FieldValue.delete() });
      log(`  ${APP_CONFIG}/${id}: delete tenantId`);
    }
  }

  if (REMOVE.length > 0) {
    for (const c of present) {
      let touched = 0;
      for (const d of docsByCollection[c]) {
        if (!d.tenants.some(t => REMOVE.includes(t))) continue; // idempotent: nothing to do
        // Server-evaluated, order-independent, concurrency-safe — see the comment above.
        await queue(db.collection(c).doc(d.id), { tenants: FieldValue.arrayRemove(...REMOVE) });
        touched++;
      }
      if (touched) log(`  ${c}: ${touched} document(s) updated`);
    }
  }

  // NOT_FOUND handling lives inside makeBatcher's flush, so EVERY commit is covered —
  // including the intermediate ones this loop triggers past BATCH_SIZE.
  await batcher.flush();
  log(`\n  done — ${batcher.committed} operation(s) committed.`);
  log('\n  NEXT: re-run the dry run to confirm the sweep landed BEFORE running');
  log('        applyFeatureSelection. See "REQUIRED SEQUENCE" in this file\'s header.');
}

main().catch((e) => { console.error(e); process.exit(1); });
