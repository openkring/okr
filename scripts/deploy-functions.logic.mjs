// Pure logic for scripts/deploy-functions.mjs: which Cloud Functions changed since their last deploy.
//
// All functions ship in ONE directory, so firebase-tools' own "skip unchanged" hash (whole
// packaged source) changes for every function on every edit. Instead we hash, per exported
// function, only what that function can reach:
//
//   - the source closure of the file that DEFINES it (resolved through main.ts and barrel
//     re-exports), following every import edge in the esbuild metafile — static, require and
//     dynamic import() alike; bundled node_modules files are hashed by content;
//   - the exact version of every external package that closure imports;
//   - its endpoint as the functions SDK reports it (trigger, region, memory, secrets, retry …);
//   - a global part every function shares (init.ts closure, main.ts outside its export lines,
//     build options, pnpm pin, assets).
//
// Each function loads its own modules only (split-functions.mjs): code for all functions belongs in init.ts.
import { createHash } from 'node:crypto';
import ts from 'typescript';

/** Bump to force every function to count as changed once (hash recipe changed). */
export const HASH_SCHEMA = 1;

export const sha = (s) => createHash('sha256').update(s).digest('hex');

/** JSON.stringify with sorted object keys, so equal objects hash equally. */
export function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/**
 * The export table of one TS module: name → where it comes from, plus `export *` specifiers.
 *   { kind: 'local' }                         defined here (export const/function/class, export { x })
 *   { kind: 'from', spec, name }              export { name as alias } from 'spec'
 *   { kind: 'from', spec, name } via import   export const a = Ns.b  (import * as Ns from 'spec')
 *                                              export const a = b     (import { b } from 'spec')
 */
export function parseExports(text, fileName = 'x.ts') {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const namespaces = new Map(); // local ns name → spec
  const named = new Map(); // local name → { spec, name }
  const exports = new Map();
  const stars = [];
  const isExported = (n) => ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.importClause && !st.importClause.isTypeOnly) {
      const spec = st.moduleSpecifier.text;
      const nb = st.importClause.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) namespaces.set(nb.name.text, spec);
      if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) named.set(el.name.text, { spec, name: (el.propertyName ?? el.name).text });
    }
  }
  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st)) {
      if (st.isTypeOnly) continue;
      const spec = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : null;
      if (!st.exportClause) { if (spec) stars.push(spec); continue; }
      if (ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) {
          if (el.isTypeOnly) continue;
          const local = (el.propertyName ?? el.name).text;
          if (spec) exports.set(el.name.text, { kind: 'from', spec, name: local });
          else if (named.has(local)) exports.set(el.name.text, { kind: 'from', ...named.get(local) });
          else exports.set(el.name.text, { kind: 'local' });
        }
      }
      continue;
    }
    if (!isExported(st)) continue;
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const init = d.initializer;
        if (init && ts.isPropertyAccessExpression(init) && ts.isIdentifier(init.expression) && namespaces.has(init.expression.text)) {
          exports.set(d.name.text, { kind: 'from', spec: namespaces.get(init.expression.text), name: init.name.text });
        } else if (init && ts.isIdentifier(init) && named.has(init.text)) {
          exports.set(d.name.text, { kind: 'from', ...named.get(init.text) });
        } else {
          exports.set(d.name.text, { kind: 'local' });
        }
      }
    } else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) {
      exports.set(st.name.text, { kind: 'local' });
    }
  }
  return { exports, stars };
}

/** Resolve a relative specifier against the files the bundle actually contains. */
export function resolveSpecifier(fromFile, spec, has) {
  if (!spec.startsWith('.')) return null;
  const parts = fromFile.split('/').slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  const base = parts.join('/');
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}.js`, `${base}/index.js`].find(has) ?? null;
}

/**
 * The file that defines export `name` of `file`, following re-exports and namespace aliases.
 * Returns null when it cannot be followed (non-relative specifier, missing file, cycle).
 */
export function resolveDefinition(name, file, { readFile, has }, seen = new Set()) {
  const key = `${file}#${name}`;
  if (seen.has(key)) return null;
  seen.add(key);
  const { exports, stars } = parseExports(readFile(file), file);
  const e = exports.get(name);
  if (e?.kind === 'local') return file;
  if (e?.kind === 'from') {
    const target = resolveSpecifier(file, e.spec, has);
    return target ? resolveDefinition(e.name, target, { readFile, has }, seen) : null;
  }
  for (const spec of stars) {
    const target = resolveSpecifier(file, spec, has);
    const hit = target && resolveDefinition(name, target, { readFile, has }, seen);
    if (hit) return hit;
  }
  return null;
}

/**
 * Content hash of one bundled file as it RUNS: a file that contributes no bytes to the bundle
 * (interfaces, types, fully tree-shaken) hashes to a constant, and TS sources are hashed after
 * type-stripping (`transform`, e.g. esbuild transformSync with minifyWhitespace), so type-only,
 * comment-only and formatting edits deploy nothing. node_modules files hash raw.
 */
export function runtimeHash({ path, text, bytesInOutput, transform }) {
  if (path.includes('node_modules/')) return sha(text);
  if (!bytesInOutput) return 'no-runtime-code';
  return sha(transform(text, path));
}

/** Package name of a bare import path: 'firebase-admin/firestore' → 'firebase-admin', '@a/b/c' → '@a/b'. */
export const packageName = (p) => (p.startsWith('@') ? p.split('/').slice(0, 2) : p.split('/').slice(0, 1)).join('/');

