// Helpers shared by the release scripts (scripts/release.mjs, scripts/release-all.mjs):
// process + prompt plumbing, version bump, preflight, the pre-bump gates, the live-bundle check
// and the two submodule commit halves. Importing this module has no side effect beyond the
// NODE_OPTIONS line below, so tests can import it freely.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = join(repoRoot, 'package.json');

// app -> hosting site id (from firebase.json). Keep in sync with the firebase-deploy skill.
export const SITES = {
  'scs-app': 'scs-app-54aef',
  'p13-app': 'p13-app-54aef',
  'kring-app': 'kring-app-54aef',
  'okr-app': 'okr-app-54aef',
  'bka-app': 'bka-app-54aef',
  'bkg-app': 'bkg-app-54aef',
  'elab-app': 'elab-app-54aef',
  'kwa-app': 'kwa-app-54aef',
  'okr-website': 'okr-website-54aef',
  'kring-website': 'kring-website-54aef',
  'p13-website': 'p13-website-54aef',
};
// the eight tenant web apps, in SITES order
export const APPS = Object.keys(SITES).filter((k) => k.endsWith('-app'));
export const PROD_APP = 'scs-app'; // only this app's users see the in-app update prompt

// Silence the DEP0040 "punycode is deprecated" warning emitted by firebase-tools (a transitive
// dep using Node's built-in punycode). Scoped to this run's child processes; preserves any
// existing NODE_OPTIONS. Node >= 21.3 supports --disable-warning.
process.env.NODE_OPTIONS = ['--disable-warning=DEP0040', process.env.NODE_OPTIONS].filter(Boolean).join(' ');

// ---- small helpers -------------------------------------------------------
export const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: 'inherit', cwd: repoRoot, ...opts });
export const capture = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', ...opts }).trim();

// Prompting has two modes, because a release is driven both by a human and by scripts/CI.
//
// TTY (a human at a terminal): one readline interface per prompt, closed immediately after.
//   stdin stays free between questions, so child processes (nx build, `firebase deploy`) own
//   fd 0 and can prompt for themselves. This is the original behaviour — keep it.
//
// Non-TTY (answers piped in): one persistent interface plus a line QUEUE. Two traps here, both
//   of which silently mis-drive the release if you use the TTY approach:
//   1. readline reads stdin in chunks, so it emits lines that arrive before question() is called
//      — those are dropped unless queued. (Symptom: an answer is skipped and the caller silently
//      takes its default.)
//   2. Closing the interface leaves stdin at EOF, so the NEXT question's callback never fires.
//      The await then hangs, Node's event loop drains, and the process exits 0 mid-release with
//      nothing built or deployed. Once stdin ends, answer '' so callers fall back to defaults.
const piped = !process.stdin.isTTY;
let rl;
const queued = [];
let waiting = null;
let stdinEnded = false;

function initPipedPrompts() {
  if (rl) return;
  rl = createInterface({ input: process.stdin, output: process.stdout });
  const deliver = (line) => {
    if (waiting) { const res = waiting; waiting = null; res(line); }
    else queued.push(line);
  };
  rl.on('line', (l) => deliver(l.trim()));
  rl.on('close', () => { stdinEnded = true; if (waiting) { const res = waiting; waiting = null; res(''); } });
}

