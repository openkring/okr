#!/usr/bin/env node
/**
 * Generate the `references` array of every `libs/**\/tsconfig.lib.json` from the
 * `@okr/*` imports actually present in that lib's compiled sources.
 *
 * WHY THIS EXISTS
 * ---------------
 * `tsconfig.base.json` maps `@okr/*` to **source** (`libs/*\/src/index.ts`). A
 * `tsconfig.lib.json` that does not declare a dependency as a project reference
 * therefore pulls that sibling lib's sources into its own program. Those files sit
 * outside `rootDir`, so `tsc` reports TS6059/TS6307 and then emits them *next to
 * their sources* — scattering stray `.js`/`.d.ts`/`.js.map` all over `libs/`, which
 * CLAUDE.md forbids. With a reference in place TypeScript instead redirects the
 * import to the referenced project's declaration output, and nothing leaks.
 *
 * `pnpm nx build` is immune (the `@nx/js:tsc` executor rewrites `paths` to `dist/`),
 * so the damage only shows up when someone runs `tsc -b` / `tsc -p` by hand.
 *
 * USAGE
 * -----
 *   node scripts/gen-lib-references.mjs           # check only; exits 1 if out of date
 *   node scripts/gen-lib-references.mjs --write   # rewrite the tsconfigs
 *
 * Only the `references` block is rewritten; all other formatting is preserved.
 * Re-run after adding or removing a cross-lib import.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WRITE = process.argv.includes('--write');

/** Recursively collect files under `dir` that satisfy `keep(filename)`. */
function walk(dir, keep, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') walk(full, keep, out);
    } else if (keep(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// --- 1. alias -> lib dir, from the base path map -----------------------------
const base = JSON.parse(readFileSync(join(ROOT, 'tsconfig.base.json'), 'utf8'));
const aliasToDir = new Map();
for (const [alias, targets] of Object.entries(base.compilerOptions.paths ?? {})) {
  const m = /^(libs\/.+?)\/src\/index\.ts$/.exec(targets[0]);
  if (m && existsSync(join(ROOT, m[1], 'tsconfig.lib.json'))) aliasToDir.set(alias, m[1]);
}

// --- 2. every lib that has a tsconfig.lib.json --------------------------------
const libDirs = [...new Set([...aliasToDir.values(), ...walk(join(ROOT, 'libs'), f => f === 'tsconfig.lib.json').map(f => relative(ROOT, dirname(f)))])].sort();

// --- 3. real dependencies, from the files the lib config actually compiles -----
// Mirrors tsconfig.lib.json's include/exclude: src/**/*.ts minus specs and test setup.
const isCompiled = f => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !f.endsWith('.spec2.ts') && f !== 'test-setup.ts';
const IMPORT_RE = /["'](@okr\/[a-z0-9-]+)["']/g;

const deps = new Map();
const unknown = new Map();
for (const dir of libDirs) {
  const found = new Set();
  for (const file of walk(join(ROOT, dir, 'src'), isCompiled)) {
    const text = readFileSync(file, 'utf8');
    for (const [, alias] of text.matchAll(IMPORT_RE)) {
      const target = aliasToDir.get(alias);
      if (!target) unknown.set(alias, (unknown.get(alias) ?? 0) + 1);
      else if (target !== dir) found.add(target);
    }
  }
  deps.set(dir, [...found].sort());
}

// --- 4. project references may not be circular --------------------------------
const state = new Map(libDirs.map(d => [d, 'white']));
const cycles = [];
function visit(node, stack) {
  state.set(node, 'grey');
  stack.push(node);
  for (const next of deps.get(node) ?? []) {
    if (state.get(next) === 'grey') cycles.push([...stack.slice(stack.indexOf(next)), next]);
    else if (state.get(next) === 'white') visit(next, stack);
  }
  stack.pop();
  state.set(node, 'black');
}
for (const dir of libDirs) if (state.get(dir) === 'white') visit(dir, []);

console.log(`libs with tsconfig.lib.json : ${libDirs.length}`);
console.log(`unknown @okr aliases        : ${unknown.size ? [...unknown.keys()].join(', ') : 'none'}`);
console.log(`dependency cycles           : ${cycles.length}`);
for (const c of cycles.slice(0, 10)) console.log('   CYCLE:', c.join(' -> '));
if (cycles.length) {
  console.error('\nABORT: project references may not be circular.');
  process.exit(1);
}

// --- 5. rewrite only the references block -------------------------------------
const REFS_RE = /,?\s*"references"\s*:\s*\[[\s\S]*?\]\s*(?=\})/;

const stale = [];
for (const dir of libDirs) {
  const file = join(ROOT, dir, 'tsconfig.lib.json');
  const text = readFileSync(file, 'utf8');
  const wanted = deps.get(dir).map(t => relative(join(ROOT, dir), join(ROOT, t, 'tsconfig.lib.json')));

  const current = (JSON.parse(text).references ?? []).map(r => r.path);
  if (current.length === wanted.length && current.every((p, i) => p === wanted[i])) continue;
  stale.push(relative(ROOT, file));

  const stripped = text.replace(REFS_RE, '').trimEnd();
  if (!stripped.endsWith('}')) throw new Error(`unexpected shape: ${file}`);
  const body = stripped.slice(0, -1).trimEnd().replace(/,$/, '');
  const block = wanted.length ? `,\n  "references": [\n${wanted.map(p => `    { "path": "${p}" }`).join(',\n')}\n  ]\n}\n` : '\n}\n';

  const next = body + block;
  JSON.parse(next); // never write invalid JSON
  if (WRITE) writeFileSync(file, next);
}

console.log(`\n${(WRITE ? 'updated' : 'out of date').padEnd(27)} : ${stale.length}`);
console.log(`${'already correct'.padEnd(27)} : ${libDirs.length - stale.length}`);

if (!WRITE && stale.length) {
  console.error(`\n${stale.length} tsconfig.lib.json out of date. Run: node scripts/gen-lib-references.mjs --write`);
  for (const f of stale.slice(0, 20)) console.error(`  ${f}`);
  if (stale.length > 20) console.error(`  ... and ${stale.length - 20} more`);
  process.exit(1);
}