/**
 * Transitive closure over the esbuild metafile `inputs` from `roots`, following every import kind
 * (import-statement, require-call, dynamic-import …). Returns the bundled files and the external
 * packages they import.
 */
export function closure(inputs, roots) {
  const files = new Set();
  const externals = new Set();
  const queue = [...roots];
  while (queue.length) {
    const f = queue.pop();
    if (files.has(f) || !inputs[f]) continue;
    files.add(f);
    for (const imp of inputs[f].imports ?? []) {
      if (imp.external) externals.add(packageName(imp.path));
      else if (!files.has(imp.path)) queue.push(imp.path);
    }
  }
  return { files, externals };
}

/** main.ts without its import and export statements: the code that runs once for every function. */
export function mainSkeleton(text) {
  const sf = ts.createSourceFile('main.ts', text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  return sf.statements
    .filter((st) => !ts.isImportDeclaration(st) && !ts.isExportDeclaration(st)
      && !ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
    .map((st) => st.getText(sf))
    .join('\n');
}

/**
 * The bundle files every function shares: the closures of main.ts imports that define no
 * function (init.ts, express, …). `functionModules` are the main.ts specifiers the exports
 * resolve through.
 */
export function globalRoots(inputs, mainFile, functionModules) {
  return (inputs[mainFile]?.imports ?? [])
    .filter((i) => !i.external && !functionModules.has(i.path))
    .map((i) => i.path);
}

/**
 * One hash per function plus its parts, so a plan can say WHY it changed.
 * fileHash(path) → content hash, versionOf(pkg) → installed version.
 */
export function functionHash({ files, externals, endpoint, globalHash, fileHash, versionOf }) {
  const src = sha(stableStringify({
    files: [...files].sort().map((f) => [f, fileHash(f)]),
    externals: [...externals].sort().map((p) => [p, versionOf(p)]),
  }));
  const config = sha(stableStringify(endpoint ?? null));
  const hash = sha(stableStringify({ v: HASH_SCHEMA, src, config, global: globalHash })).slice(0, 40);
  return { hash, src, config, global: globalHash };
}

/** Secret versions a live function pins: { NAME: '3' }. */
export function pinnedSecrets(liveFn) {
  return Object.fromEntries((liveFn?.serviceConfig?.secretEnvironmentVariables ?? []).map((s) => [s.secret, String(s.version)]));
}

/**
 * Decide per function: deploy (with reasons) or skip.
 *   local:   { name: { hash, src, config, global } }
 *   live:    { name: GCF v2 function (state, updateTime, labels, serviceConfig) }
 *   state:   { name: { hash, src, config, global, fbHash } }  — recorded at our last deploy
 *   latestSecrets: { SECRET: '4' } latest enabled version per secret (optional)
 *   forced:  names to deploy regardless; all: deploy everything
 */
export function planDeploy({ local, live, state, latestSecrets = {}, forced = [], all = false }) {
  const deploy = [];
  const skip = [];
  for (const name of Object.keys(local).sort()) {
    const want = local[name];
    const have = live[name];
    const rec = state[name];
    const reasons = [];
    if (all) reasons.push('--all');
    if (forced.includes(name)) reasons.push('named');
    if (!have) reasons.push('new');
    else {
      if (have.state !== 'ACTIVE') reasons.push(`live state ${have.state}`);
      if (!rec) reasons.push('no deploy record');
      else {
        if (rec.fbHash !== have.labels?.['firebase-functions-hash']) reasons.push('deployed outside this script since');
        if (rec.src !== want.src) reasons.push('code');
        if (rec.config !== want.config) reasons.push('config');
        if (rec.global !== want.global) reasons.push('shared setup');
        if (rec.hash !== want.hash && reasons.length === 0) reasons.push('hash schema');
      }
      for (const [secret, version] of Object.entries(pinnedSecrets(have))) {
        const latest = latestSecrets[secret];
        if (latest && /^\d+$/.test(version) && Number(latest) > Number(version)) reasons.push(`secret ${secret} v${version}→v${latest}`);
      }
    }
    (reasons.length ? deploy : skip).push({ name, reasons });
  }
  const orphans = Object.keys(live).filter((n) => !local[n]).sort();
  return { deploy, skip, orphans };
}

/**
 * Bootstrap: a function with no usable record counts as current when its live revision is newer
 * than the last commit to anything it is built from and none of those files is uncommitted.
 *   lastChange(file) → ISO time or null; dirty: Set of uncommitted files.
 */
export function adoptable({ updateTime, files, lastChange, dirty }) {
  if (!updateTime) return false;
  let newest = 0;
  for (const f of files) {
    if (dirty.has(f)) return false;
    const t = lastChange(f);
    if (t) newest = Math.max(newest, new Date(t).getTime());
  }
  return new Date(updateTime).getTime() > newest;
}

/** Split names into batches of `size`. */
export const batches = (names, size) => Array.from({ length: Math.ceil(names.length / size) }, (_, i) => names.slice(i * size, (i + 1) * size));

/** A deploy succeeded for a function when its live revision is newer than the batch start and ACTIVE. */
export const deployedSince = (liveFn, startIso) => !!liveFn && liveFn.state === 'ACTIVE' && new Date(liveFn.updateTime) > new Date(startIso);
