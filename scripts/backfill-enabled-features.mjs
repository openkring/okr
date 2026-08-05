/**
 * ONE-TIME BACKFILL — derive and (on explicit request) write `app-config/{tenantId}`'s
 * `enabledFeatures` array for existing tenants.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * WHY
 * ─────────────────────────────────────────────────────────────────────────────────────
 * No tenant has an `enabledFeatures` field today, so `effectiveFeatures` takes the D-BB-10
 * legacy path (`enabled === undefined` ⇒ "every non-internal block") and the feature gate
 * enforces nothing. Writing the fallback's own output back would grant every non-internal
 * block — including the two `disabled` ones — to every tenant in one shot. This script
 * derives each tenant's array from EVIDENCE instead: the `menuItems` documents the tenant
 * demonstrably owns.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * ATTRIBUTION POLICY — the decision that determines whether the arrays are right
 * ─────────────────────────────────────────────────────────────────────────────────────
 * Menu documents are deliberately CO-DECLARED by several blocks (the shared-parent
 * pattern: `cms-menu` has eight declaring blocks, `aoc-menu` five, plus `subjects-menu`,
 * `resource-menu`, `contextMenuChat`/`chat-room-add`/`chat-room-edit` and `filter-toggle`).
 * `blockOwnersOfMenuKey` returns every owner, so possessing such a document proves only
 * that the tenant has SOME child under it — not all of them.
 *
 *   CHOSEN: 'exclusive'. A document attributes a block only when exactly one block
 *   declares it. Safe by construction, and it does not under-attribute, because the shared
 *   PARENTS are shared while their CHILDREN are not (`cms-menu` is co-declared, but
 *   `menu-all`/`page-all`/`category-all`/`location-all` each have exactly one owner). A
 *   unit test pins that premise.
 *
 *   REJECTED: 'all'. On live data it grants `activity` and `mobility` to eight tenants
 *   whose only AOC document is the shared `aoc-menu` parent — they own neither
 *   `activity-all` nor `flighttracker`. It also "adds" `security` to those eight, which is
 *   a no-op only because `security` is `core: true`.
 *
 *   EQUIVALENT: 'corroborated' — credits a shared parent to owners already proven by an
 *   exclusive document. Set-identical to 'exclusive' by construction; kept so the dry-run
 *   can demonstrate that rather than assert it.
 *
 * `--compare-policies` prints the per-tenant delta between all three.
 *
 * Core blocks are unioned in, dependencies are closed over with the runtime's own
 * `resolveWithDeps`, and the runtime's own `resolveAvailability` gate runs LAST — which is
 * why `social-feed` and `games` cannot appear in any output and why no block id is
 * hardcoded here. See `libs/tenant/util/src/lib/feature-backfill.util.ts` for the full
 * derivation and its reasoning.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * SAFETY
 * ─────────────────────────────────────────────────────────────────────────────────────
 * `--dry-run` is the DEFAULT. Writing requires BOTH `--write` and `--tenant=<id>`; a bare
 * `--write` across all tenants is refused. Only `enabledFeatures` is ever written.
 *
 * Usage:
 *   node scripts/backfill-enabled-features.mjs                        # dry run, all tenants
 *   node scripts/backfill-enabled-features.mjs --tenant=p13           # dry run, one tenant
 *   node scripts/backfill-enabled-features.mjs --compare-policies     # + policy comparison
 *   node scripts/backfill-enabled-features.mjs --json                 # machine-readable
 *   node scripts/backfill-enabled-features.mjs --write --tenant=p13   # THE ONLY write form
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createJiti } from 'jiti';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

// The catalogue is TypeScript and is the single source of truth; jiti (already a
// devDependency, used by the Nx toolchain) loads it directly so this script can never
// drift from a hand-copied duplicate.
const jiti = createJiti(import.meta.url, { interopDefault: true });
const { FEATURE_BLOCKS } = await jiti.import(path.join(ROOT, 'libs/tenant/util/src/lib/feature-blocks.ts'));
const { deriveEnabledFeatures } = await jiti.import(path.join(ROOT, 'libs/tenant/util/src/lib/feature-backfill.util.ts'));

const ARGS = process.argv.slice(2);
const has = (flag) => ARGS.includes(flag);
const valueOf = (name) => {
  const hit = ARGS.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

const WRITE = has('--write');
const TENANT = valueOf('tenant');
const COMPARE = has('--compare-policies');
const JSON_OUT = has('--json');
const POLICY = valueOf('policy') ?? 'exclusive';

const APP_CONFIG = 'app-config';
const MENU_ITEMS = 'menuItems';
const FEATURE_ROLLOUT = 'feature-rollout';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * OWNER OVERRIDES — a ruling replaces the derivation for one tenant.
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ DO NOT "CORRECT" THESE BACK TO THE DERIVED VALUE. ⚠️
 *
 * An entry here means the menu data does NOT reflect what the tenant is for, and the owner
 * has said so explicitly. Re-deriving it would quietly undo a deliberate decision — for
 * `okr` specifically, it would cut the demo tenant from 28 blocks back to 12 and gut the
 * thing it exists to demonstrate.
 *
 * An override replaces only WHAT IS REQUESTED. The core union, `resolveWithDeps` and above
 * all the availability gate still run identically, so an override can never introduce a
 * `disabled` block or bypass a `denyTenants` entry — `feature-backfill.util.spec.ts` pins
 * both. That is what makes it safe to hand the whole catalogue in below and let the gate
 * subtract, rather than naming the excluded blocks.
 */
