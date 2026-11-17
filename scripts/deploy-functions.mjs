#!/usr/bin/env node
// Deploy Cloud Functions through the Cloud Build buildpack — only those whose code changed since
// their last deploy — with a pnpm-pin safety canary and a per-function result.
//
// WHAT IS DEPLOYED. All functions ship as one esbuild bundle, so firebase-tools' own skip hash
// changes for every function on every edit. scripts/deploy-functions.logic.mjs hashes each
// function's own closure instead (defining file + everything it imports, static or dynamic;
// external package versions; its endpoint config; the shared init/build setup). A function is
// deployed when that hash differs from the one recorded at its last deploy (Firestore
// `function-deploy-state/{name}`), when it is new, not ACTIVE, has no record, was deployed by
// something else since (firebase's own hash label moved), or pins an older version of a secret
// than the latest. Live functions missing from the source are listed, never deleted.
//
// HOW. Batches (default 20) with a pause in between; after each batch the live functions are read
// back and only those with a fresh ACTIVE revision count as deployed (the CLI exits 0 even when
// single functions fail on the 429 mutation quota or the europe-west6 CPU quota). Failed names are
// retried in small batches. The run ends with a per-function list and exits 1 if any failed.
//
// PNPM PIN. The buildpack installs prod deps with the pnpm version pinned in the deployed
// package.json. That pin is DECOUPLED from your local dev pnpm (root packageManager): it defaults
// to the last version that deployed successfully (scripts/functions-pnpm-verified.json),
// overridable with FUNCTIONS_PNPM. To move to a new pnpm version, set FUNCTIONS_PNPM=<v>; the
// script deploys ONE trivial function (canary) first, then records it as verified.
// Why decoupled: pnpm 11 made "ignored build scripts" a FATAL error (ERR_PNPM_IGNORED_BUILDS),
// which the buildpack can't be told to ignore. pnpm 10.33.2 only warns and exits 0.
//
// Usage:
//   node scripts/deploy-functions.mjs                # deploy the CHANGED functions
//   node scripts/deploy-functions.mjs --dry-run      # list what would deploy and why; deploy nothing
//   node scripts/deploy-functions.mjs fnA fnB        # deploy these (plus nothing else), always
//   node scripts/deploy-functions.mjs --all          # deploy every function
//   node scripts/deploy-functions.mjs --adopt        # record functions without a record as current when
//                                                    # their live revision is newer than every commit to
//                                                    # their sources (bootstrap); deploy the rest
// Env:
//   FUNCTIONS_PNPM=11.9.0     # try a different buildpack pin (canary-gated)
//   FUNCTIONS_CANARY=getEcho  # override the canary function (default: getEcho)
//   FUNCTIONS_FORCE=1         # pass --force to every batch (batches with a retry:true trigger get it anyway)
//   FUNCTIONS_BATCH=20        # functions per firebase deploy call
//   FUNCTIONS_PAUSE=60        # seconds between batches (retries: batches of 12, 90 s)
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { transformSync } from 'esbuild';
import { adoptable, batches, closure, deployedSince, functionHash, globalRoots, mainSkeleton, planDeploy, resolveDefinition,
  resolveSpecifier, runtimeHash, sha, stableStringify, parseExports } from './deploy-functions.logic.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(repoRoot, 'dist/apps/functions');
const verifiedPath = join(repoRoot, 'scripts/functions-pnpm-verified.json');
const MAIN = 'apps/functions/src/main.ts';
const PROJECT = JSON.parse(readFileSync(join(repoRoot, '.firebaserc'), 'utf8')).projects?.default;
const STATE = 'function-deploy-state';

// Silence the DEP0040 "punycode is deprecated" warning from firebase-tools. Node >= 21.3.
process.env.NODE_OPTIONS = ['--disable-warning=DEP0040', process.env.NODE_OPTIONS].filter(Boolean).join(' ');

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', cwd: repoRoot, ...opts });
const capture = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 256 << 20, ...opts });
const abort = (msg) => { console.error(`\n✖ ${msg}`); process.exit(1); };
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const DRY = flag('--dry-run');
const ALL = flag('--all');
const ADOPT = flag('--adopt');
const VERBOSE = flag('--verbose');
const unknown = argv.filter((a) => a.startsWith('--') && !['--dry-run', '--all', '--adopt', '--verbose'].includes(a));
if (unknown.length) abort(`Unbekannte Option: ${unknown.join(' ')}`);
const named = argv.filter((a) => !a.startsWith('--')).flatMap((a) => a.split(',')).map((s) => s.trim()).filter(Boolean);
const BATCH = Number(process.env.FUNCTIONS_BATCH || 20);
const PAUSE = Number(process.env.FUNCTIONS_PAUSE ?? 60);

