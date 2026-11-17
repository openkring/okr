import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runtimeHash, adoptable, batches, closure, deployedSince, functionHash, globalRoots, mainSkeleton, packageName, parseExports, planDeploy,
  resolveDefinition, resolveSpecifier, stableStringify } from './deploy-functions.logic.mjs';

const fsOf = (files) => ({ readFile: (f) => files[f], has: (f) => f in files });

test('parseExports covers the export forms main.ts and the barrels use', () => {
  const { exports, stars } = parseExports(`
    import * as Auth from './auth';
    import { helper } from './helper';
    import type { T } from './types';
    export const a = Auth.createUser;
    export const b = helper;
    export const c = onCall(() => 1);
    export { d, e as f } from './de';
    export * from './rest';
    export type { T };
    export function g() {}
    const h = 1; export { h };
  `);
  assert.deepEqual(exports.get('a'), { kind: 'from', spec: './auth', name: 'createUser' });
  assert.deepEqual(exports.get('b'), { kind: 'from', spec: './helper', name: 'helper' });
  assert.deepEqual(exports.get('c'), { kind: 'local' });
  assert.deepEqual(exports.get('f'), { kind: 'from', spec: './de', name: 'e' });
  assert.deepEqual(exports.get('g'), { kind: 'local' });
  assert.deepEqual(exports.get('h'), { kind: 'local' });
  assert.equal(exports.has('T'), false);
  assert.deepEqual(stars, ['./rest']);
});

test('resolveSpecifier finds .ts files and index barrels the bundle contains', () => {
  const has = (f) => ['src/auth/index.ts', 'src/x.ts'].includes(f);
  assert.equal(resolveSpecifier('src/main.ts', './auth', has), 'src/auth/index.ts');
  assert.equal(resolveSpecifier('src/auth/index.ts', '../x', has), 'src/x.ts');
  assert.equal(resolveSpecifier('src/main.ts', '@okr/shared-models', has), null);
  assert.equal(resolveSpecifier('src/main.ts', './missing', has), null);
});

test('resolveDefinition follows namespace aliases, re-exports and export * to the defining file', () => {
  const files = {
    'src/main.ts': `import * as Bexio from './bexio';\nexport const showPdf = Bexio.showPdf;\nexport { quote } from './pingen';\nexport const gone = Bexio.nothing;`,
    'src/bexio/index.ts': `export * from './contact';\nexport * from './invoice';`,
    'src/bexio/contact.ts': `export const getContacts = onCall(x);`,
    'src/bexio/invoice.ts': `export const showPdf = onCall(y);`,
    'src/pingen/index.ts': `export { quote } from './quote';`,
    'src/pingen/quote.ts': `export const quote = onCall(z);`,
  };
  assert.equal(resolveDefinition('showPdf', 'src/main.ts', fsOf(files)), 'src/bexio/invoice.ts');
  assert.equal(resolveDefinition('quote', 'src/main.ts', fsOf(files)), 'src/pingen/quote.ts');
  assert.equal(resolveDefinition('gone', 'src/main.ts', fsOf(files)), null);
});

test('resolveDefinition survives an export * cycle', () => {
  const files = { 'a.ts': `export * from './b';`, 'b.ts': `export * from './a';` };
  assert.equal(resolveDefinition('x', 'a.ts', fsOf(files)), null);
});

test('closure follows static, require and dynamic imports and collects externals by package', () => {
  const inputs = {
    'fn.ts': { imports: [{ path: 'util.ts', kind: 'import-statement' }, { path: 'heavy.ts', kind: 'dynamic-import' },
      { path: 'firebase-admin/firestore', kind: 'import-statement', external: true }] },
    'util.ts': { imports: [{ path: 'node_modules/x/index.js', kind: 'require-call' }, { path: 'fn.ts', kind: 'import-statement' }] },
    'heavy.ts': { imports: [{ path: '@sparticuz/chromium/bin', kind: 'dynamic-import', external: true }] },
    'node_modules/x/index.js': { imports: [] },
    'other.ts': { imports: [] },
  };
  const { files, externals } = closure(inputs, ['fn.ts']);
  assert.deepEqual([...files].sort(), ['fn.ts', 'heavy.ts', 'node_modules/x/index.js', 'util.ts']);
  assert.deepEqual([...externals].sort(), ['@sparticuz/chromium', 'firebase-admin']);
});

