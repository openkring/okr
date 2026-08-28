/**
 * Verifies that an app's App Check is actually usable — the two server-side facts that decide
 * whether a browser on that app's domain can mint a valid App Check token.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * WHY A DEDICATED CHECK, AND WHY NOT THE OBVIOUS ONE
 * ─────────────────────────────────────────────────────────────────────────────────────
 * When App Check is misconfigured for an app, Firebase Auth rejects sign-in and the app
 * renders that as "check your email and password". The credentials are fine; nothing in the
 * UI hints at App Check. On 2026-08-28 this cost an afternoon on `okr-app`.
 *
 * The tempting probe — POST identitytoolkit accounts:signInWithPassword with the app's API
 * key — DOES NOT WORK as a diagnostic. A raw curl never carries an App Check token, so a
 * correctly configured app answers exactly like a broken one:
 *
 *     scs (working) -> 401 "Firebase App Check token is invalid."
 *     okr (broken)  -> 401 "Firebase App Check token is invalid."
 *
 * Do not use it to decide anything. Only a real browser can mint a token, so the usable
 * check is on the configuration itself. Two independent halves, and BOTH are required —
 * okr-app had the second but not the first:
 *
 *   1. the app's hosting domain is in the shared reCAPTCHA key's allowedDomains
 *   2. the app's appId is bound to that site key (this IS "registering App Check")
 *
 * These mirror steps 3(a) and 3(b) of the `provision-tenant` skill.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * USAGE
 * ─────────────────────────────────────────────────────────────────────────────────────
 *   node scripts/verify-appcheck.mjs okr-app
 *   node scripts/verify-appcheck.mjs --all      # every app in firebase.json
 *
 * Exits non-zero if any check fails, so it can gate a release.
 * Requires: gcloud auth application-default login, and gcloud CLI on PATH.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const PROJECT = 'bkaiser-org';
const KEY_ID = '6LdDYx8qAAAAALNyLCFAl6jc3yQwvaBcOms5CQaE'; // bkaiser-org-app-check (the ONLY key)

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node scripts/verify-appcheck.mjs <app>|--all');
  process.exit(1);
}

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();

/** hosting site id for an app, read from firebase.json rather than a second hand-kept list. */
function sitesFromFirebaseJson() {
  const cfg = JSON.parse(readFileSync('firebase.json', 'utf8'));
  const out = new Map();
  for (const h of cfg.hosting ?? []) {
    const m = /^dist\/apps\/([^/]+)\/browser$/.exec(h.public ?? '');
    if (m && h.site) out.set(m[1], h.site);
  }
  return out;
}

function appIdOf(app) {
  // FIREBASE_WEBAPP_CONFIG is a MULTI-LINE single-quoted JSON blob, so a line-based parse of the
  // .env does not work. Source the file the same way the build does (`set -a`, because the file
  // carries no `export` statements) and read the variable back out of the environment.
  const envPath = `apps/${app}/.env`;
  if (!existsSync(envPath)) return undefined;
  try {
    return sh('bash', ['-c',
      `set -a; . ./${envPath}; set +a; node -e 'try{process.stdout.write(JSON.parse(process.env.FIREBASE_WEBAPP_CONFIG||"{}").appId||"")}catch(e){}'`,
    ]) || undefined;
  } catch {
    return undefined;
  }
}

const sites = sitesFromFirebaseJson();
const apps = arg === '--all' ? [...sites.keys()].filter((a) => a.endsWith('-app')) : [arg];

const allowed = new Set(
  JSON.parse(sh('gcloud', ['recaptcha', 'keys', 'describe', KEY_ID, `--project=${PROJECT}`, '--format=json']))
    .webSettings.allowedDomains
);
const token = sh('gcloud', ['auth', 'print-access-token']);

let failed = 0;
for (const app of apps) {
  const site = sites.get(app);
  const appId = appIdOf(app);
  console.log(`\n${app}`);

  if (!site) { console.log('  ✗ no hosting entry in firebase.json — the app cannot be deployed at all'); failed++; continue; }
  if (!appId) { console.log(`  ⚠ no appId (apps/${app}/.env missing or unreadable) — cannot check the binding`); failed++; continue; }

  // 1. domain allow-list — without this the browser cannot mint a token on that origin
  const domain = `${site}.web.app`;
  if (allowed.has(domain)) {
    console.log(`  ✓ domain allow-listed: ${domain}`);
  } else {
    console.log(`  ✗ domain NOT allow-listed: ${domain}`);
    console.log('      → provision-tenant step 3(a). NOTE: `gcloud recaptcha keys update --domains`');
    console.log('        REPLACES the list — build the new one from the API output, never by hand.');
    failed++;
  }

  // 2. appId bound to the site key. The x-goog-user-project header is REQUIRED; without it the
  //    call fails with a misleading ADC error for every app, including correctly configured ones.
  let bound;
  try {
    bound = JSON.parse(sh('curl', ['-s',
      '-H', `Authorization: Bearer ${token}`,
      '-H', `x-goog-user-project: ${PROJECT}`,
      `https://firebaseappcheck.googleapis.com/v1/projects/${PROJECT}/apps/${appId}/recaptchaEnterpriseConfig`,
    ]));
  } catch { bound = { error: { message: 'request failed' } }; }

  if (bound.siteKey === KEY_ID) {
    console.log(`  ✓ appId bound to the site key (ttl ${bound.tokenTtl ?? '-'})`);
  } else if (bound.error) {
    console.log(`  ✗ App Check binding unreadable: ${String(bound.error.message).slice(0, 90)}`);
    failed++;
  } else {
    console.log(`  ✗ appId bound to a DIFFERENT site key: ${bound.siteKey}`);
    failed++;
  }
}

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
