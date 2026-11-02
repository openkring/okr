#!/usr/bin/env node
// Guided release runbook: version bump + prod build + test gate + Firebase deploy + tag/push.
// Usage:
//   node scripts/release.mjs                          # interactive target picker
//   node scripts/release.mjs all <patch|minor|major> [flags]   # release all eight apps (release-all.mjs)
//   node scripts/release.mjs <app> none               # repair: re-deploy ONE app at the current,
//                                                     #   already tagged version (no bump/commit/tag)
//   node scripts/release.mjs <website> [kind]         # release one website (gates, bump, deploy)
//   node scripts/release.mjs functions               # deploy Cloud Functions (all, or prompted subset)
//   node scripts/release.mjs rules                   # deploy firestore + storage rules
// `all` flags: --native --yes --accept-drift --accept-menu-labels --dry-run --concurrency=N
//   --min-version=x.y.z --force-update. A new version of an app always goes through `all`.
// Deterministic spine; confirmations are interactive. `all` and a repair write the app-version
// Firestore doc themselves (firebase-admin, ADC); a website release still prints the value to apply.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { stampNgswVersion } from './stamp-ngsw-version.mjs';
import { parseReleaseArgs, repairKindProblem, appVersionPatch } from './release-all.logic.mjs';
import { releaseAll, writeAppVersion } from './release-all.mjs';
import {
  repoRoot, SITES, PROD_APP, run, capture, ask, confirm, closePrompts, abort, bump, readVersion, writeVersion,
  preflight, runGates, verifyLive, commitSubmoduleStamp, commitPointers,
} from './release-shared.mjs';

