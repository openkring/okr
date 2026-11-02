// Pure logic for the all-apps release (scripts/release-all.mjs). No fs, no child_process, no
// network: everything here takes plain values and returns plain values, so it is unit-tested in
// scripts/release-all.logic.test.mjs and the orchestrator only wires it to the outside world.

const SEMVER = /^\d+\.\d+\.\d+$/;
const SENTRY_KEYS = ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT'];

// ---- arguments -----------------------------------------------------------
export function parseReleaseArgs(argv) {
  const out = {
    target: null, kind: null, native: false, yes: false, acceptDrift: false,
    acceptMenuLabels: false, dryRun: false, failAt: null, concurrency: 3,
    minVersion: null, forceUpdate: false,
  };
  const flags = {
    '--native': 'native', '--yes': 'yes', '--accept-drift': 'acceptDrift',
    '--accept-menu-labels': 'acceptMenuLabels', '--dry-run': 'dryRun', '--force-update': 'forceUpdate',
  };
  const positional = [];
  for (const a of argv) {
    if (flags[a]) out[flags[a]] = true;
    else if (a.startsWith('--fail-at=')) out.failAt = a.slice('--fail-at='.length);
    else if (a.startsWith('--concurrency=')) {
      const v = a.slice('--concurrency='.length);
      if (!/^\d+$/.test(v) || Number(v) < 1) throw new Error(`Invalid --concurrency: ${v} (expected an integer >= 1)`);
      out.concurrency = Number(v);
    } else if (a.startsWith('--min-version=')) {
      const v = a.slice('--min-version='.length);
      if (!SEMVER.test(v)) throw new Error(`Invalid --min-version: ${v} (expected x.y.z)`);
      out.minVersion = v;
    } else if (a.startsWith('--')) throw new Error(`Unknown flag: ${a}`);
    else positional.push(a);
  }
  if (positional.length > 2) throw new Error(`Unexpected argument: ${positional[2]}`);
  [out.target = null, out.kind = null] = positional;
  return out;
}

// ---- single-app repair -----------------------------------------------------
// A single app is only ever re-deployed at the version `all` already cut and tagged ("repair");
// a new version always goes through `all`. Websites keep their own bump flow. null = fine.
export function repairKindProblem({ app, kind, tagExists, matchesTag = true, tag = 'v<version>' }) {
  if (!app.endsWith('-app')) return null;
  if (kind !== 'none')
    return `A new version goes through \`all\`: node scripts/release.mjs all <patch|minor|major>. A single app is only re-deployed at the current version: node scripts/release.mjs ${app} none.`;
  if (!tagExists)
    return 'Repair re-deploys the version `all` already cut, but the current version has no tag. Release through `all` first.';
  if (!matchesTag)
    return `The working tree does not match the release tag ${tag}: a repair must build exactly what the tag shipped. Check out ${tag} (e.g. in a clean worktree: git worktree add ../repair ${tag}) or release through \`all\`.`;
  return null;
}

// ---- concurrency ---------------------------------------------------------
// Runs worker(item) for every item with at most `limit` in flight. Never rejects: a throwing
// (or synchronously throwing) worker becomes { ok: false, error }. Results are in input order.
export async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      const item = items[i];
      const t0 = Date.now();
      try {
        await worker(item);
        results[i] = { item, ok: true, error: null, ms: Date.now() - t0 };
      } catch (error) {
        results[i] = { item, ok: false, error, ms: Date.now() - t0 };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, lane));
  return results;
}

// ---- .env inspection -----------------------------------------------------
// `KEY=value` or `export KEY=value`, KEY at the start of a line. Lines inside a multi-line quoted
// value (the indented JSON of FIREBASE_WEBAPP_CONFIG) never match.
const ASSIGN = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