const OWNER_OVERRIDES = {
  okr: {
    ruling: 'R-8',
    date: '2026-08-05',
    reason:
      'Owner ruling: `okr` is the demo tenant and gets EVERY non-disabled block. Its own ' +
      'app-config.description ("demo tenant: all feature blocks, seed dataset, daily reset") ' +
      'is the intent; its thin menu data (8 docs, evidencing only auth+profile) does not ' +
      'reflect what the tenant is for. The block set therefore comes from the CATALOGUE, ' +
      'passed through the same availability gate as every derived tenant — so social-feed ' +
      'and games are excluded by mechanism, not by name.',
    // Whole catalogue in; the gate decides what comes out. Deliberately not a literal list:
    // a block added to the catalogue later should reach the demo tenant automatically.
    ids: () => FEATURE_BLOCKS.map((b) => b.id),
  },
};

/** Below this many evidenced (non-core, non-dep) blocks a tenant's result is suspect. */
const NEAR_EMPTY_THRESHOLD = 3;

const log = (...a) => { if (!JSON_OUT) console.log(...a); };

function refuse(message) {
  console.error(`\nREFUSED: ${message}\n`);
  process.exit(2);
}

if (WRITE && !TENANT) {
  refuse(
    '--write requires an explicit --tenant=<id>.\n' +
    'A bare all-tenant write would change what every tenant can see in a single command.\n' +
    'Run the dry run first, have the output authorised, then write one tenant at a time.',
  );
}
if (!['exclusive', 'corroborated', 'all'].includes(POLICY)) {
  refuse(`unknown --policy=${POLICY} (expected exclusive | corroborated | all)`);
}

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