// ---- app release ---------------------------------------------------------
// A `*-app` is only ever released here as a repair (kind 'none', checked by main()): same version,
// no gates, no bump/commit/tag. A website runs the full flow (gates, bump prompt, deploy).
// `kindArg` pre-answers the bump prompt for a website.
async function releaseApp(app, kindArg = null) {
  const site = SITES[app];
  if (!site) abort(`Unknown app '${app}'. Known: ${Object.keys(SITES).join(', ')}`);
  if (!existsSync(join(repoRoot, `apps/${app}/.env`)))
    abort(`Missing apps/${app}/.env — required to source FIREBASE_WEBAPP_CONFIG for the prod build.`);

  console.log(`\n=== Releasing ${app} (site ${site}) ===`);

  const isApp = app.endsWith('-app');

  // 1. every pre-bump gate (tests, forms, popovers, i18n, menu labels, catalogue drift).
  //    A repair re-deploys an already released version, so it skips them.
  if (isApp) console.log('\n[1/6] Repair — pre-bump gates skipped (re-deploying an already released version).');
  else await runGates({ nonInteractive: false });

  // 2. version bump (confirm) — bump BEFORE build so the nx config cache busts
  const current = readVersion();
  // 'none' ships a SECOND app at the version the first app of this release just cut, so both
  // apps land on one number and one tag. It skips the bump, the release commit and the tag
  // (they already exist) — everything else, including the live-version verify, still runs.
  const kindAns = isApp ? 'none'
    : kindArg ? kindArg
      : (await ask(`\n[2/6] Bump version from ${current} — patch/minor/major/none? [patch] `)).toLowerCase() || 'patch';
  const kind = ['patch', 'minor', 'major', 'none'].includes(kindAns) ? kindAns : 'patch';
  const next = kind === 'none' ? current : bump(current, kind);
  if (kind === 'none') {
    console.log(`Keeping version ${current} — no bump, no release commit, no tag.`);
  } else {
    if (!(await confirm(`Set version ${current} -> ${next}?`, true))) abort('Aborted at version bump.');
    writeVersion(current, next);
    console.log(`package.json version -> ${next}`);
  }

  // 2b. stamp the version into the service worker's manifest, so clients running the OLD build
  //     read the incoming version off ngsw.json instead of the hand-updated Firestore doc.
  //     Lives in the app submodule — reverted below if the build/deploy fails.
  const stamped = isApp && stampNgswVersion(app, next);

  try {
    // 2c. Logo assets — regenerate every rendition from the tenant's single master and
    //     rewrite the manifest + index.html icon links. Must run BEFORE the build so the
    //     rewritten files are bundled. Non-fatal: if it fails (no ADC, master missing) the
    //     committed icons are still valid, so warn rather than abort a whole release.
    //     Websites have no manifest and no app icons.
    if (isApp) {
      console.log(`\n[2c/7] Logo assets for ${app}…`);
      try {
        run('node', ['scripts/gen-logo-assets.mjs', app]);
      } catch {
        console.log('  ⚠ Logo generation failed — continuing with the committed icons.');
      }
    }

    // 3. prod build (source .env so FIREBASE_WEBAPP_CONFIG is set for the prod config target)
    //    --skip-nx-cache is mandatory: a version bump is meant to bust the cache via the config
    //    target's input hash, but that has proven unreliable (the nx Cloud remote cache restored
    //    a prior dist/, shipping the OLD version — v6.4.64 went out as 6.4.63). A clean build is
    //    cheap insurance against silently deploying stale code. The post-deploy check below verifies.
    console.log(`\n[3/7] Building ${app} (production, --skip-nx-cache)…`);
    run('bash', ['-c', `rm -rf dist/apps/${app}; set -a; source ./apps/${app}/.env; set +a; pnpm nx build ${app} --configuration production --skip-nx-cache`]);

    // 3a. Bundle budget — the dashboard's static JS closure (gzip) may not grow by more than 5 %
    //     over perf-budget.json. This is what keeps spec 1.49's diet from eroding one feature at
    //     a time; a failed gate aborts before anything is deployed. Websites have no dashboard.
    if (app.endsWith('-app')) {
      console.log(`\n[3a/7] Bundle budget for ${app}…`);
      try { run('node', ['scripts/perf-budget.mjs', app]); }
      catch { throw new Error(`Bundle budget exceeded for ${app}. Run  node scripts/bundle-closure.mjs dist/apps/${app}/browser <lib>  to find the new static edge, or  node scripts/perf-budget.mjs ${app} --write  if the growth is intended.`); }
    }

    // 3b. OSS attribution — must run AFTER the build, because it assembles the
    //     `3rdpartylicenses.txt` that build just emitted. Generating it here (rather than
    //     committing it) is what keeps the attribution from drifting from what actually ships.
    //     Redundant for the websites, whose own `nx build` already produces it — idempotent
    //     and a few milliseconds, so it runs unconditionally rather than behind a condition.
    console.log(`\n[3b/7] Generating OSS attribution for ${app}…`);
    run('node', ['scripts/gen-attribution.mjs', app]);

    // 3c. Service-worker stamp — makes ngsw-worker.js differ per release, so installed apps pick
    //     up a new worker and with it the CURRENT CSP headers (a worker keeps the CSP of the day it
    //     was installed; see the script header). Before 4: the Sentry step re-hashes after it.
    if (app.endsWith('-app')) {
      console.log(`\n[3c/7] Stamping the service worker for ${app}…`);
      run('node', ['scripts/stamp-ngsw-worker.mjs', app]);
    }

    // 4. Sentry source maps — MUST run before deploy (injects debug IDs into the built JS,
    //    uploads maps, finalizes the scs@<version> release). Skipped if SENTRY_* not exported.
    console.log('\n[4/7] Sentry source maps');
    const hasSentry = ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT'].every((v) => process.env[v]);
    if (hasSentry) {
      run('node', ['scripts/sentry-sourcemaps.mjs', app]);
    } else {
      console.log('  ⚠ SENTRY_AUTH_TOKEN/SENTRY_ORG/SENTRY_PROJECT not set — source maps NOT uploaded.');
      console.log('    Stack traces for this release will be unminified in Sentry.');
      console.log(`    Hint: export them from the .env, then re-run: set -a && source ./apps/${app}/.env && set +a`);
      if (app === PROD_APP && !(await confirm('  Deploy the production app without source maps?', false)))
        abort('Aborted: export the SENTRY_* deploy vars, then re-run.');
    }

    // 5. deploy hosting (confirm — outward-facing)
    if (!(await confirm(`\n[5/7] Deploy ${app} to hosting:${site}?`, true))) abort('Aborted before deploy.');
    run('firebase', ['deploy', '--only', `hosting:${site}`]);

    // 5b. verify the LIVE bundle actually carries the new version — the only proof the deploy
    //     shipped fresh code (see the --skip-nx-cache note above).
    console.log(`\n     Verifying https://${site}.web.app serves v${next}…`);
    try {
      verifyLive(site, next);
    } catch (e) {
      console.error(`\n     ⚠ Post-deploy verification FAILED: ${e.message ?? e}`);
      if (!(await confirm('     Continue anyway (tag/push the release)?', false)))
        abort('Aborted after deploy: live site did not verify. Investigate before tagging.');
    }
  } catch (e) {
    run('git', ['checkout', '--', 'package.json']);
    if (stamped) run('git', ['-C', `apps/${app}`, 'checkout', '--', 'ngsw-config.json']);
    abort(`Build/deploy failed — reverted version bump. ${e.message ?? ''}`);
  }

  // 6. app-version doc. A repair (apps) writes it itself — only this app, only after the live
  //    verify above. A website still asks and prints the value to apply by hand.
  //    `deployed.<appId>` is what this release actually put live; `latestVersion` is the fleet-wide
  //    fallback for installations that don't maintain the map. `minVersion` is global — raising it
  //    to a version only one app has would force every other app's clients toward a build that was
  //    never deployed for them, so only raise it after all apps are on `next`.
  const appKey = app.replace(/-(app|website)$/, '');
  console.log('\n[6/7] app-version update');
  let appVersionPending = false;
  if (isApp) {
    const patch = appVersionPatch({ version: next, verifiedApps: [app], prodApp: PROD_APP });
    appVersionPending = !(await writeAppVersion(patch));
  } else if (await confirm(`Update app-version.deployed.${appKey} to ${next}? (names the version this app's update prompt shows)`, app === PROD_APP)) {
    const minAns = await ask('  minVersion — leave blank to keep unchanged; only raise it once ALL apps are on this version: ');
    appVersionPending = true;
    console.log('\n  ⚠ ACTION REQUIRED — this script does NOT write Firestore. YOU must apply this manually:');
    console.log('     Firestore doc  app-version/app-version  (default database):');
    console.log(`        deployed.${appKey}: "${next}"`);
    const fallbackNote = app === PROD_APP ? '' : ' — leave as is if another app is newer';
    console.log(`        latestVersion: "${next}"   (fleet-wide fallback${fallbackNote})`);
    console.log(`        minVersion:    ${minAns ? `"${minAns}"  (CHANGED — forces update below this, ALL apps)` : '(keep current)'}`);
    console.log('     via the Firebase console, the Firebase MCP firestore_update_document tool, or firebase-admin.');
    console.log('     Until you do this, deployed clients will NOT see the update prompt.');
  } else {
    console.log('  Skipped app-version update.');
  }

  // 7. commit + tag + push (confirm push — outward-facing)
  console.log('\n[7/8] Commit + tag');
  // Whether the submodule half below may push too. For 'none' there is no superproject commit
  // to gate on, so it asks in its own right.
  let push = false;
  if (kind === 'none') {
    console.log(`  Skipped — v${next} was already committed and tagged by the app that cut it.`);
    push = isApp ? await confirm(`Push the ${app} ngsw commit, its tag v${next}, and the pointer bump?`, true) : false;
  } else {
    run('git', ['add', 'package.json']);
    run('git', ['commit', '-o', 'package.json', '-m', `release: v${next}`]);
    run('git', ['tag', '-a', `v${next}`, '-m', `release v${next}`]);
    if (await confirm(`Push commit + tag v${next} to origin/main?`, true)) {
      run('git', ['push', 'origin', 'main', '--follow-tags']);
      push = true;
    } else {
      console.log(`  Not pushed. Push later with:  git push origin main --follow-tags`);
    }
  }

  if (isApp) {
    commitSubmoduleStamp(app, next, push);
    commitPointers([app], next, push);
  }

  console.log(`\n✔ ${app} released as v${next}.`);
  if (appVersionPending)
    console.log(`  ⚠ REMINDER: you still need to set app-version/app-version → deployed.${appKey} "${next}" in Firestore yourself (not done by this script).`);
}