test('packageName keeps the scope', () => {
  assert.equal(packageName('firebase-functions/v2/https'), 'firebase-functions');
  assert.equal(packageName('@google-cloud/storage/build'), '@google-cloud/storage');
});

test('mainSkeleton drops imports and exports but keeps shared top-level code', () => {
  const s = mainSkeleton(`import * as A from './a';\nconst app = express();\napp.use(cors({ origin: ['x'] }));\nexport { app };\nexport const f = A.f;\nlogger.info('x');`);
  assert.match(s, /app\.use\(cors/);
  assert.match(s, /logger\.info/);
  assert.doesNotMatch(s, /import|export|A\.f/);
});

test('globalRoots keeps the main.ts imports that define no function', () => {
  const inputs = { 'main.ts': { imports: [{ path: 'init.ts' }, { path: 'auth/index.ts' }, { path: 'cors', external: true }, { path: 'node_modules/express/index.js' }] } };
  assert.deepEqual(globalRoots(inputs, 'main.ts', new Set(['auth/index.ts'])), ['init.ts', 'node_modules/express/index.js']);
});

test('functionHash changes with a closure file, an external version or the endpoint — and nothing else', () => {
  const base = { files: new Set(['a.ts', 'b.ts']), externals: new Set(['pdfkit']), endpoint: { region: ['europe-west6'], memory: 256 }, globalHash: 'g' };
  const io = (over = {}) => ({ fileHash: (f) => over[f] ?? `h-${f}`, versionOf: (p) => over[p] ?? '1.0.0' });
  const h = functionHash({ ...base, ...io() });
  assert.equal(functionHash({ ...base, files: new Set(['b.ts', 'a.ts']), ...io() }).hash, h.hash, 'order does not matter');
  assert.equal(functionHash({ ...base, endpoint: { memory: 256, region: ['europe-west6'] }, ...io() }).hash, h.hash, 'key order does not matter');
  assert.notEqual(functionHash({ ...base, ...io({ 'b.ts': 'changed' }) }).src, h.src);
  assert.notEqual(functionHash({ ...base, ...io({ pdfkit: '2.0.0' }) }).src, h.src);
  const cfg = functionHash({ ...base, endpoint: { ...base.endpoint, memory: 512 }, ...io() });
  assert.equal(cfg.src, h.src);
  assert.notEqual(cfg.config, h.config);
  assert.notEqual(functionHash({ ...base, globalHash: 'g2', ...io() }).hash, h.hash);
  assert.match(h.hash, /^[0-9a-f]{40}$/);
});

test('stableStringify ignores key order and undefined', () => {
  assert.equal(stableStringify({ b: 1, a: [{ d: 2, c: undefined }] }), stableStringify({ a: [{ d: 2 }], b: 1 }));
});

const live = (over = {}) => ({ state: 'ACTIVE', updateTime: '2026-11-10T00:00:00Z', labels: { 'firebase-functions-hash': 'fb1' }, ...over });
const rec = { hash: 'h1', src: 's1', config: 'c1', global: 'g1', fbHash: 'fb1' };
const want = { hash: 'h1', src: 's1', config: 'c1', global: 'g1' };

test('planDeploy skips an unchanged function and names every reason for the others', () => {
  const plan = planDeploy({
    local: { same: want, code: { ...want, hash: 'h2', src: 's2' }, cfg: { ...want, hash: 'h3', config: 'c2' }, glob: { ...want, hash: 'h4', global: 'g2' },
      fresh: want, norec: want, foreign: want, failed: want },
    live: { same: live(), code: live(), cfg: live(), glob: live(), norec: live(), foreign: live({ labels: { 'firebase-functions-hash': 'other' } }),
      failed: live({ state: 'FAILED' }), removed: live() },
    state: { same: rec, code: rec, cfg: rec, glob: rec, foreign: rec, failed: rec },
  });
  const why = Object.fromEntries(plan.deploy.map((d) => [d.name, d.reasons]));
  assert.deepEqual(plan.skip.map((s) => s.name), ['same']);
  assert.deepEqual(why.code, ['code']);
  assert.deepEqual(why.cfg, ['config']);
  assert.deepEqual(why.glob, ['shared setup']);
  assert.deepEqual(why.fresh, ['new']);
  assert.deepEqual(why.norec, ['no deploy record']);
  assert.deepEqual(why.foreign, ['deployed outside this script since']);
  assert.deepEqual(why.failed, ['live state FAILED']);
  assert.deepEqual(plan.orphans, ['removed']);
});

test('planDeploy redeploys a function whose pinned secret has a newer version', () => {
  const withSecret = live({ serviceConfig: { secretEnvironmentVariables: [{ secret: 'BEXIO', version: '3' }, { secret: 'OTHER', version: 'latest' }] } });
  const plan = planDeploy({ local: { f: want }, live: { f: withSecret }, state: { f: rec }, latestSecrets: { BEXIO: '4', OTHER: '9' } });
  assert.deepEqual(plan.deploy[0].reasons, ['secret BEXIO v3→v4']);
  assert.equal(planDeploy({ local: { f: want }, live: { f: withSecret }, state: { f: rec }, latestSecrets: { BEXIO: '3' } }).deploy.length, 0);
});

test('planDeploy honours named functions and --all', () => {
  assert.deepEqual(planDeploy({ local: { f: want }, live: { f: live() }, state: { f: rec }, forced: ['f'] }).deploy[0].reasons, ['named']);
  assert.deepEqual(planDeploy({ local: { f: want }, live: { f: live() }, state: { f: rec }, all: true }).deploy[0].reasons, ['--all']);
});

test('adoptable needs a live revision newer than every source change and a clean tree', () => {
  const lastChange = (f) => ({ 'a.ts': '2026-11-09T12:00:00+01:00', 'b.ts': '2026-11-01T00:00:00Z' })[f] ?? null;
  const files = ['a.ts', 'b.ts', 'node_modules/x.js'];
  assert.equal(adoptable({ updateTime: '2026-11-09T11:30:00Z', files, lastChange, dirty: new Set() }), true, 'offsets compared as instants');
  assert.equal(adoptable({ updateTime: '2026-11-09T10:30:00Z', files, lastChange, dirty: new Set() }), false);
  assert.equal(adoptable({ updateTime: '2026-11-10T00:00:00Z', files, lastChange, dirty: new Set(['b.ts']) }), false);
  assert.equal(adoptable({ updateTime: undefined, files, lastChange, dirty: new Set() }), false);
});

test('batches and deployedSince', () => {
  assert.deepEqual(batches(['a', 'b', 'c'], 2), [['a', 'b'], ['c']]);
  assert.deepEqual(batches([], 2), []);
  assert.equal(deployedSince(live({ updateTime: '2026-11-10T00:00:01Z' }), '2026-11-10T00:00:00Z'), true);
  assert.equal(deployedSince(live(), '2026-11-10T00:00:00Z'), false);
  assert.equal(deployedSince(live({ state: 'FAILED', updateTime: '2026-11-11T00:00:00Z' }), '2026-11-10T00:00:00Z'), false);
  assert.equal(deployedSince(undefined, '2026-11-10T00:00:00Z'), false);
});

test('runtimeHash ignores type-only files and edits that do not change the emitted code', async () => {
  const { transformSync } = await import('esbuild');
  const transform = (t) => transformSync(t, { loader: 'ts', minifyWhitespace: true, legalComments: 'none' }).code;
  const h = (text, bytesInOutput = 10, path = 'libs/a.ts') => runtimeHash({ path, text, bytesInOutput, transform });
  assert.equal(h('export interface A { x: string }', 0), h('export interface A { x: number; y: string }', 0));
  assert.equal(h('// note\nexport const a: number = 1;'), h('export const a = 1; // other note'));
  assert.notEqual(h('export const a = 1;'), h('export const a = 2;'));
  assert.notEqual(h('x', 0, 'node_modules/p/i.js'), h('y', 0, 'node_modules/p/i.js'), 'node_modules hash raw, even when shaken out');
});