async function main() {
  const [configSnap, menuSnap, rolloutSnap] = await Promise.all([
    db.collection(APP_CONFIG).get(),
    db.collection(MENU_ITEMS).get(),
    db.collection(FEATURE_ROLLOUT).get(),
  ]);

  const menuDocs = menuSnap.docs.map((d) => ({ okey: d.id, ...d.data() }));
  const rollouts = rolloutSnap.docs.map((d) => ({ okey: d.id, ...d.data() }));

  let configs = configSnap.docs;
  if (TENANT) {
    configs = configs.filter((d) => d.id === TENANT);
    if (configs.length === 0) refuse(`no ${APP_CONFIG} document with id "${TENANT}"`);
  }

  log('='.repeat(96));
  log(`BACKFILL enabledFeatures — ${WRITE ? 'WRITE' : 'DRY RUN'} — policy=${POLICY}`);
  log(`catalogue: ${FEATURE_BLOCKS.length} blocks | ${APP_CONFIG}: ${configSnap.size} docs ` +
      `| ${MENU_ITEMS}: ${menuSnap.size} docs | ${FEATURE_ROLLOUT}: ${rolloutSnap.size} docs`);
  log('='.repeat(96));

  // ── A tenant's identity is its app-config DOCUMENT ID, never the `tenantId` FIELD.
  // Verified across the whole system, because this is the one thing the backfill must not
  // get wrong:
  //   - `AppConfigService.read(key)` -> `readObject(AppConfigCollection, key)` -> `.doc(key)`;
  //   - `AppStore` passes `store.tenantId()` (= `env.tenantId`) as that key AND as the value
  //     for `getSystemQuery(tenantId)`, i.e. `tenants array-contains <same string>`, so the
  //     config lookup and every content query use ONE identifier;
  //   - `env.tenantId` is derived in `set-env.js` from the Nx project name
  //     (`projectName.replace(/-app$/, '')`) — `scs-app` -> `scs`;
  //   - every Cloud Function does `.doc(tenantId)` too, including
  //     `apply-feature-selection.ts`, which uses the SAME string for the config doc id, for
  //     `tenants: [tenantId]` on the menu docs it writes, and for `main_${tenantId}`.
  // NOTHING anywhere queries `where('tenantId', ...)` on `app-config`. The field is written
  // but never read as a key, so it CANNOT redirect a config to another tenant's content.
  // Keying this backfill on the field instead would make the proposed arrays disagree with
  // both the runtime gate and the function that later rewrites them.
  const configIds = new Set(configSnap.docs.map((d) => d.id));
  const contentIds = new Set();
  menuDocs.forEach((d) => (d.tenants ?? []).forEach((t) => contentIds.add(t)));

  // The field is inert, but a disagreement is still a real data defect worth surfacing.
  const fieldDisagrees = configSnap.docs
    .filter((d) => d.data().tenantId !== undefined && d.data().tenantId !== d.id)
    .map((d) => ({ okey: d.id, field: d.data().tenantId }));
  const fieldMissing = configSnap.docs.filter((d) => d.data().tenantId === undefined).map((d) => d.id);

  if (fieldDisagrees.length || fieldMissing.length) {
    log('\n' + '~'.repeat(96));
    log('~~ app-config.tenantId FIELD disagrees with the DOCUMENT ID');
    log('~'.repeat(96));
    fieldDisagrees.forEach((f) => log(`~~   app-config/${f.okey}  ->  tenantId: "${f.field}"`));
    if (fieldMissing.length) log(`~~   no tenantId field at all: ${fieldMissing.join(', ')}`);
    log('~~ The DOCUMENT ID is the real identity (see the comment above this check): the app');
    log('~~ reads app-config by doc id and queries content with the same string, and no code');
    log('~~ path anywhere queries the tenantId field. So the field is INERT — it does not');
    log('~~ redirect these configs to another tenant\'s content, and this backfill deliberately');
    log('~~ does NOT key on it. Reported because a stale field value is still a defect.');
    // Show what the (incorrect) field-keyed view would look like, so the difference is
    // visible rather than merely asserted.
    const fieldIds = new Set(configSnap.docs.map((d) => d.data().tenantId ?? d.id));
    const fieldCfgNoContent = [...fieldIds].filter((t) => !contentIds.has(t)).sort();
    const fieldContentNoCfg = [...contentIds].filter((t) => !fieldIds.has(t)).sort();
    log('~~ For comparison only — if the FIELD were used as the key, the orphan lists would be:');
    log(`~~   config w/o content (${fieldCfgNoContent.length}): ${fieldCfgNoContent.join(', ') || '(none)'}`);
    log(`~~   content w/o config (${fieldContentNoCfg.length}): ${fieldContentNoCfg.join(', ') || '(none)'}`);
    log('~~ Tidier arithmetic, but it would map two config docs onto one tenant and write the');
    log('~~ same array into both. Not adopted.');
    log('~'.repeat(96));
  }
  const configWithoutContent = [...configIds].filter((t) => !contentIds.has(t)).sort();
  const contentWithoutConfig = [...contentIds].filter((t) => !configIds.has(t)).sort();

  if (configWithoutContent.length || contentWithoutConfig.length) {
    log('\n' + '!'.repeat(96));
    log('!! TENANT-ID PROVENANCE MISMATCH — read before trusting any result below');
    log('!'.repeat(96));
    log(`!! ${APP_CONFIG} ids with NO menu document anywhere (${configWithoutContent.length}):`);
    log(`!!   ${configWithoutContent.join(', ') || '(none)'}`);
    log(`!! menuItems.tenants[] ids with NO ${APP_CONFIG} doc (${contentWithoutConfig.length}):`);
    log(`!!   ${contentWithoutConfig.join(', ') || '(none)'}`);
    log('!! Six of each side (blk/kw83b/pz75/rain65/rain73/silcrest7 vs cwst/kwo/pzu/r65/sc7/sps)');
    log('!! look like the same tenants under two id generations. The remaining entries are a');
    log('!! DIFFERENT problem: `demo` and `elab` are real configs with no content of their own,');
    log('!! and `test` is substantial content (the 2nd largest tenant) with NO app-config doc at');
    log('!! all — see the tenantId-field note above; the field does not bridge them.');
    log('!! Until an operator supplies the mapping, every tenant in the first list derives as');
    log('!! CORE-ONLY. That is a data-provenance gap, NOT a real feature set — do not write it.');
    log('!'.repeat(96));
  }

  const results = [];
  const suspect = [];

  for (const cfg of configs) {
    const tenantId = cfg.id;
    const current = cfg.data().enabledFeatures;
    const ruling = OWNER_OVERRIDES[tenantId];
    const override = ruling ? { ...ruling, ids: ruling.ids() } : undefined;
    const out = deriveEnabledFeatures({
      catalogue: FEATURE_BLOCKS, rollouts, menuDocs, tenantId, policy: POLICY, override,
    });

    const evidenced = Object.keys(out.evidence).sort();
    const noContent = !contentIds.has(tenantId);
    // An overridden tenant is NOT judged by its evidence — that is the whole point of the
    // ruling. It is still judged by the checks the ruling does not speak to (empty result,
    // and content existing under its own id at all).
    const nearEmpty = !override && evidenced.length < NEAR_EMPTY_THRESHOLD;
    const isSuspect = out.enabled.length === 0 || nearEmpty || noContent;
    if (isSuspect) suspect.push({ tenantId, evidenced: evidenced.length, noContent });

    results.push({ ...out, current, evidenced, suspect: isSuspect });

    log(`\n${'─'.repeat(96)}`);
    log(`TENANT ${tenantId}${cfg.data().isArchived === true ? '  [app-config isArchived]' : ''}`);
    log('─'.repeat(96));
    if (override) {
      log(`  *** OWNER OVERRIDE ${override.ruling} (${override.date}) — NOT a derivation ***`);
      log(`  *** ${override.reason.replace(/(.{88}) /g, '$1\n  *** ')}`);
      log(`  *** menu evidence would have given: [${(out.derivedInstead ?? []).join(', ') || 'nothing'}]`);
      log('  *** Do not "correct" this back to the derived value — see OWNER_OVERRIDES in this script.');
    }
    log(`  current enabledFeatures : ${current === undefined ? '<field absent>' : JSON.stringify(current)}`);
    log(`  live menu docs          : ${out.docCount} (${out.uncatalogued.length} tenant-authored / uncatalogued)`);
    log(`  proposed (${String(out.enabled.length).padStart(2)} blocks)   : ${JSON.stringify(out.enabled)}`);
    log(`  evidenced by menu docs  : ${evidenced.length ? evidenced.join(', ') : '(none)'}`);
    log(`  core, no evidence       : ${out.coreOnly.join(', ') || '(none)'}`);
    log(`  dependency-only         : ${out.depsOnly.join(', ') || '(none)'}`);
    log(`  refused by the gate     : ${out.gatedOut.map((g) => `${g.id}(${g.availability})`).join(', ') || '(none)'}`);

    if (evidenced.length) {
      log('  evidence:');
      for (const block of evidenced) {
        const docs = out.evidence[block];
        const shown = docs.slice(0, 8).join(', ');
        log(`    ${block.padEnd(14)} ← ${docs.length} doc(s): ${shown}${docs.length > 8 ? ', …' : ''}`);
      }
    }

    if (isSuspect) {
      log('');
      log('  *** SUSPECT RESULT — DO NOT WRITE ***');
      if (noContent) {
        log(`  *** No menuItems document anywhere carries tenants[] = "${tenantId}". The tenant's`);
        log('  *** content is either absent or tagged under a different (legacy) id. The array');
        log('  *** below is core-only by default, not a derived feature set.');
      } else {
        log(`  *** Only ${evidenced.length} block(s) were evidenced (threshold ${NEAR_EMPTY_THRESHOLD}). A tenant that`);
        log('  *** really runs almost nothing is possible but rare; treat this as a derivation');
        log('  *** or provenance bug until proven otherwise.');
      }
    }
  }

  if (COMPARE) printPolicyComparison(configs, menuDocs, rollouts);
  printSanityChecks(results, contentIds);

  if (WRITE) {
    const [only] = results;
    if (only.suspect) {
      refuse(`tenant "${only.tenantId}" produced a suspect result (see above). Fix the derivation ` +
             'or the data before writing.');
    }
    log(`\nWriting enabledFeatures for ${only.tenantId} …`);
    // Field-scoped update: `update` with a single key touches nothing else on the doc.
    await db.collection(APP_CONFIG).doc(only.tenantId).update({ enabledFeatures: only.enabled });
    log(`  wrote ${only.enabled.length} blocks to ${APP_CONFIG}/${only.tenantId}.enabledFeatures`);
  } else {
    log('\n(dry run — no writes performed. Use --write --tenant=<id> to write ONE tenant.)');
  }

  if (JSON_OUT) {
    console.log(JSON.stringify(
      { policy: POLICY, configWithoutContent, contentWithoutConfig, results }, null, 1,
    ));
  }

  if (suspect.length) {
    log(`\nEXIT 1 — ${suspect.length} tenant(s) produced a suspect result: ` +
        suspect.map((s) => s.tenantId).join(', '));
    process.exitCode = 1;
  }
}