// ---- functions -----------------------------------------------------------
// Delegates to scripts/deploy-functions.mjs (build + pin + prune + pnpm-pin canary).
async function releaseFunctions() {
  console.log('\n=== Deploy Cloud Functions ===  (no version bump, no tag)');
  const names = (await ask('Function names (space/comma-separated), or blank for ALL: ')).trim();
  if (!(await confirm(`Deploy ${names || 'ALL functions'}?`, true))) abort('Aborted.');
  run('node', ['scripts/deploy-functions.mjs', ...(names ? names.split(/[\s,]+/) : [])]);
  console.log('\n✔ Functions deployed. Commit any pending source changes separately.');
}

// ---- rules ---------------------------------------------------------------
async function releaseRules() {
  console.log('\n=== Deploy security rules ===  (no version bump, no tag)');
  if (await confirm('Deploy firestore:rules?', true)) run('firebase', ['deploy', '--only', 'firestore:rules']);
  if (await confirm('Deploy storage rules?', true)) run('firebase', ['deploy', '--only', 'storage']);
  console.log('\n✔ Rules deployed. Commit any pending rules-file changes separately.');
}

// ---- repair: code must equal the release tag --------------------------------
// `git diff --quiet` exits 1 on a difference; anything else (bad ref, git error) is not "equal".
const sameAsTag = (cwd, tag, pathspec = []) =>
  spawnSync('git', ['diff', '--quiet', tag, 'HEAD', ...(pathspec.length ? ['--', ...pathspec] : [])], { cwd }).status === 0;