const verified = JSON.parse(readFileSync(verifiedPath, 'utf8')).pnpm;
const pin = process.env.FUNCTIONS_PNPM || verified;
const canary = process.env.FUNCTIONS_CANARY || 'getEcho';

function upgradeFailedHelp(stage) {
  return [
    `${stage} FAILED with pnpm@${pin} (set via FUNCTIONS_PNPM).`,
    `  pnpm 11+ makes ignored build scripts fatal (ERR_PNPM_IGNORED_BUILDS) and the buildpack`,
    `  can't be told to ignore them, so this version likely isn't usable for functions yet.`,
    `  The last known-good pin is pnpm@${verified}.`,
    `  Recover: unset FUNCTIONS_PNPM (or set FUNCTIONS_PNPM=${verified}) and re-run.`,
  ].join('\n');
}

// ---- Google APIs (REST with the gcloud user token) ---------------------------------------------
let token;
const auth = () => (token ??= capture('gcloud', ['auth', 'print-access-token']).trim());
async function gapi(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${auth()}`, 'x-goog-user-project': PROJECT, 'Content-Type': 'application/json', ...init.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${url.split('?')[0]} → ${res.status} ${body.error?.message ?? ''}`);
  return body;
}

/** Live functions in all regions: { name: GCF v2 function }. */
async function listLive() {
  const out = {};
  let page = '';
  do {
    const r = await gapi(`https://cloudfunctions.googleapis.com/v2/projects/${PROJECT}/locations/-/functions?pageSize=1000${page ? `&pageToken=${page}` : ''}`);
    for (const f of r.functions ?? []) out[f.name.split('/').pop()] = f;
    page = r.nextPageToken;
  } while (page);
  return out;
}

const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const toFields = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)
  .map(([k, v]) => [k, typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) }]));
const fromFields = (f = {}) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.stringValue ?? v.booleanValue ?? null]));

async function readState() {
  const out = {};
  let page = '';
  do {
    const r = await gapi(`${FS}/${STATE}?pageSize=300${page ? `&pageToken=${page}` : ''}`);
    for (const d of r.documents ?? []) out[d.name.split('/').pop()] = fromFields(d.fields);
    page = r.nextPageToken;
  } while (page);
  return out;
}

async function writeState(records) {
  const entries = Object.entries(records);
  for (let i = 0; i < entries.length; i += 400) {
    await gapi(`${FS}:commit`, { method: 'POST', body: JSON.stringify({
      writes: entries.slice(i, i + 400).map(([name, rec]) => ({ update: { name: `projects/${PROJECT}/databases/(default)/documents/${STATE}/${name}`, fields: toFields(rec) } })),
    }) });
  }
}

/** Latest version number per secret: { NAME: '4' }. */
async function latestSecretVersions(names) {
  const out = {};
  await Promise.all([...names].map(async (n) => {
    try {
      const v = await gapi(`https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets/${n}/versions/latest`);
      out[n] = v.name.split('/').pop();
    } catch (e) { console.warn(`  ⚠ secret ${n}: ${e.message}`); }
  }));
  return out;
}

// ---- 1. Build, pin, prune ----------------------------------------------------------------------
run('pnpm', ['run', 'build:functions']);
// The metafile (apps/functions/project.json "metafile": true) must not ship to Cloud Build.
const metaPath = join(repoRoot, 'dist/functions-meta.json');
renameSync(join(distDir, 'meta.json'), metaPath);
const distPkgPath = join(distDir, 'package.json');
const distPkg = JSON.parse(readFileSync(distPkgPath, 'utf8'));
distPkg.packageManager = `pnpm@${pin}`;
writeFileSync(distPkgPath, JSON.stringify(distPkg, null, 2));
try {
  // NOTE: do NOT pass --ignore-workspace here. The artifact ships its own pnpm-workspace.yaml
  // (supply-chain `overrides` + `dangerouslyAllowAllBuilds`); ignoring it drops the overrides
  // from the lockfile → ERR_PNPM_LOCKFILE_CONFIG_MISMATCH in the buildpack.
  run('pnpm', ['install', '--prod', '--no-frozen-lockfile'], { cwd: distDir });
} catch (e) {
  if (pin !== verified) abort(upgradeFailedHelp('Local prune'));
  throw e;
}

