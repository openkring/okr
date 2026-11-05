// Post-release test summary: `pnpm release:summary [version]`, also the last step of `release all`.
// Read-only: collects what shipped and what the release left undone into
// dist/release-logs/v<version>/test-summary.md. The `release` skill turns that into the checklist.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capture, readVersion, repoRoot } from './release-shared.mjs';
import { definedNames, localImports, parseCommits, previousTag, reachable, renderReport, rolloutHints, staleFunctions, stepScripts, tocItems } from './release-summary.logic.mjs';

const FUNCTIONS_SRC = 'apps/functions/src';
const SHARED_LIBS = ['libs/shared/models', 'libs/shared/util-core', 'libs/shared/util-functions'];
const git = (...args) => capture('git', args);

const sourceFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const path = join(dir, e.name);
  if (e.isDirectory()) return sourceFiles(path);
  return e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts') ? [path] : [];
});

/** name → last deploy; null when gcloud cannot answer, which the report says instead of "all fine". */
function deployedFunctions() {
  const res = spawnSync('gcloud', ['functions', 'list', '--project', 'bkaiser-org', '--regions=europe-west6',
    '--format=value(name,updateTime)'], { encoding: 'utf8' });
  if (res.status !== 0 || !res.stdout?.trim()) return null;
  return Object.fromEntries(res.stdout.trim().split('\n').map((l) => l.trim().split(/\s+/)));
}

/** Each deployed function with the source files that end up in it, as paths from the repo root. */
function functionSources(deployed) {
  const root = join(repoRoot, FUNCTIONS_SRC);
  const rel = (path) => path.slice(repoRoot.length + 1);
  const sources = Object.fromEntries(sourceFiles(root).map((f) => [f, readFileSync(f, 'utf8')]));
  const resolve = (from, spec) => [`${spec}.ts`, join(spec, 'index.ts')].map((c) => join(dirname(from), c)).find((c) => c in sources);
  const graph = Object.fromEntries(Object.entries(sources).map(([f, src]) => [f, localImports(src).map((i) => resolve(f, i)).filter(Boolean)]));
  return Object.entries(sources).filter(([f]) => f !== join(root, 'main.ts')).flatMap(([file, src]) => definedNames(src)
    .filter((name) => deployed[name]).map((name) => ({ name, file: rel(file), files: [...reachable(file, graph)].map(rel) })));
}

const lastChange = (range, files) => Object.fromEntries(files.filter((f) => f.startsWith(`${FUNCTIONS_SRC}/`) && !f.endsWith('.spec.ts'))
  .map((f) => [f, git('log', '-1', '--format=%aI', range, '--', f)]).filter(([, date]) => date));

/** `planning` is an uninitialised submodule in a fresh worktree; the main checkout then has it. */
function readToc() {
  const commonDir = git('rev-parse', '--path-format=absolute', '--git-common-dir');
  return [repoRoot, dirname(commonDir)].map((root) => join(root, 'planning/PENDING_IMPLEMENTATION.md'))
    .filter(existsSync).map((path) => readFileSync(path, 'utf8'))[0] ?? '';
}

/** Writes the report unless `write` is false. `to` defaults to the tag; a dry run has none yet. */
export function writeTestSummary(version, { to = `v${version}`, write = true } = {}) {
  const from = previousTag(git('tag', '-l', 'v*').split('\n'), version);
  if (!from) throw new Error(`no release tag before v${version}`);
  const range = `${from}..${to}`;
  const commits = parseCommits(git('log', '--no-merges', '--format=%h%x1f%s%x1f%b%x1e', range));
  const files = git('diff', '--name-only', range).split('\n').filter(Boolean);
  const deployed = deployedFunctions();
  const specs = [...new Set(commits.map((c) => c.spec).filter(Boolean))];
  const report = renderReport({
    version, from, commits, deployed,
    stale: deployed ? staleFunctions(functionSources(deployed), lastChange(range, files), deployed) : [],
    hints: rolloutHints(commits),
    scripts: stepScripts(files),
    toc: tocItems(readToc(), specs),
    sharedChanged: SHARED_LIBS.filter((lib) => files.some((f) => f.startsWith(`${lib}/`))),
  });
  const path = join(repoRoot, 'dist/release-logs', `v${version}`, 'test-summary.md');
  if (write) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, report);
  }
  return { path, report };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { path, report } = writeTestSummary(process.argv[2] ?? readVersion());
  console.log(`${report}\nWritten to ${path.slice(repoRoot.length + 1)}`);
}
