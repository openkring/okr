#!/usr/bin/env node
/**
 * check-lazy-imports — does every `import('@okr/<lib>')` really load lazily? (lazy-loading skill, rule 3)
 *
 *   node scripts/check-lazy-imports.mjs <app> [--warn]
 *
 * An `import('@okr/x').then(m => m.Page)` (or `const { Page } = await import('@okr/x')`) loads nothing
 * lazily when the barrel of @okr/x is in the start bundle anyway — because eager code imports it
 * statically, for a guard or a store. Then the import() makes every export of the barrel eager, the
 * "lazy" page included. Measured 2026-11-28: the login and password-reset pages, the passkeys and
 * the menu list sat in every app's main bundle that way.
 *
 * This reads the BUILT app (dist/apps/<app>/browser, its .js.map files): it takes the static closure of
 * main-*.js and dashboard.page-*.js (the same walk as scripts/bundle-closure.mjs), then, for every named
 * dynamic import in libs/** and apps/<app>/src/**, looks up the file that defines the imported class or
 * function. If that file is in the static closure, it is a finding: give the lib a loader function with a
 * relative import (see auth-pages.loader.ts) and call the loader instead.
 *
 * Exit 1 on a finding (0 with --warn). Run after the production build; the release runs it in postbuild.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const app = process.argv[2];
const warnOnly = process.argv.includes('--warn');
if (!app) {
  console.error('usage: node scripts/check-lazy-imports.mjs <app> [--warn]');
  process.exit(2);
}
const dir = `dist/apps/${app}/browser`;
if (!existsSync(dir)) {
  console.error(`check-lazy-imports: ${dir} not found — build ${app} first`);
  process.exit(warnOnly ? 0 : 2);
}

// 1. the static closure (static edges only: from"./x.js", import"./x.js", export*from"./x.js")
const EDGE = /(?:from|import|export\s*\*\s*from)\s*["'](\.\/[^"']+\.js)["']/g;
const roots = readdirSync(dir).filter((f) => /^(main-|dashboard\.page-).*\.js$/.test(f));
if (!roots.some((f) => f.startsWith('main-'))) {
  console.error(`check-lazy-imports: no main-*.js in ${dir} — refusing`);
  process.exit(warnOnly ? 0 : 2);
}
const closure = new Set();
const stack = [...roots];
while (stack.length) {
  const f = stack.pop();
  if (closure.has(f)) continue;
  closure.add(f);
  for (const m of readFileSync(join(dir, f), 'utf8').matchAll(EDGE)) stack.push(m[1].slice(2));
}

// 2. the source files bundled into that closure, as repo paths (libs/…)
const eager = new Set();
for (const f of closure) {
  const map = join(dir, `${f}.map`);
  if (!existsSync(map)) continue;
  for (const s of JSON.parse(readFileSync(map, 'utf8')).sources) {
    const i = s.indexOf('libs/');
    if (i >= 0) eager.add(s.slice(i));
  }
}

// no maps (the Sentry upload deletes them after the deploy) → an empty set would pass everything
if (!eager.size) {
  console.error(`check-lazy-imports: no source maps in ${dir} — run it right after the production build, before the source-map upload`);
  process.exit(warnOnly ? 0 : 2);
}

// 3. alias → lib source root, from tsconfig.base.json
const paths = JSON.parse(readFileSync('tsconfig.base.json', 'utf8')).compilerOptions.paths;
const libRoot = (alias) => {
  const p = paths[alias]?.[0];
  return p ? p.replace(/\/index\.ts$/, '') : undefined;
};

// 4. named dynamic imports of an @okr barrel, in the libs and in this app
const NAMED = [
  /import\(\s*'(@okr\/[^']+)'\s*\)\s*\.then\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.(\w+)/g,
  /\{\s*([\w\s,]+?)\s*\}\s*=\s*await\s+import\(\s*'(@okr\/[^']+)'\s*\)/g,
];
const files = execFileSync('find',
  ['libs', `apps/${app}/src`, '-name', '*.ts', '-not', '-name', '*.spec.ts', '-not', '-name', '*.d.ts', '-not', '-path', '*/node_modules/*'],
  { encoding: 'utf8' }).split('\n').filter(Boolean);

const definedIn = new Map();
const definition = (root, name) => {
  const key = `${root}#${name}`;
  if (!definedIn.has(key)) {
    let hit = '';
    try {
      hit = execFileSync('grep', ['-rlE', `export (abstract )?(class|const|function|async function) ${name}\\b`, root, '--include=*.ts'],
        { encoding: 'utf8' }).split('\n').filter((l) => l && !l.endsWith('.spec.ts'))[0] ?? '';
    } catch { /* no match */ }
    definedIn.set(key, hit);
  }
  return definedIn.get(key);
};

const findings = [];
for (const path of files) {
  const text = readFileSync(path, 'utf8');
  if (!text.includes('import(')) continue;
  const lineOf = (index) => text.slice(0, index).split('\n').length;
  const check = (alias, name, index) => {
    const root = libRoot(alias);
    if (!root) return;
    const def = definition(root, name);
    if (def && eager.has(def)) findings.push(`${path}:${lineOf(index)}  import('${alias}') → ${name} is in ${app}'s start bundle anyway (${def})`);
  };
  for (const m of text.matchAll(NAMED[0])) check(m[1], m[2], m.index);
  for (const m of text.matchAll(NAMED[1])) {
    for (const part of m[1].split(',')) {
      const name = part.split(':')[0].trim();
      if (name) check(m[2], name, m.index);
    }
  }
}

if (!findings.length) {
  console.log(`✓ check-lazy-imports: every named import() of an @okr barrel is lazy in ${app} (${closure.size} eager chunks)`);
  process.exit(0);
}
console.error(`${warnOnly ? '⚠' : '✖'} check-lazy-imports: ${findings.length} import() load nothing lazily in ${app} — the barrel is eager anyway.`);
console.error('  Give the lib a loader with a relative import (e.g. libs/auth/feature/src/lib/auth-pages.loader.ts) and call it instead.');
for (const f of findings) console.error(`  ${f}`);
process.exit(warnOnly ? 0 : 1);