// `onInterrupt` (optional, TTY only): the answer Ctrl-C gives. On a TTY readline owns stdin in raw
// mode, so Ctrl-C arrives as a keystroke, not as a process SIGINT; without a 'SIGINT' listener on
// the interface readline just closes it and the question never settles (the process then exits 0
// with the event loop drained). Callers whose prompt guards uncommitted work pass the safe answer.
export function ask(q, { onInterrupt } = {}) {
  if (!piped) {
    const once = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((res) => {
      if (onInterrupt !== undefined) once.on('SIGINT', () => { once.close(); process.stdout.write('\n'); res(onInterrupt); });
      once.question(q, (a) => { once.close(); res(a.trim()); });
    });
  }
  initPipedPrompts();
  process.stdout.write(q);
  if (queued.length) return Promise.resolve(queued.shift());
  if (stdinEnded) return Promise.resolve('');
  return new Promise((res) => { waiting = res; });
}
export const closePrompts = () => { rl?.close(); rl = undefined; };
export async function confirm(q, def = true) {
  const a = (await ask(`${q} ${def ? '[Y/n]' : '[y/N]'} `)).toLowerCase();
  if (!a) return def;
  return a === 'y' || a === 'yes';
}
export function abort(msg) { closePrompts(); console.error(`\n✖ ${msg}`); process.exit(1); }
export function bump(v, kind) {
  const [maj, min, pat] = v.split('.').map(Number);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}
export const readVersion = () => JSON.parse(readFileSync(pkgPath, 'utf8')).version;
export const writeVersion = (current, next) =>
  writeFileSync(pkgPath, readFileSync(pkgPath, 'utf8').replace(`"version": "${current}"`, `"version": "${next}"`));

// ---- preflight (all branches) -------------------------------------------
export async function preflight() {
  const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== 'main' && !(await confirm(`Not on main (on '${branch}'). Continue?`, false)))
    abort('Aborted: not on main.');
  // `planning` is excluded: parallel sessions edit specs there all the time, and nothing in a
  // release builds from it. Every release commit below stages its own explicit path only.
  const dirty = capture('git', ['status', '--porcelain', '--', '.', ':(exclude)planning'])
    .split('\n').filter(Boolean);
  if (dirty.length) {
    console.log('Working tree has uncommitted changes:\n' + dirty.join('\n'));
    if (!(await confirm('Continue anyway?', false))) abort('Aborted: dirty working tree.');
  }
}

// ---- pre-bump gates ------------------------------------------------------
/**
 * Every gate that runs before the version bump — cheap, fail-fast, nothing changed yet.
 *
 * Two of the checks (live menu labels, catalogue drift) report a DATA condition, not a broken
 * build, so they ask instead of aborting. `nonInteractive` (the all-apps run, which has no human
 * at the keyboard mid-run) answers such a question `true` only when its accept flag is set
 * (`acceptMenuLabels` / `acceptDrift`), else aborts. Piped answers (release-app.sh) are still
 * interactive from here: the caller passes `nonInteractive: false` and `confirm` reads them.
 */