// ---- 2. Hash every function ---------------------------------------------------------------------
console.log('\nAnalysing which functions changed…');
const manifestPath = join(repoRoot, 'dist/functions-manifest.json');
run('node', [join(distDir, 'node_modules/firebase-functions/lib/bin/firebase-functions.js'), '.'], {
  cwd: distDir, stdio: ['ignore', 'ignore', 'pipe'],
  env: { ...process.env, GCLOUD_PROJECT: PROJECT, FUNCTIONS_MANIFEST_OUTPUT_PATH: manifestPath },
});
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const { inputs } = JSON.parse(readFileSync(metaPath, 'utf8'));
const has = (f) => f in inputs;
const readFile = (f) => readFileSync(join(repoRoot, f), 'utf8');

const outputInputs = Object.values(JSON.parse(readFileSync(metaPath, 'utf8')).outputs)[0]?.inputs ?? {};
const transform = (text, path) => transformSync(text, {
  loader: path.endsWith('.tsx') ? 'tsx' : path.endsWith('.ts') ? 'ts' : 'js', minifyWhitespace: true, legalComments: 'none',
  tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
}).code;
const fileHashes = new Map();
const fileHash = (f) => {
  if (!fileHashes.has(f)) {
    fileHashes.set(f, runtimeHash({ path: f, text: readFileSync(join(repoRoot, f), 'utf8'), bytesInOutput: outputInputs[f]?.bytesInOutput, transform }));
  }
  return fileHashes.get(f);
};
const versionOf = (pkg) => {
  try { return JSON.parse(readFileSync(join(distDir, 'node_modules', pkg, 'package.json'), 'utf8')).version; } catch { return 'missing'; }
};
const dirHash = (dir) => {
  if (!existsSync(dir)) return null;
  const walk = (d) => readdirSync(d).sort().flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [[relative(dir, join(d, n)), sha(readFileSync(join(d, n)))]]));
  return sha(stableStringify(walk(dir)));
};

// Which main.ts imports carry functions, and where each function is defined.
const mainExports = parseExports(readFile(MAIN), MAIN);
const functionModules = new Set();
for (const e of mainExports.exports.values()) if (e.kind === 'from') functionModules.add(resolveSpecifier(MAIN, e.spec, has));
for (const s of mainExports.stars) functionModules.add(resolveSpecifier(MAIN, s, has));
const projectJson = JSON.parse(readFile('apps/functions/project.json'));
const shared = closure(inputs, globalRoots(inputs, MAIN, functionModules));
const globalHash = sha(stableStringify({
  shared: functionHash({ files: shared.files, externals: shared.externals, endpoint: null, globalHash: '', fileHash, versionOf }).src,
  main: sha(mainSkeleton(readFile(MAIN))),
  build: projectJson.targets.build.options,
  prod: projectJson.targets.build.configurations?.production,
  pin, node: distPkg.engines?.node,
  firebase: JSON.parse(readFile('firebase.json')).functions,
  assets: dirHash(join(repoRoot, 'apps/functions/src/assets')),
  params: manifest.params ?? [], requiredAPIs: manifest.requiredAPIs ?? [],
}));

const local = {};
const closures = {};
const unresolved = [];
for (const [name, endpoint] of Object.entries(manifest.endpoints)) {
  const def = resolveDefinition(endpoint.entryPoint ?? name, MAIN, { readFile, has });
  if (!def) unresolved.push(name);
  const c = closure(inputs, [def ?? MAIN]); // unresolvable → the whole bundle (always safe)
  closures[name] = c.files;
  local[name] = functionHash({ files: c.files, externals: c.externals, endpoint, globalHash, fileHash, versionOf });
}
if (unresolved.length) console.warn(`  ⚠ ${unresolved.length} function(s) not traced to their file, hashed over the whole bundle: ${unresolved.join(', ')}`);
const unknownNamed = named.filter((n) => !local[n]);
if (unknownNamed.length) abort(`Nicht im Quellcode: ${unknownNamed.join(', ')}`);

// ---- 3. Plan --------------------------------------------------------------------------------------
const [live, state] = await Promise.all([listLive(), readState()]);
const secretNames = new Set(Object.values(live).flatMap((f) => (f.serviceConfig?.secretEnvironmentVariables ?? []).map((s) => s.secret)));
const latestSecrets = await latestSecretVersions(secretNames);
const plan = planDeploy({ local, live, state, latestSecrets, forced: named, all: ALL });
// Named functions: deploy exactly those.
if (named.length) plan.deploy = plan.deploy.filter((d) => named.includes(d.name));

