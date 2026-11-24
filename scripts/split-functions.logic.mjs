// Pure logic for scripts/split-functions.mjs: one file per function module instead of one bundle for all.
//
// Every Cloud Function used to load the whole bundle (7 MB, 220 of the 256 MB of most functions) to run one of its
// 338 functions. The split writes one file per module that main.ts exports functions from, plus shared chunks, and a
// main.cjs whose exports are getters: the functions framework reads exactly one of them (FUNCTION_TARGET), the deploy
// discovery reads all.
import ts from 'typescript';
import { mainSkeleton, parseExports, resolveSpecifier } from './deploy-functions.logic.mjs';

/** Prefix of every generated file, so that they can be told from what else is in the deploy directory. */
export const PREFIX = 'fn-';
export const INIT = 'apps/functions/src/init.ts';

/**
 * Files whose top-level code has an effect outside themselves. A function loads only its own modules, so such an effect
 * is missing in every function that does not import the file. Each entry says why that is fine:
 *   'always'  loaded first by main.cjs, for every function
 *   'own'     changes only what is in the file itself (or in a library that this file wraps)
 *   { port }  every file that imports `port` must import this file as well (checked)
 */
export const TOP_LEVEL_EFFECTS = {
  [INIT]: 'always',
  'apps/functions/src/publicApi/index.ts': 'own',
  'libs/shared/util-core/src/lib/country.util.ts': 'own',
  'apps/functions/src/pingen/credit-binding.ts': { port: 'apps/functions/src/pingen/credit-port.ts' },
};

/** `apps/functions/src/_gateway/zefix-router.ts` → `fn-_gateway-zefix-router`. */
export function entryName(file) {
  return PREFIX + file.replace(/^apps\/functions\/src\//, '').replace(/(\/index)?\.ts$/, '').replace(/[^\w.-]/g, '-');
}

/**
 * The modules main.ts exports functions from: [{ file, entry, names: [[exportedName, nameInModule]] }].
 * Throws when main.ts holds anything but `import './init'`, imports and re-exports: such code would be lost.
 */
export function planSplit(mainText, mainFile, has) {
  const skeleton = mainSkeleton(mainText);
  if (skeleton.trim()) throw new Error(`main.ts may only import and re-export, but contains:\n${skeleton}`);
  const { exports, stars } = parseExports(mainText, mainFile);
  if (stars.length) throw new Error(`main.ts: "export * from" hides which functions there are: ${stars.join(', ')}`);
  const modules = new Map();
  for (const [name, e] of exports) {
    const file = e.kind === 'from' ? resolveSpecifier(mainFile, e.spec, has) : null;
    if (!file) throw new Error(`main.ts: cannot follow the export "${name}"`);
    if (!modules.has(file)) modules.set(file, { file, entry: entryName(file), names: [] });
    modules.get(file).names.push([name, e.name]);
  }
  const list = [...modules.values()];
  const seen = new Map();
  for (const m of list) {
    if (seen.has(m.entry)) throw new Error(`two modules want the file name ${m.entry}: ${seen.get(m.entry)}, ${m.file}`);
    seen.set(m.entry, m.file);
  }
  return list;
}

/** Source of a module's entry: only what main.ts uses, so that the same code is left out as in one bundle. */
export function entrySource(module) {
  const names = [...new Set(module.names.map(([, inModule]) => inModule))].sort();
  return `export { ${names.join(', ')} } from ${JSON.stringify(`./${module.file.split('/').pop()}`)};\n`;
}

/** main.cjs: init first, then one getter per function. */
export function dispatcherSource(modules) {
  const lines = modules.flatMap((m) => m.names.map(([name, inModule]) => [name,
    `get(${JSON.stringify(name)}, () => require(${JSON.stringify(`./${m.entry}.cjs`)})[${JSON.stringify(inModule)}]);`]));
  lines.sort(([a], [b]) => (a < b ? -1 : 1));
  return ['"use strict";', `require(${JSON.stringify(`./${entryName(INIT)}.cjs`)});`,
    'const get = (name, value) => Object.defineProperty(exports, name, { enumerable: true, get: value });',
    ...lines.map(([, l]) => l), ''].join('\n');
}

/**
 * Inside our own files a dynamic import must stay what it was in one bundle: a lazy require. Node's import() of a
 * CommonJS file would hand out `module.exports` as `default`. Imports of packages stay import().
 */
export function internalImportsToRequire(code) {
  return code.replace(/\bimport\((["'])(\.\/fn-[^"']+\.cjs)\1\)/g, 'Promise.resolve().then(()=>require("$2"))');
}

/** Top-level statements that do something (calls, loops, conditions), not declarations. */
export function topLevelEffects(text, file = 'x.ts') {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const harmless = (st) => ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression); // 'use strict'
  return sf.statements
    .filter((st) => (ts.isExpressionStatement(st) || ts.isIfStatement(st) || ts.isTryStatement(st) || ts.isBlock(st) || ts.isSwitchStatement(st)
      || ts.isIterationStatement(st, false)) && !harmless(st))
    .map((st) => st.getText(sf).replace(/\s+/g, ' ').slice(0, 100));
}

/**
 * What would get lost when each function loads only its own modules; empty = nothing.
 * inputs: esbuild metafile inputs; emits(file): whether the file puts code into the bundle; readFile(file).
 */
export function lostEffects({ inputs, emits, readFile, known = TOP_LEVEL_EFFECTS }) {
  const problems = [];
  for (const file of Object.keys(inputs)) {
    if (file.includes('node_modules/') || !/\.tsx?$/.test(file) || file === 'apps/functions/src/main.ts' || !emits(file)) continue;
    const effects = topLevelEffects(readFile(file), file);
    if (effects.length && !known[file]) problems.push(`${file} has an effect when it is loaded (${effects[0]}). A function that does not import it misses it.`);
  }
  for (const [file, kind] of Object.entries(known)) {
    if (typeof kind !== 'object' || !inputs[file]) continue;
    for (const [user, { imports = [] }] of Object.entries(inputs)) {
      if (user === file || !imports.some((i) => i.path === kind.port)) continue;
      if (!imports.some((i) => i.path === file)) problems.push(`${user} imports ${kind.port} but not ${file}, which sets it up.`);
    }
  }
  return problems;
}

/** Bundled files that are in one of two metafiles only (both as Set); virtual entries excluded by the caller. */
export function inputDifference(a, b) {
  return { missing: [...a].filter((f) => !b.has(f)).sort(), extra: [...b].filter((f) => !a.has(f)).sort() };
}

/** A manifest in an order that does not depend on which module was loaded first: parameters are declared while loading. */
export function comparableManifest(manifest) {
  const key = (x) => JSON.stringify(x, Object.keys(x).sort());
  const sorted = (list) => [...(list ?? [])].sort((a, b) => (key(a) < key(b) ? -1 : 1));
  return { ...manifest, params: sorted(manifest.params), requiredAPIs: sorted(manifest.requiredAPIs) };
}
