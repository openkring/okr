/**
 * CATALOGUE DRIFT CHECK — does `feature-blocks.ts` still agree with the live menu data?
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * WHY
 * ─────────────────────────────────────────────────────────────────────────────────────
 * The catalogue's 245 menu specs were transcribed from live `menuItems` documents and are
 * kept in sync BY HAND. Nothing enforced that: no test, no build step, no release gate.
 * Every correction made in Firestore that was not back-ported into the catalogue sat there
 * as a pending revert, waiting for the next «Struktur übernehmen» to overwrite it — with no
 * warning at the moment of the edit and no trace afterwards. Commit 170fe4617 ("sync
 * membership-copyemail's role with the live doc") is that back-port done manually; ba74a8f5e,
 * a6d07bd4c and 487e1fea9 are three more.
 *
 * This script closes the loop: it reports every live document whose catalogue-owned fields
 * (`url`, `action`, `roleNeeded`) differ from the spec, per tenant, and exits non-zero when
 * any exist.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES NOT DO
 * ─────────────────────────────────────────────────────────────────────────────────────
 * It never writes. Drift is not automatically an error in either direction: sometimes the
 * catalogue is stale (back-port the live value into `feature-blocks.ts`), sometimes the live
 * document is (run «Struktur übernehmen» in `/tenant/features`). Deciding which is a human
 * call — the script's job is to make sure the decision is made deliberately rather than by
 * whoever saves the picker next.
 *
 * It reuses the runtime's OWN functions (`effectiveFeatures`, `indexMenuDocsByName`,
 * `findStructuralDrift`) rather than reimplementing the comparison, so the report and the
 * write can never disagree — the same argument `findStructuralDrift` itself records.
 *
 * Usage:
 *   node scripts/check-feature-catalogue.mjs                 # all tenants, exit 1 on drift
 *   node scripts/check-feature-catalogue.mjs --tenant=scs    # one tenant
 *   node scripts/check-feature-catalogue.mjs --json          # machine-readable
 *   node scripts/check-feature-catalogue.mjs --quiet         # summary line only
 *   pnpm catalogue:check
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

// The catalogue and its resolution helpers are TypeScript and are the single source of
// truth; jiti (already a devDependency, used by the Nx toolchain) loads them directly, the
// same way `backfill-enabled-features.mjs` does, so this check can never drift from a
// hand-copied duplicate of the very logic it is checking.
const jiti = createJiti(import.meta.url, { interopDefault: true });
const { FEATURE_BLOCKS } = await jiti.import(path.join(ROOT, 'libs/tenant/util/src/lib/feature-blocks.ts'));
const { effectiveFeatures } = await jiti.import(path.join(ROOT, 'libs/tenant/util/src/lib/feature-rollout.util.ts'));
const { indexMenuDocsByName, findStructuralDrift, menuSpecNames } =
  await jiti.import(path.join(ROOT, 'libs/tenant/util/src/lib/menu-seed.util.ts'));

const ARGS = process.argv.slice(2);
const has = (flag) => ARGS.includes(flag);
const valueOf = (name) => {
  const hit = ARGS.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
};

const TENANT = valueOf('tenant');
const JSON_OUT = has('--json');
const QUIET = has('--quiet');

const APP_CONFIG = 'app-config';
const MENU_ITEMS = 'menuItems';
const FEATURE_ROLLOUT = 'feature-rollout';

const log = (...a) => { if (!JSON_OUT && !QUIET) console.log(...a); };

function pad(s, n) { return String(s).padEnd(n); }

// ── read ────────────────────────────────────────────────────────────────────────────
if (!getApps().length) initializeApp();
const db = getFirestore();

const [configSnap, rolloutSnap, menuSnap] = await Promise.all([
  db.collection(APP_CONFIG).get(),
  db.collection(FEATURE_ROLLOUT).get(),
  // UNSCOPED on purpose — exactly like `applySelection`. Menu docs are globally shared and
  // a tenant inherits one through `tenants[]`; a filtered read could not see the document
  // the seed would extend, so the resolution ladder needs the whole collection.
  db.collection(MENU_ITEMS).get(),
]);

const rollouts = rolloutSnap.docs.map((d) => ({ okey: d.id, ...d.data() }));
const menuDocs = menuSnap.docs.map((d) => ({ id: d.id, data: d.data() }));

let tenants = configSnap.docs
  .map((d) => ({ tenantId: d.id, config: d.data() }))
  .sort((a, b) => a.tenantId.localeCompare(b.tenantId));

if (TENANT) {
  tenants = tenants.filter((t) => t.tenantId === TENANT);
  if (tenants.length === 0) {
    console.error(`\nUnknown tenant '${TENANT}'. Known: ${configSnap.docs.map((d) => d.id).join(', ')}\n`);
    process.exit(2);
  }
}

// ── analyse ─────────────────────────────────────────────────────────────────────────
const report = [];

for (const { tenantId, config } of tenants) {
  // NOT coalesced to []: an undefined `enabledFeatures` means "every non-internal block"
  // (D-BB-10), and coalescing it here would report a legacy tenant as having no blocks and
  // therefore no drift — a clean bill of health for the tenants most likely to have drifted.
  const live = effectiveFeatures({
    catalogue: FEATURE_BLOCKS,
    rollouts,
    enabled: config.enabledFeatures,
    tenantId,
  });

  const blocks = FEATURE_BLOCKS.filter((b) => live.has(b.id));
  const specs = blocks.flatMap((b) => b.menu);
  const { byName, ambiguous } = indexMenuDocsByName(menuDocs, tenantId);

  // Only names THIS tenant's seed would write matter — an ambiguity elsewhere in the
  // globally shared collection is somebody else's data problem, exactly as `applySelection`
  // scopes its own refusal.
  const touched = new Set([...specs.flatMap((s) => menuSpecNames([s])), `main_${tenantId}`]);
  const blocking = ambiguous.filter((a) => touched.has(a.name));

  // `findStructuralDrift` reports the catalogue values it WOULD write, per SPEC. The value
  // the live document still carries is the other half a reader needs in order to judge which
  // side is stale, so pick it back out of the same resolved index the comparison ran against.
  //
  // Flattened to one entry per (document, field, catalogue value): a name declared by two
  // blocks — the shared-parent pattern — is visited once per spec and would otherwise be
  // reported twice for one overwrite. The catalogue VALUE stays part of the identity, so two
  // blocks declaring DIFFERENT values for one field still show up as the two conflicting
  // entries they are, rather than collapsing into a single arbitrary winner.
  const seen = new Set();
  const changes = [];
  for (const d of findStructuralDrift(specs, byName)) {
    for (const [field, to] of Object.entries(d.fields)) {
      const identity = `${d.docId}|${field}|${to}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      changes.push({
        name: d.name, docId: d.docId, forked: d.forked, field,
        from: String(byName.get(d.name)?.[field] ?? ''), to: String(to),
      });
    }
  }

  report.push({
    tenantId,
    blocks: blocks.length,
    specs: specs.reduce((n, s) => n + menuSpecNames([s]).length, 0),
    changes,
    blocking,
  });
}

// ── output ──────────────────────────────────────────────────────────────────────────
const totalDrift = report.reduce((n, r) => n + r.changes.length, 0);
const totalBlocking = report.reduce((n, r) => n + r.blocking.length, 0);

if (JSON_OUT) {
  console.log(JSON.stringify({ totalDrift, totalBlocking, tenants: report }, null, 2));
} else {
  log('\nFEATURE CATALOGUE DRIFT CHECK');
  log('═'.repeat(96));

  for (const r of report) {
    log(`\n${r.tenantId}  —  ${r.blocks} aktive Blöcke, ${r.specs} Menü-Specs`);

    if (r.changes.length === 0 && r.blocking.length === 0) {
      log('  ✓ keine Abweichung');
    }

    if (r.changes.length > 0) {
      log(`  ${pad('NAME', 30)}${pad('FELD', 12)}LIVE → KATALOG`);
      for (const c of r.changes) {
        log(`  ${pad(c.name + (c.forked ? ' (fork)' : ''), 30)}${pad(c.field, 12)}` +
          `${c.from || '∅'} → ${c.to}`);
        if (c.docId !== c.name) log(`  ${' '.repeat(30)}doc: ${c.docId}`);
      }
    }

    for (const a of r.blocking) {
      log(`  ⚠ name '${a.name}' ist für diesen Mandanten nicht eindeutig auflösbar ` +
        `(Kandidaten: ${a.ids.join(', ')}) — applyFeatureSelection würde verweigern`);
    }
  }

  log('\n' + '═'.repeat(96));
}

if (!JSON_OUT) {
  const verdict = totalDrift === 0 && totalBlocking === 0
    ? `✓ Katalog und Live-Daten stimmen überein (${report.length} Mandanten geprüft)`
    : `✖ ${totalDrift} abweichende Felder, ${totalBlocking} nicht auflösbare Namen ` +
      `(${report.length} Mandanten geprüft)`;
  console.log(verdict + '\n');
}

process.exit(totalDrift === 0 && totalBlocking === 0 ? 0 : 1);