const head = capture('git', ['rev-parse', 'HEAD']).trim();
const dirtyFiles = new Set(capture('git', ['status', '--porcelain', '--untracked-files=all']).split('\n').filter(Boolean).map((l) => l.slice(3).split(' -> ').pop()));
const record = (name, liveFn, extra = {}) => ({
  ...local[name], fbHash: liveFn.labels?.['firebase-functions-hash'], updateTime: liveFn.updateTime, commit: head,
  dirty: [...closures[name]].some((f) => dirtyFiles.has(f)), recordedAt: new Date().toISOString(), ...extra,
});

// Bootstrap: functions whose only reason is a missing/foreign record and whose live revision is newer
// than every commit to their sources.
if (ADOPT) {
  const times = new Map();
  let current = null;
  for (const line of capture('git', ['log', '--format=%x01%cI', '--name-only', '--', 'apps/functions', 'libs', 'pnpm-lock.yaml', 'scripts/functions-pnpm-verified.json']).split('\n')) {
    if (line.startsWith('\x01')) current = line.slice(1);
    else if (line && !times.has(line)) times.set(line, current);
  }
  const lastChange = (f) => times.get(f.includes('node_modules/') ? 'pnpm-lock.yaml' : f) ?? null;
  const SOFT = new Set(['no deploy record', 'deployed outside this script since']);
  plan.adopted = [];
  const adopted = {};
  plan.deploy = plan.deploy.filter(({ name, reasons }) => {
    if (named.length || ALL || !reasons.every((r) => SOFT.has(r))) return true;
    const files = [...closures[name]].filter((f) => f !== MAIN).concat(['scripts/functions-pnpm-verified.json']);
    if (!adoptable({ updateTime: live[name]?.updateTime, files, lastChange, dirty: new Set([...dirtyFiles].filter((f) => f !== MAIN)) })) return true;
    adopted[name] = record(name, live[name], { adopted: true });
    plan.adopted.push(name);
    return false;
  });
  if (!DRY && Object.keys(adopted).length) await writeState(adopted);
}

// "Why" detail for code changes: files of the closure that changed since the recorded commit.
const diffs = new Map();
const changedFiles = (name) => {
  const c = state[name]?.commit;
  if (!c) return [];
  if (!diffs.has(c)) {
    try { diffs.set(c, new Set([...capture('git', ['diff', '--name-only', c]).split('\n').filter(Boolean), ...dirtyFiles])); } catch { diffs.set(c, new Set()); }
  }
  return [...closures[name]].filter((f) => diffs.get(c).has(f));
};

console.log(`\n${Object.keys(local).length} functions in the source, ${plan.deploy.length} to deploy, ${plan.skip.length} unchanged${plan.adopted ? `, ${plan.adopted.length} adopted as current (live revision newer than every commit to their sources)` : ''}.`);
const wrap = (names) => names.reduce((lines, n) => {
  const last = lines.at(-1);
  if (last && last.length + n.length < 100) lines[lines.length - 1] = `${last}, ${n}`; else lines.push(n);
  return lines;
}, []).map((l) => `    ${l}`).join('\n');
const byReason = Object.groupBy(plan.deploy, (d) => d.reasons.join(', '));
for (const [why, list] of Object.entries(byReason)) {
  console.log(`\n  ${why} (${list.length}):`);
  if (!why.includes('code')) { console.log(wrap(list.map((d) => d.name))); continue; }
  for (const { name } of list) {
    const files = changedFiles(name);
    const shown = files.slice(0, VERBOSE ? files.length : 3).join(', ');
    console.log(`    ${name}${files.length ? `  ← ${shown}${files.length > 3 && !VERBOSE ? ` +${files.length - 3}` : ''}` : ''}`);
  }
}
if (plan.orphans.length) console.log(`\n  Live but no longer in the source (not deleted — firebase functions:delete <name> --region=europe-west6):\n    ${plan.orphans.join(', ')}`);

if (DRY) { console.log('\n(dry run — nothing deployed)'); process.exit(0); }
if (!plan.deploy.length) { console.log('\n✔ Nothing to deploy.'); process.exit(0); }

// ---- 4. Canary (only when trying a pin other than the last-verified one) -------------------------
if (pin !== verified) {
  console.log(`\n⚠ Trying buildpack pnpm pin ${verified} → ${pin}. Canary-deploying '${canary}' to verify the buildpack…`);
  try { run('firebase', ['deploy', '--only', `functions:${canary}`]); } catch { abort(upgradeFailedHelp('Canary build')); }
  writeFileSync(verifiedPath, JSON.stringify({ pnpm: pin, _comment: JSON.parse(readFileSync(verifiedPath, 'utf8'))._comment }, null, 2) + '\n');
  console.log(`\n✔ Canary passed. Recorded pnpm@${pin} as verified — commit scripts/functions-pnpm-verified.json.`);
}

