// Turns the one bundle of `nx build functions` into one file per function module (see split-functions.logic.mjs).
// Called by scripts/deploy-functions.mjs after the build and the prune; `node scripts/split-functions.mjs` runs it on an
// existing build (dist/apps/functions with node_modules, dist/functions-meta.json) to check or measure it.
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { build, transformSync } from 'esbuild';
import { stableStringify } from './deploy-functions.logic.mjs';
import { cjsEntries, comparableManifest, dispatcherSource, entryName, entrySource, INIT, inputDifference, INTEROP, internalImportsToRequire, interopSource, lostEffects,
  planSplit, PREFIX } from './split-functions.logic.mjs';

const MAIN = 'apps/functions/src/main.ts';
const run = promisify(execFile);

/** The endpoints as the functions SDK reports them for what lies in distDir. */
export function readManifest(distDir, path, project) {
  execFileSync('node', [join(distDir, 'node_modules/firebase-functions/lib/bin/firebase-functions.js'), '.'], {
    cwd: distDir, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, GCLOUD_PROJECT: project, FUNCTIONS_MANIFEST_OUTPUT_PATH: path },
  });
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Every export of every module must be a function when that module alone is loaded, as in a running instance. */
async function loadAlone(distDir, modules, project) {
  const env = { ...process.env, GCLOUD_PROJECT: project, K_SERVICE: 'check', FIREBASE_CONFIG: JSON.stringify({ projectId: project, storageBucket: `${project}.appspot.com` }) };
  const queue = [...modules];
  const problems = [];
  let max = { rss: 0 };
  const worker = async () => {
    for (let m = queue.shift(); m; m = queue.shift()) {
      const names = m.names.map(([name]) => name);
      const code = `const x=require('./main.cjs');const bad=${JSON.stringify(names)}.filter(n=>typeof x[n]!=='function');`
        + `console.log('\\n@@'+JSON.stringify({bad,rss:Math.round(process.memoryUsage().rss/1048576)}));process.exit(0)`;
      try {
        const { stdout } = await run('node', ['-e', code], { cwd: distDir, env: { ...env, FUNCTION_TARGET: names[0] }, maxBuffer: 64 << 20 });
        const r = JSON.parse(stdout.split('@@').pop());
        if (r.bad.length) problems.push(`${m.file}: not a function: ${r.bad.join(', ')}`);
        if (r.rss > max.rss) max = { rss: r.rss, file: m.file };
      } catch (e) { problems.push(`${m.file}: ${String(e.stderr || e.message).split('\n').find((l) => /Error/.test(l)) ?? e.message}`); }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return { problems, max };
}

/**
 * Replaces distDir/main.cjs by the split files. `manifest` = what the one bundle reported; the split must report the same.
 * Throws when anything differs, and then removes main.cjs so that nothing can be deployed by hand either.
 */
export async function splitFunctions(options) {
  try { return await split(options); } catch (e) { rmSync(join(options.distDir, 'main.cjs'), { force: true }); throw e; }
}

async function split({ repoRoot, distDir, meta, manifest, project }) {
  const readFile = (f) => readFileSync(join(repoRoot, f), 'utf8');
  const has = (f) => f in meta.inputs;
  const outputInputs = Object.values(meta.outputs)[0]?.inputs ?? {};
  const modules = planSplit(readFile(MAIN), MAIN, has);

  const lost = lostEffects({ inputs: meta.inputs, emits: (f) => !!outputInputs[f]?.bytesInOutput, readFile });
  if (lost.length) throw new Error(`Each function loads only its own modules; these effects would be missing:\n  ${lost.join('\n  ')}\n  Import the file where it is needed and list it in TOP_LEVEL_EFFECTS (scripts/split-functions.logic.mjs).`);

  const { targets } = JSON.parse(readFile('apps/functions/project.json'));
  const options = targets.build.options;
  const production = targets.build.configurations?.production ?? {};
  for (const f of readdirSync(distDir)) if (f.startsWith(PREFIX)) rmSync(join(distDir, f));
  const virtual = new Map(modules.map((m) => [m.entry, m]));
  const result = await build({
    absWorkingDir: repoRoot,
    entryPoints: [{ in: INIT, out: entryName(INIT) }, ...modules.map((m) => ({ in: `split:${m.entry}`, out: m.entry }))],
    outdir: distDir, entryNames: '[name]', chunkNames: `${PREFIX}chunk-[hash]`, outExtension: { '.js': '.cjs' },
    bundle: true, splitting: true, format: 'esm', platform: 'node', target: 'node22', metafile: true, logLevel: 'error', legalComments: 'none',
    minify: !!production.minify, keepNames: !!options.esbuildOptions?.keepNames, external: options.external, tsconfig: options.tsConfig,
    plugins: [{
      name: 'split-entries',
      setup(b) {
        b.onResolve({ filter: /^split:/ }, (a) => ({ path: a.path.slice(6), namespace: 'split' }));
        b.onLoad({ filter: /.*/, namespace: 'split' }, (a) => {
          const m = virtual.get(a.path);
          return { contents: entrySource(m), loader: 'js', resolveDir: join(repoRoot, dirname(m.file)) };
        });
      },
    }],
  });

  // The same source files as in the one bundle, or the change detection would look at the wrong ones.
  const bundled = new Set(Object.keys(outputInputs).filter((f) => f !== MAIN && outputInputs[f].bytesInOutput));
  const inFiles = new Set();
  for (const o of Object.values(result.metafile.outputs)) for (const [f, i] of Object.entries(o.inputs)) if (i.bytesInOutput && !f.startsWith('split:')) inFiles.add(f);
  // Packages may differ: esbuild keeps more of a CommonJS package when it is shared between files.
  const diff = inputDifference(bundled, inFiles);
  const own = [...diff.missing, ...diff.extra].filter((f) => !f.includes('node_modules/'));
  if (own.length || diff.missing.length) throw new Error(`The split files are not built from the same sources as the one bundle: ${[...new Set([...own, ...diff.missing])].slice(0, 10).join(', ')}`);

  // ESM is the only format esbuild can split; the functions stay CommonJS, and strict as ESM and the one bundle are.
  const cjs = cjsEntries(result.metafile);
  const files = readdirSync(distDir).filter((f) => f.startsWith(PREFIX) && f.endsWith('.cjs'));
  for (const f of files) {
    const path = join(distDir, f);
    const { code } = transformSync(readFileSync(path, 'utf8'), { format: 'cjs', platform: 'node', target: 'node22', loader: 'js', minifyWhitespace: true, legalComments: 'none',
      tsconfigRaw: { compilerOptions: { alwaysStrict: true } } });
    if (!code.startsWith('"use strict"')) throw new Error(`${f} is not strict`);
    const out = internalImportsToRequire(code, cjs);
    if (/\bimport\(["']\.\//.test(out)) throw new Error(`${f}: a dynamic import of an own file is left`);
    writeFileSync(path, out);
  }
  writeFileSync(join(distDir, INTEROP), interopSource);
  writeFileSync(join(distDir, 'main.cjs'), dispatcherSource(modules));

  // Same functions, same settings.
  const now = readManifest(distDir, join(repoRoot, 'dist/functions-manifest-split.json'), project);
  if (stableStringify(comparableManifest(now)) !== stableStringify(comparableManifest(manifest))) {
    const names = [...new Set([...Object.keys(now.endpoints), ...Object.keys(manifest.endpoints)])].filter((n) => stableStringify(now.endpoints[n]) !== stableStringify(manifest.endpoints[n]));
    throw new Error(`The split functions do not report the same endpoints: ${names.slice(0, 20).join(', ') || 'params or required APIs'}`);
  }
  const { problems, max } = await loadAlone(distDir, modules, project);
  if (problems.length) throw new Error(`Modules that do not load on their own:\n  ${problems.join('\n  ')}`);

  const bytes = files.reduce((sum, f) => sum + statSync(join(distDir, f)).size, 0);
  return { modules: modules.length, files: files.length, bytes, max };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const distDir = join(repoRoot, 'dist/apps/functions');
  const metaPath = join(repoRoot, 'dist/functions-meta.json');
  if (!existsSync(metaPath) || !existsSync(join(distDir, 'node_modules'))) { console.error('Build and prune first: pnpm run deploy:functions --dry-run'); process.exit(2); }
  const project = JSON.parse(readFileSync(join(repoRoot, '.firebaserc'), 'utf8')).projects?.default;
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'dist/functions-manifest.json'), 'utf8'));
  const r = await splitFunctions({ repoRoot, distDir, meta: JSON.parse(readFileSync(metaPath, 'utf8')), manifest, project });
  console.log(`${r.modules} modules, ${r.files} files, ${(r.bytes / 1048576).toFixed(1)} MB; highest memory after loading: ${r.max.rss} MB (${r.max.file})`);
}
