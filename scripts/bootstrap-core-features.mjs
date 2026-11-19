#!/usr/bin/env node
/**
 * Seeds the CORE feature blocks of a tenant (login, logout, profile, AOC, CMS, …) — provisioning step 4f.
 *
 *   node scripts/bootstrap-core-features.mjs <tenantId>           # dry run: what is stored, what would be enabled
 *   node scripts/bootstrap-core-features.mjs <tenantId> --write   # enable every core block with all its menu rows
 *
 * WHY: core blocks (`core: true` in libs/tenant/util/src/lib/feature-blocks.ts) have no switch in the
 * feature picker, so the picker never sends an `enableBlock` for them. A tenant provisioned after the
 * catalogue was introduced therefore got no login/profile/AOC/CMS menu rows ("Missing: page-all"):
 * la21staefa and sc7 (2026-11). Since the fix the first picker save bootstraps them
 * (`coreBootstrapBlocks` in planEnableBlock); this script does the same without waiting for that save,
 * and repairs a tenant whose first save ran before the fix.
 *
 * It runs the callable's own server code (`applySelection` of apps/functions/src/tenant/
 * apply-feature-selection.ts, bundled from source) — same menu planning, same audit events. It refuses
 * an ESTABLISHED tenant (one that already stores any core block), because several of them leave a
 * core block such as `vcard` off on purpose.
 */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootRequire = createRequire(join(ROOT, 'package.json'));

function fail(msg) { console.error(msg); process.exit(1); }

function loadServerCode() {
  const esbuild = rootRequire('esbuild');
  const out = esbuild.buildSync({
    stdin: {
      contents: [
        "export { applySelection } from './apps/functions/src/tenant/apply-feature-selection';",
        "export { FEATURE_BLOCKS, coreBootstrapBlocks } from '@okr/tenant-util';",
      ].join('\n'),
      resolveDir: ROOT, loader: 'ts',
    },
    bundle: true, platform: 'node', format: 'cjs', target: 'node22', write: false, logLevel: 'silent',
    tsconfig: join(ROOT, 'tsconfig.base.json'),
    packages: 'external',
  });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, rootRequire);
  return mod.exports;
}

async function main() {
  const tenant = process.argv[2];
  if (!tenant || tenant.startsWith('--')) fail('Usage: node scripts/bootstrap-core-features.mjs <tenantId> [--write]');
  const write = process.argv.includes('--write');

  const { getApps, initializeApp } = rootRequire('firebase-admin/app');
  const { getFirestore } = rootRequire('firebase-admin/firestore');
  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
  const db = getFirestore();

  const config = await db.collection('app-config').doc(tenant).get();
  if (!config.exists) fail(`No app-config/${tenant}.`);
  const stored = config.get('enabledFeatures');
  const { applySelection, FEATURE_BLOCKS, coreBootstrapBlocks } = loadServerCode();
  const core = FEATURE_BLOCKS.filter((b) => b.core === true).map((b) => b.id);
  const todo = coreBootstrapBlocks(FEATURE_BLOCKS, stored).map((b) => b.id);

  console.log(`stored enabledFeatures (${Array.isArray(stored) ? stored.length : 'none'}): ${Array.isArray(stored) ? stored.join(', ') : '— legacy, reads as every block'}`);
  console.log(`core blocks: ${core.join(', ')}`);
  if (todo.length === 0) {
    console.log('Nothing to do: the tenant already stores core blocks (established) or has no enabledFeatures field (legacy).');
    return;
  }
  console.log(`would enable with all menu rows: ${todo.join(', ')}`);
  if (!write) { console.log('Dry run: nothing written. Add --write.'); return; }

  const { withheld } = await applySelection(db, FEATURE_BLOCKS, tenant, 'bootstrap-core-features', { enable: todo, disable: [] });
  const after = (await db.collection('app-config').doc(tenant).get()).get('enabledFeatures') ?? [];
  console.log(`done. now stored: ${after.length} blocks; missing core: ${core.filter((c) => !after.includes(c)).join(', ') || 'none'}`);
  if (withheld.length) console.log(`withheld by rollout: ${withheld.join(', ')}`);
}

main().catch((e) => fail(e.stack ?? String(e)));