const targets = plan.deploy.map((d) => d.name);

// Every function that binds the receiver's secrets needs WEBHOOK_SELFTEST_SECRET (spec 1.143).
const SELFTEST_SECRET_USERS = ['webhooks', 'webhookSelftestScheduled', 'runWebhookSelftestNow'];
if (targets.some((t) => SELFTEST_SECRET_USERS.includes(t))) {
  try {
    execFileSync('gcloud', ['secrets', 'describe', 'WEBHOOK_SELFTEST_SECRET', `--project=${PROJECT}`], { stdio: 'ignore' });
  } catch {
    abort('Secret WEBHOOK_SELFTEST_SECRET fehlt (oder gcloud ist nicht angemeldet). Setzen mit:\n  firebase functions:secrets:set WEBHOOK_SELFTEST_SECRET   # beliebiger zufälliger Wert');
  }
}

// ---- 5. Deploy in batches, verify each function against the live revision -----------------------
const retrying = new Set(Object.entries(manifest.endpoints).filter(([, e]) => e.eventTrigger?.retry).map(([n]) => n));
const ok = new Set();
const errors = {};
async function deployRound(names, size, pause, label) {
  const groups = batches(names, size);
  for (const [i, group] of groups.entries()) {
    const force = process.env.FUNCTIONS_FORCE === '1' || group.some((n) => retrying.has(n)) ? ['--force'] : [];
    const start = new Date().toISOString();
    console.log(`\n${label} ${i + 1}/${groups.length}: ${group.join(', ')}${force.length ? ' (--force)' : ''}`);
    try { run('firebase', ['deploy', '--only', group.map((n) => `functions:${n}`).join(','), ...force]); } catch (e) { errors[group.join()] = e.message; }
    const now = await listLive();
    const done = {};
    for (const n of group) if (deployedSince(now[n], start)) { ok.add(n); done[n] = record(n, now[n]); }
    if (Object.keys(done).length) await writeState(done);
    console.log(`  → ${Object.keys(done).length}/${group.length} updated`);
    if (i < groups.length - 1 && pause) await sleep(pause);
  }
}

console.log(`\nDeploying ${targets.length} function(s) in batches of ${BATCH} (buildpack pnpm@${pin})…`);
await deployRound(targets, BATCH, PAUSE, 'Batch');
for (let round = 1; round <= 2; round++) {
  const failed = targets.filter((n) => !ok.has(n));
  if (!failed.length) break;
  console.log(`\n${failed.length} function(s) not updated — retry ${round}/2 in batches of 12 after 90 s…`);
  await sleep(90);
  await deployRound(failed, 12, 90, `Retry ${round}`);
}

// ---- 6. Report ----------------------------------------------------------------------------------
const failed = targets.filter((n) => !ok.has(n));
console.log(`\n=== Functions deploy: ${ok.size} updated, ${failed.length} failed, ${plan.skip.length} unchanged (skipped) ===`);
for (const n of targets) console.log(`  ${ok.has(n) ? '✔' : '✖'} ${n}`);
if (failed.length) {
  console.log(`\n✖ Still serving the previous revision: ${failed.join(' ')}`);
  console.log('  Re-run `pnpm run deploy:functions` later — it picks up exactly these again (429 / europe-west6 CPU quota clear over time).');
}

// Receiver self-test (spec 1.143) when the deploy touched the webhook path.
const SELFTEST_TRIGGERS = ['webhooks', 'onWebhookEvent', 'webhookSelftestScheduled'];
if ([...ok].some((t) => SELFTEST_TRIGGERS.includes(t))) {
  const job = 'firebase-schedule-webhookSelftestScheduled-europe-west6';
  try {
    run('gcloud', ['scheduler', 'jobs', 'run', job, '--location=europe-west6', `--project=${PROJECT}`]);
    console.log('\n✔ Webhook-Selbsttest gestartet — Ergebnis in ~1 min auf der AOC-Statusseite («Webhook-Empfang»).');
  } catch {
    console.error(`\n⚠ Webhook-Selbsttest konnte nicht gestartet werden (gcloud scheduler jobs run ${job}). Deploy bleibt bestehen.`);
  }
}
process.exit(failed.length ? 1 : 0);