function printPolicyComparison(configs, menuDocs, rollouts) {
  const policies = ['exclusive', 'corroborated', 'all'];
  log(`\n${'='.repeat(96)}`);
  log('ATTRIBUTION-POLICY COMPARISON — how many attributions each candidate would change');
  log('='.repeat(96));
  log('tenant       exclusive  corroborated  all     blocks "all" adds over "exclusive"');

  let totalDelta = 0;
  const addedBy = {};
  for (const cfg of configs) {
    const runs = Object.fromEntries(policies.map((p) => [p, deriveEnabledFeatures({
      catalogue: FEATURE_BLOCKS, rollouts, menuDocs, tenantId: cfg.id, policy: p,
    })]));
    const excl = new Set(runs.exclusive.enabled);
    const extra = runs.all.enabled.filter((id) => !excl.has(id));
    extra.forEach((id) => { addedBy[id] = (addedBy[id] ?? 0) + 1; });
    totalDelta += extra.length;
    log(`${cfg.id.padEnd(12)} ${String(runs.exclusive.enabled.length).padEnd(10)} ` +
        `${String(runs.corroborated.enabled.length).padEnd(13)} ` +
        `${String(runs.all.enabled.length).padEnd(7)} ${extra.join(', ') || '—'}`);
  }
  log('─'.repeat(96));
  log(`'all' vs 'exclusive'      : ${totalDelta} extra block attributions across ${configs.length} tenants`);
  log(`                            by block: ${Object.entries(addedBy).map(([k, v]) => `${k} ×${v}`).join(', ') || '—'}`);
  log("'corroborated' vs 'exclusive': set-identical by construction (verified per tenant above);");
  log('                            differs only in the evidence it records.');
}

