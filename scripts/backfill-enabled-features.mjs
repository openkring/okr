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

  // ── Provenance check: do the tenant ids in menuItems.tenants[] line up with app-config?
  // A tenant whose content is tagged under a DIFFERENT id derives as core-only, which
  // would look like a real (empty) result and is not one.
  const configIds = new Set(configSnap.docs.map((d) => d.id));
  const contentIds = new Set();
  menuDocs.forEach((d) => (d.tenants ?? []).forEach((t) => contentIds.add(t)));
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
    log('!! These two lists are almost certainly the same tenants under two id generations.');
    log('!! Until an operator supplies the mapping, every tenant in the first list derives as');
    log('!! CORE-ONLY. That is a data-provenance gap, NOT a real feature set — do not write it.');
    log('!'.repeat(96));
  }

  const results = [];
  const suspect = [];

  for (const cfg of configs) {
    const tenantId = cfg.id;
    const current = cfg.data().enabledFeatures;
    const out = deriveEnabledFeatures({
      catalogue: FEATURE_BLOCKS, rollouts, menuDocs, tenantId, policy: POLICY,
    });

    const evidenced = Object.keys(out.evidence).sort();
    const noContent = !contentIds.has(tenantId);
    const nearEmpty = evidenced.length < NEAR_EMPTY_THRESHOLD;
    const isSuspect = out.enabled.length === 0 || nearEmpty || noContent;
    if (isSuspect) suspect.push({ tenantId, evidenced: evidenced.length, noContent });

    results.push({ ...out, current, evidenced, suspect: isSuspect });

    log(`\n${'─'.repeat(96)}`);
    log(`TENANT ${tenantId}${cfg.data().isArchived === true ? '  [app-config isArchived]' : ''}`);
    log('─'.repeat(96));
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
}

main().catch((e) => { console.error(e); process.exit(1); });