/**
 * True when the code a repair would build is what the tag shipped. Superproject: everything but
 * `planning` and `apps` (the pointer-bump commit after the tag moves only gitlinks under apps/).
 * The app's submodule: HEAD against its own tag; a submodule without that tag is skipped.
 */
function repairMatchesTag(app, version) {
  const tag = `v${version}`;
  if (!sameAsTag(repoRoot, tag, ['.', ':(exclude)planning', ':(exclude)apps'])) return false;
  const sub = join(repoRoot, 'apps', app);
  const hasSubTag = spawnSync('git', ['-C', sub, 'tag', '-l', tag], { encoding: 'utf8' }).stdout?.trim();
  if (!hasSubTag) {
    console.log(`  (apps/${app} has no tag ${tag} — submodule code not compared with the tag.)`);
    return true;
  }
  return sameAsTag(sub, tag);
}

// ---- entry ---------------------------------------------------------------
const USAGE = `Usage:
  node scripts/release.mjs all <patch|minor|major> [--native] [--yes] [--accept-drift] [--accept-menu-labels]
                           [--dry-run] [--concurrency=N] [--min-version=x.y.z] [--force-update]
  node scripts/release.mjs <app> none        # repair: re-deploy one app at the current tagged version
  node scripts/release.mjs <website> [kind]
  node scripts/release.mjs functions | rules`;

async function main() {
  let opts;
  try { opts = parseReleaseArgs(process.argv.slice(2)); }
  catch (e) { abort(`${e.message}\n\n${USAGE}`); }

  let { target } = opts;
  if (!target) {
    console.log('\nRelease target:');
    console.log('  all        (eight apps)');
    Object.keys(SITES).forEach((a) => console.log(`  ${a}`));
    console.log('  functions  (Cloud Functions)\n  rules      (firestore + storage rules)');
    target = await ask('\nChoose target: ');
  }

  // The kind/tag check runs before anything else — before preflight's questions, any write or build.
  if (SITES[target] && target.endsWith('-app')) {
    if (!opts.kind) console.log(`No bump given — treating it as 'none': a single app is only repaired (re-deployed at the current tagged version).`);
    const kind = opts.kind ?? 'none';
    const tagExists = !!capture('git', ['tag', '-l', `v${readVersion()}`]);
    const version = readVersion();
    const matchesTag = !tagExists || repairMatchesTag(target, version);
    const problem = repairKindProblem({ app: target, kind, tagExists, matchesTag, tag: `v${version}` });
    if (problem) abort(problem);
  }

  if (target === 'all') { await releaseAll({ ...opts, target }); return; }

  await preflight();
  if (target === 'functions') await releaseFunctions();
  else if (target === 'rules') await releaseRules();
  else if (SITES[target]) await releaseApp(target, ['patch', 'minor', 'major', 'none'].includes(opts.kind) ? opts.kind : null);
  else abort(`Unknown target '${target}'.\n\n${USAGE}`);
}

main().then(closePrompts).catch((e) => abort(e.message ?? String(e)));