export function missingSentryVars(envText) {
  const set = new Set();
  for (const line of envText.split('\n')) {
    const m = ASSIGN.exec(line);
    if (m && m[2].trim().replace(/^(['"])(.*)\1$/, '$2').trim() !== '') set.add(m[1]);
  }
  return SENTRY_KEYS.filter((k) => !set.has(k));
}

export function appEnvKeys(envTexts) {
  const keys = new Set();
  for (const text of envTexts) {
    for (const line of text.split('\n')) {
      if (line.trimStart().startsWith('#')) continue;
      const m = ASSIGN.exec(line);
      if (m) keys.add(m[1]);
    }
  }
  return keys;
}

// Real apps/*/.env files hold the config as multi-line JSON in single quotes:
//   FIREBASE_WEBAPP_CONFIG='{\n  "apiKey": "...",\n  "appId": "...", ...\n}'
// A one-line form and an unquoted form are accepted too.
export function firebaseAppId(envText) {
  const m = /^\s*(?:export\s+)?FIREBASE_WEBAPP_CONFIG=(['"]?)/m.exec(envText);
  if (!m) return null;
  const start = m.index + m[0].length;
  let raw;
  if (m[1] === "'") {
    const end = envText.indexOf("'", start);
    raw = envText.slice(start, end === -1 ? undefined : end);
  } else {
    const eol = envText.indexOf('\n', start);
    raw = envText.slice(start, eol === -1 ? undefined : eol);
  }
  try {
    const id = JSON.parse(raw).appId;
    if (typeof id === 'string' && id) return id;
  } catch { /* fall through to the pattern */ }
  return /"appId"\s*:\s*"([^"]+)"/.exec(raw)?.[1] ?? null;
}

// ---- built bundle check --------------------------------------------------
export function bundleConfigProblem(bundleText, ownAppId, otherAppIds) {
  if (!ownAppId) return 'cannot check the bundle: this app has no appId in its FIREBASE_WEBAPP_CONFIG';
  if (!bundleText.includes('production:!0')) return 'bundle is a development build (production:!0 not found)';
  const foreign = otherAppIds.find((id) => id && bundleText.includes(id));
  if (foreign) return `bundle contains another app's id (${foreign})`;
  if (!bundleText.includes(ownAppId)) return `bundle does not contain its own appId (${ownAppId})`;
  return null;
}

// ---- app-version doc -----------------------------------------------------
// Field paths for firestore.doc('app-version/app-version').update(...). The deployed.<key> key is
// the app name without "-app" (same as appKey in release.mjs). latestVersion only moves when the
// prod app itself was verified, since only its users see the in-app update prompt.
export function appVersionPatch({ version, verifiedApps, prodApp, minVersion, forceUpdate }) {
  const patch = {};
  for (const app of verifiedApps) patch[`deployed.${app.replace(/-app$/, '')}`] = version;
  if (verifiedApps.includes(prodApp)) patch.latestVersion = version;
  if (minVersion) patch.minVersion = minVersion;
  if (forceUpdate === true) patch.forceUpdate = true;
  return patch;
}

// ---- native platforms ----------------------------------------------------
export function nativeTargets(apps, exists) {
  const out = [];
  for (const app of apps) {
    for (const platform of ['android', 'ios']) {
      if (exists(`apps/${app}/${platform}`)) out.push({ app, platform });
    }
  }
  return out;
}

// ---- summary -------------------------------------------------------------
const mmss = (ms) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function formatSummary(rows) {
  // wall-clock: rows without an app run alone and add up; rows of one step across apps run in
  // parallel, so that step contributes only its slowest app.
  const solo = rows.filter((r) => !r.app).reduce((n, r) => n + r.ms, 0);
  const perStep = new Map();
  for (const r of rows) if (r.app) perStep.set(r.step, Math.max(perStep.get(r.step) ?? 0, r.ms));
  const total = solo + [...perStep.values()].reduce((n, ms) => n + ms, 0);

  const w = (key, min) => Math.max(min, ...rows.map((r) => r[key].length));
  const wStep = w('step', 4);
  const wApp = w('app', 3);
  const line = (step, app, time, status) =>
    `${step.padEnd(wStep)}  ${app.padEnd(wApp)}  ${time.padStart(6)}  ${status}`;
  return [
    line('step', 'app', 'time', 'result'),
    ...rows.map((r) => line(r.step, r.app, mmss(r.ms), r.ok ? 'ok' : 'FAIL')),
    `${'total'.padEnd(wStep)}  ${''.padEnd(wApp)}  ${mmss(total).padStart(6)}`,
  ].join('\n');
}
