import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, rmSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, transformSync } from 'esbuild';
import { cjsEntries, comparableManifest, dispatcherSource, entryName, entrySource, INIT, inputDifference, INTEROP, internalImportsToRequire, interopSource, lostEffects, planSplit, topLevelEffects } from './split-functions.logic.mjs';

const MAIN = 'apps/functions/src/main.ts';
const has = (f) => ['apps/functions/src/auth/index.ts', 'apps/functions/src/news.ts', 'apps/functions/src/a/b.ts', 'apps/functions/src/a-b.ts'].includes(f);

test('planSplit groups the exports of main.ts by module', () => {
  const plan = planSplit(`import './init';
    import * as Auth from './auth';
    export const sendEmail = Auth.sendEmail;
    export const login = Auth.signIn;
    export { news as newsCenter } from './news';`, MAIN, has);
  assert.deepEqual(plan, [
    { file: 'apps/functions/src/auth/index.ts', entry: 'fn-auth', names: [['sendEmail', 'sendEmail'], ['login', 'signIn']] },
    { file: 'apps/functions/src/news.ts', entry: 'fn-news', names: [['newsCenter', 'news']] },
  ]);
});

test('planSplit refuses a main.ts that does more than re-export', () => {
  assert.throws(() => planSplit(`import './init'; console.log('x');`, MAIN, has), /only import and re-export/);
  assert.throws(() => planSplit(`export const x = onCall(() => 1);`, MAIN, has), /cannot follow the export "x"/);
  assert.throws(() => planSplit(`export * from './news';`, MAIN, has), /hides which functions/);
  assert.throws(() => planSplit(`export { x } from './missing';`, MAIN, has), /cannot follow/);
  assert.throws(() => planSplit(`export { x } from './a/b'; export { y } from './a-b';`, MAIN, has), /fn-a-b/);
});

test('the real main.ts can be split', () => {
  const plan = planSplit(readFileSync(MAIN, 'utf8'), MAIN, () => true);
  assert.ok(plan.flatMap((m) => m.names).length > 300);
});

test('entrySource exports each used name once', () => {
  assert.equal(entrySource({ file: 'apps/functions/src/auth/index.ts', names: [['b', 'x'], ['a', 'x'], ['c', 'y']] }), 'export { x, y } from "./index.ts";\n');
  assert.equal(entryName(INIT), 'fn-init');
  assert.equal(entryName('apps/functions/src/_gateway/zefix-router.ts'), 'fn-_gateway-zefix-router');
});

test('the dispatcher loads init first and only the module of the export that is read', () => {
  const dir = mkdtempSync(join(tmpdir(), 'split-'));
  try {
    writeFileSync(join(dir, 'fn-init.cjs'), 'globalThis.loaded = ["init"];');
    writeFileSync(join(dir, 'fn-auth.cjs'), 'globalThis.loaded.push("auth"); exports.signIn = () => "in";');
    writeFileSync(join(dir, 'fn-news.cjs'), 'globalThis.loaded.push("news"); exports.news = () => 1;');
    writeFileSync(join(dir, 'main.cjs'), dispatcherSource([
      { entry: 'fn-auth', names: [['login', 'signIn']] }, { entry: 'fn-news', names: [['newsCenter', 'news']] }]));
    const main = createRequire(import.meta.url)(join(dir, 'main.cjs'));
    assert.deepEqual(globalThis.loaded, ['init']);
    assert.equal(main.login(), 'in');
    assert.deepEqual(globalThis.loaded, ['init', 'auth']);
    assert.deepEqual(Object.keys(main), ['login', 'newsCenter']);   // the deploy discovery lists them
  } finally { rmSync(dir, { recursive: true }); delete globalThis.loaded; }
});

test('only dynamic imports of own files become a lazy require', () => {
  assert.equal(internalImportsToRequire('a(import("./fn-chunk-AB12.cjs"));import("pdfkit")'), 'a(Promise.resolve().then(()=>require("./fn-chunk-AB12.cjs")));import("pdfkit")');
});