export async function runGates({ nonInteractive = false, acceptDrift = false, acceptMenuLabels = false } = {}) {
  const accept = async (question, accepted, abortMsg) => {
    if (nonInteractive) {
      if (!accepted) abort(abortMsg);
      return;
    }
    if (!(await confirm(question, false))) abort(abortMsg);
  };

  // 1. test gate FIRST (cheap, fail-fast)
  console.log('\n[1/6] Running full test suite (pnpm run testlibs)…');
  try { run('pnpm', ['run', 'testlibs']); }
  catch { abort('Tests failed — release aborted (no version bump made).'); }

  // 1a. form/modal structure gate (building-forms skill): these break no build and no test — a
  //     hand-built modal or an unsatisfiable Vest cap compiles green and only shows up as a missing
  //     save banner in production.
  console.log('\n[1/6] Checking forms and modals (pnpm check-forms)…');
  try { run('node', ['scripts/check-forms.mjs']); }
  catch { abort('check-forms failed — release aborted (no version bump made). Fix the findings above.'); }

  // 1a*. ion-popover triggers: a fixed or data-derived trigger id repeats once the same list sits
  //      twice in Ionic's page stack, and the popover binds to the hidden page's button — the
  //      ellipsis shows, a click does nothing. Breaks no build and no test.
  console.log('\n[1/6] Checking ion-popover triggers (pnpm check-context-menus)…');
  try { run('node', ['scripts/check-context-menus.mjs']); }
  catch { abort('check-context-menus failed — release aborted (no version bump made). Use contextMenuId() for the ids above.'); }

  // 1a'. i18n gate: every key the code names must resolve, in all five languages. A missing key
  //      breaks no build and no test — it renders raw in production and opens one Sentry
  //      `i18n missing-key` ticket per key (SCS-CG: bare Vest messages nobody had translated).
  console.log('\n[1/6] Checking i18n keys (pnpm check-i18n)…');
  try { run('node', ['scripts/check-i18n.mjs']); }
  catch { abort('check-i18n failed — release aborted (no version bump made). Fix the findings above.'); }

  // 1a'''. i18n asset gate: every lib with a src/i18n/de.json must be copied into every app's build.
  //        An unlisted scope breaks no build and no test — its <lang>.json falls through to the SPA
  //        fallback (index.html, HTTP 200) and every key opens an `i18n scope-load-failed` ticket
  //        (SCS-DK…SCS-E6: the tracker scope was never listed for scs-app).
  console.log('\n[1/6] Checking i18n asset entries (pnpm check-i18n-assets)…');
  try { run('node', ['scripts/sync-i18n-assets.mjs', '--check']); }
  catch { abort('check-i18n-assets failed — release aborted (no version bump made). Run `pnpm sync-i18n-assets` and commit the app project.json files.'); }

  // 1a''. live menu labels: a menuItems doc created in the CMS or by the feature picker can name a
  //       label no source file knows. Data, not code — so ask, and never block on missing creds.
  console.log('\n[1/6] Checking live menu labels (pnpm check-menu-labels)…');
  try {
    run('node', ['scripts/check-menu-labels.mjs']);
  } catch (err) {
    if (err.status === 1) {
      await accept(
        'Live menu rows use labels this release does not ship (see above). Continue anyway?',
        acceptMenuLabels,
        'Aborted: add the missing labels to libs/cms/menu/feature/src/i18n/*.json first.');
    } else {
      console.log('  (menu label check could not run — skipped; needs `gcloud auth application-default login`)');
    }
  }

  // 1b. catalogue drift gate — does `feature-blocks.ts` still agree with the live menu docs?
  //     Placed here, before the bump, for the same reason the test gate is first: it is cheap
  //     and a failure means nothing has been changed yet.
  //
  //     Drift is a DATA condition, not a broken build, and it can be legitimate on either
  //     side — the catalogue may be the stale half. So this asks rather than aborts. A
  //     credential or network failure is not a release blocker either: the check needs
  //     application-default credentials, and an offline release must still be possible.
  console.log('\n[1b/6] Feature-catalogue drift check…');
  try {
    run('node', ['scripts/check-feature-catalogue.mjs']);
  } catch (err) {
    // Exit code 1 is "drift found" and has already printed the table; anything else is the
    // check itself failing (no credentials, no network), which must not stop a release.
    if (err.status === 1) {
      await accept(
        'Catalogue drift found (see table above). Continue the release anyway?',
        acceptDrift,
        'Aborted: catalogue drift. Back-port the live value into feature-blocks.ts, or run «Struktur übernehmen».');
    } else {
      console.log('  (drift check could not run — skipped; needs `gcloud auth application-default login`)');
    }
  }
}

// ---- live verification ---------------------------------------------------
/**
 * Verify the LIVE bundle actually carries the new version — the only proof the deploy shipped
 * fresh code (the build runs with --skip-nx-cache because a stale remote cache once shipped the
 * old version). Fetch index.html, find the main-*.js it references, and confirm the version
 * string is present. Throws on any mismatch; the caller decides whether that blocks the release.
 */