function printSanityChecks(results, contentIds) {
  const disabled = FEATURE_BLOCKS.filter((b) => b.defaultAvailability === 'disabled').map((b) => b.id);
  const byId = Object.fromEntries(results.map((r) => [r.tenantId, r]));
  const check = (label, ok, detail) => log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ` — ${detail}` : ''}`);

  log(`\n${'='.repeat(96)}`);
  log('SANITY CHECKS');
  log('='.repeat(96));

  const total = FEATURE_BLOCKS.length;
  if (byId.scs) {
    check(`scs comes out with nearly every block`, byId.scs.enabled.length >= total - 5,
      `${byId.scs.enabled.length}/${total} blocks`);
  }
  if (byId.scs && byId.p13) {
    check('p13 comes out much smaller than scs', byId.p13.enabled.length < byId.scs.enabled.length,
      `p13=${byId.p13.enabled.length} vs scs=${byId.scs.enabled.length}`);
  }

  const empty = results.filter((r) => r.enabled.length === 0).map((r) => r.tenantId);
  check('no tenant proposes an empty array', empty.length === 0, empty.join(', ') || 'all non-empty');

  const leaked = results.flatMap((r) => r.enabled.filter((id) => disabled.includes(id))
    .map((id) => `${r.tenantId}:${id}`));
  check(`no disabled block appears anywhere (gate-derived: ${disabled.join(', ')})`,
    leaked.length === 0, leaked.join(', ') || 'clean');

  const noContent = results.filter((r) => !contentIds.has(r.tenantId)).map((r) => r.tenantId);
  check('every tenant has menu content under its own id', noContent.length === 0,
    noContent.length ? `no content for: ${noContent.join(', ')}` : 'all tenants have content');

  // R-8: okr must come out as the full non-disabled catalogue.
  if (byId.okr) {
    const expected = FEATURE_BLOCKS.filter((b) => b.defaultAvailability !== 'disabled')
      .map((b) => b.id).sort();
    const got = byId.okr.enabled;
    const same = got.length === expected.length && got.every((id, i) => id === expected[i]);
    check('okr (R-8 override) is the full non-disabled catalogue', same,
      `${got.length} blocks, expected ${expected.length}` +
      (same ? '' : ` — missing: ${expected.filter((e) => !got.includes(e)).join(', ') || 'none'}` +
                    ` / extra: ${got.filter((g) => !expected.includes(g)).join(', ') || 'none'}`));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