test('a dynamic import of a bundled CommonJS package keeps its names', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'split-'));
  try {
    writeFileSync(join(dir, 'plain.cjs'), 'exports.PNG = class PNG {}; exports.n = 1;');
    writeFileSync(join(dir, 'esm.cjs'), 'Object.defineProperty(exports, "__esModule", { value: true }); exports.default = () => 2; exports.x = 3;');
    writeFileSync(join(dir, 'own.js'), 'export const y = 4; export default 5;');
    writeFileSync(join(dir, 'a.js'), 'export const run = async () => [await import("./plain.cjs"), await import("./esm.cjs"), await import("./own.js")];');
    const result = await build({ entryPoints: [join(dir, 'a.js')], outdir: dir, entryNames: 'fn-[name]', chunkNames: 'fn-chunk-[hash]', outExtension: { '.js': '.cjs' },
      bundle: true, splitting: true, format: 'esm', platform: 'node', metafile: true, logLevel: 'error' });
    const cjs = cjsEntries(result.metafile);
    assert.equal(cjs.size, 2);
    writeFileSync(join(dir, INTEROP), interopSource);
    for (const o of Object.keys(result.metafile.outputs)) {
      const path = join(dir, o.split('/').pop());
      writeFileSync(path, internalImportsToRequire(transformSync(readFileSync(path, 'utf8'), { format: 'cjs', platform: 'node' }).code, cjs));
    }
    const [plain, esm, own] = await createRequire(import.meta.url)(join(dir, 'fn-a.cjs')).run();
    assert.equal(typeof plain.PNG, 'function');
    assert.equal(plain.default.n, 1);
    assert.deepEqual([esm.default(), esm.x], [2, 3]);
    assert.deepEqual([own.y, own.default], [4, 5]);
  } finally { rmSync(dir, { recursive: true }); }
});

test('topLevelEffects finds calls, loops and conditions, not declarations', () => {
  assert.deepEqual(topLevelEffects(`'use strict'; import './x'; const a = f(); export function g() { h(); } class C {}`), []);
  assert.equal(topLevelEffects('register(1); if (x) y(); for (const a of b) c(a); try { d(); } catch {}').length, 4);
});

test('topLevelEffects finds effects hidden in declarations', () => {
  for (const code of ['export const x = registerThing();', 'const _ = bindPort(p);', 'class A { static { go(); } }', 'class A { static r = installIt(); }', 'export default a.use(b);', "import 'polyfill';"]) {
    assert.equal(topLevelEffects(code).length, 1, code);
  }
  for (const code of ['export const f = onCall(() => 1);', 'const s = defineSecret("X");', 'const u = settings.map(x);', "import './own';", 'class A { static r = 1; }']) {
    assert.equal(topLevelEffects(code).length, 0, code);
  }
});

test('lostEffects reports an unknown effect and a user without the file that sets it up', () => {
  const files = { 'apps/functions/src/port.ts': 'export let p;', 'apps/functions/src/binding.ts': 'bind(1);', 'apps/functions/src/user.ts': 'import { p } from "./port";' };
  const port = 'apps/functions/src/port.ts';
  const binding = 'apps/functions/src/binding.ts';
  const inputs = (imports) => ({ [port]: { imports: [] }, [binding]: { imports: [{ path: port }] }, 'apps/functions/src/user.ts': { imports: imports.map((path) => ({ path })) } });
  const call = (i, known) => lostEffects({ inputs: i, emits: () => true, readFile: (f) => files[f], known });
  assert.match(call(inputs([port]), {})[0], /binding\.ts has an effect/);
  assert.match(call(inputs([port]), { [binding]: { port } })[0], /user\.ts imports .*port\.ts but not/);
  assert.deepEqual(call(inputs([port, binding]), { [binding]: { port } }), []);
  assert.deepEqual(lostEffects({ inputs: inputs([port, binding]), emits: () => false, readFile: (f) => files[f], known: {} }), []);
  assert.match(call(inputs([port, binding]), { [binding]: { port: 'renamed.ts' } })[0], /renamed\.ts, which is not in the bundle/);
  assert.match(call(inputs([port, binding]), { [binding]: 'own', 'gone.ts': 'own' })[0], /gone\.ts, which is not in the bundle/);
  assert.match(call(inputs([port, binding]), { [binding]: 'own', [port]: 'own' })[0], /no effect any more/);
});

test('comparisons ignore order but not content', () => {
  assert.deepEqual(inputDifference(new Set(['a', 'b']), new Set(['b', 'c'])), { missing: ['a'], extra: ['c'] });
  const m = (params) => comparableManifest({ endpoints: {}, params });
  assert.deepEqual(m([{ name: 'A' }, { name: 'B' }]), m([{ name: 'B' }, { name: 'A' }]));
  assert.notDeepEqual(m([{ name: 'A' }]), m([{ name: 'C' }]));
});