export function verifyLive(site, version) {
  const base = `https://${site}.web.app`;
  const html = capture('curl', ['-fsS', '--max-time', '60', `${base}/index.html?_cb=${version}`]);
  const mainJs = (html.match(/main-[A-Z0-9]+\.js/i) || [])[0];
  if (!mainJs) throw new Error('could not find main-*.js in index.html');
  const bundle = capture('curl', ['-fsS', '--max-time', '60', `${base}/${mainJs}?_cb=${version}`]);
  if (!bundle.includes(version))
    throw new Error(`live bundle ${mainJs} does NOT contain "${version}" — a stale build was deployed`);
  console.log(`     ✓ ${mainJs} contains v${version}.`);
}

// ---- submodule commits ---------------------------------------------------
/**
 * The app-repo half of an app release: commit the ngsw stamp and tag the app repo at exactly the
 * commit that shipped.
 *
 * Why the app repo gets its own tag: the superproject tag is created in step 7, BEFORE this
 * commit exists, so `v<version>` there points at the pointer as it was *before* the stamp.
 * Checking it out with --recurse-submodules therefore yields app code that never shipped. The
 * tag written here is the only ref that pins what actually went live.
 *
 * Pushes with an explicit `HEAD:main` refspec: a submodule is routinely on a detached HEAD, and
 * a bare `git push origin main` there silently pushes the stale local `main` branch instead of
 * the commit just made. The superproject pointer bump is `commitPointers`' job.
 */
export function commitSubmoduleStamp(app, version, push) {
  const sub = ['-C', `apps/${app}`];
  console.log(`\n[8/8] ${app} submodule — ngsw commit, tag v${version}`);

  if (capture('git', [...sub, 'status', '--porcelain', '--', 'ngsw-config.json'])) {
    run('git', [...sub, 'add', 'ngsw-config.json']);
    run('git', [...sub, 'commit', '-m', `chore(${app}): ngsw-Stempel v${version}`]);
    console.log(`  committed the stamp in apps/${app}`);
  }

  // Idempotent: a re-run after a failed deploy must not die on an existing tag.
  if (capture('git', [...sub, 'tag', '-l', `v${version}`])) {
    console.log(`  tag v${version} already exists in apps/${app} — left as is.`);
  } else {
    run('git', [...sub, 'tag', '-a', `v${version}`, '-m', `release v${version}`]);
    console.log(`  tagged apps/${app} v${version} -> ${capture('git', [...sub, 'rev-parse', '--short', 'HEAD'])}`);
  }

  if (push) {
    run('git', [...sub, 'push', 'origin', 'HEAD:main']);
    run('git', [...sub, 'push', 'origin', `v${version}`]);
  }

  if (!push)
    console.log(`  Not pushed. Later:  git -C apps/${app} push origin HEAD:main && git -C apps/${app} push origin v${version}`);
}

/**
 * The superproject half: ONE commit bumping the pointer of every app whose submodule moved.
 * Stages only the `apps/<app>` paths that actually changed (`git commit -o`, never the whole
 * index), and does nothing when none did. Stays its own commit, never folded into the release
 * commit.
 *
 * With `push`, pushes exactly `HEAD:main` — never the local `main` branch, which from a worktree,
 * a work branch or a detached HEAD is not the commit just made. A caller that pushes itself right
 * afterwards (the all-apps git phase) passes `callerPushes` to silence the "not pushed" hint.
 */
export function commitPointers(apps, version, push, { callerPushes = false } = {}) {
  const changed = apps.filter((a) => capture('git', ['status', '--porcelain', '--', `apps/${a}`]));
  if (!changed.length) return;
  const paths = changed.map((a) => `apps/${a}`);
  run('git', ['add', ...paths]);
  run('git', ['commit', '-o', ...paths, '-m', `chore(submodules): Pointer -- ngsw-Stempel v${version} (${changed.length} ${changed.length === 1 ? 'app' : 'apps'})`]);
  if (push) run('git', ['push', 'origin', 'HEAD:main']);
  else if (!callerPushes) console.log('  Pointer bump not pushed. Later:  git push origin HEAD:main');
}
