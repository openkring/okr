#!/usr/bin/env node
/**
 * Catches i18n gaps before they ship. Production reports every unresolved key to Sentry
 * (`i18n missing-key`), one ticket per key — this finds the same gaps statically.
 *
 *   1. parity     — every translation file has the same leaf keys in de/en/fr/es/it
 *                   (a key missing in it.json renders raw for Italian users only)
 *   2. references — every key the code (libs + scripts/seed-*.mjs) names resolves in `de`:
 *                     '@scope.path.key'              literal
 *                     PFX + 'path.key'               where `const PFX = '@scope.'`
 *                   A scope containing `/` is a lib (libs/<scope>/src/i18n), `@item.*` is a menu
 *                   label (libs/cms/menu/feature), anything else is a top-level key of each app's
 *                   main bundle. A key may resolve to an object (a base the code extends).
 *   3. validation — a bare Vest message (`test('field', 'msg', …)` with no `@`) is looked up by
 *                   okr-error-note as `validation.msg` in the main bundle, so it must exist there.
 *                   Prefer scoped messages ('@<scope>.validation.msg') for lib-specific text.
 *
 * Keys built from runtime data (`${var}` keys, labels typed into live menuItems docs) are out of
 * reach here — scripts/check-menu-labels.mjs covers the live menu docs.
 *
 * Usage: node scripts/check-i18n.mjs   (exit 1 on any finding — CI friendly)
 */
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const LANGS = ['de', 'en', 'fr', 'es', 'it'];

const find = (args) =>
  execSync(`find ${args} -not -path '*/node_modules/*'`, { encoding: 'utf8' })
    .split('\n').filter(Boolean).sort();

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

const leafKeys = (obj, prefix = '', out = new Set()) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') leafKeys(v, key, out);
    else out.add(key);
  }
  return out;
};

/** Resolves a dotted path; like Transloco's flattening, a JSON key may itself contain dots. */
const lookup = (obj, dotKey) => {
  if (obj == null || typeof obj !== 'object') return undefined;
  if (dotKey in obj) return obj[dotKey];
  const parts = dotKey.split('.');
  for (let i = 1; i < parts.length; i++) {
    const head = parts.slice(0, i).join('.');
    if (head in obj) {
      const hit = lookup(obj[head], parts.slice(i).join('.'));
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
};

/**
 * Literals that look like keys but are not looked up — each with its reason.
 * Keyed by file; `*` skips the whole file.
 */
const ALLOWLIST = {
  // maps keys the app USED to write into comment docs; they are meant to be absent
  'libs/comment/util/src/lib/legacy-comment-keys.ts': ['*'],
  // categories nothing renders (no importer outside their own file) — translate them when they get a UI
  'libs/shared/categories/src/lib/quad-bool-type.ts': ['*'],
  'libs/shared/categories/src/lib/shipment-type.ts': ['*'],
  // placeholder text shown in the key input, not a lookup
  'libs/aoc/feature/src/lib/tag-string.form.ts': ['@tag.name'],
};
const allowed = (file, key) => {
  const list = ALLOWLIST[file];
  return Boolean(list && (list.includes('*') || list.includes(key)));
};

const findings = [];
const report = (where, msg) => findings.push(`${where}  ${msg}`);

// ---------------------------------------------------------------- 1. parity
const i18nDirs = [
  ...find(`libs -path '*/src/i18n/de.json'`),
  ...find(`apps -path '*/src/assets/i18n/de.json'`),
].map((f) => f.replace(/\/de\.json$/, ''));

for (const dir of i18nDirs) {
  const de = leafKeys(readJson(`${dir}/de.json`));
  for (const lang of LANGS.slice(1)) {
    const file = `${dir}/${lang}.json`;
    if (!existsSync(file)) { report(file, 'parity: file missing'); continue; }
    const other = leafKeys(readJson(file));
    for (const k of de) if (!other.has(k)) report(file, `parity: missing "${k}" (present in de)`);
    for (const k of other) if (!de.has(k)) report(file, `parity: extra "${k}" (absent from de)`);
  }
}

// ---------------------------------------------------------------- bundles
/** main bundles: one per app (private submodules — may be absent in a public checkout) */
const mainBundles = find(`apps -path '*/src/assets/i18n/de.json'`).map((f) => ({ file: f, json: readJson(f) }));
const scopeCache = new Map();
const scopeBundle = (scope) => {
  if (!scopeCache.has(scope)) {
    const file = `libs/${scope}/src/i18n/de.json`;
    scopeCache.set(scope, existsSync(file) ? readJson(file) : null);
  }
  return scopeCache.get(scope);
};

/**
 * Checks one fully-qualified key ('@scope.path') against its bundle(s); reports into findings.
 */
const checkKey = (where, fullKey) => {
  const raw = fullKey.slice(1);
  const dot = raw.indexOf('.');
  if (dot < 0) return;
  const scope = raw.slice(0, dot);
  const path = raw.slice(dot + 1).replace(/\.$/, '');
  if (!path) return;
  // an object is fine: such literals are bases the code extends at runtime ('i18nBase', `${k}.label`)
  const ok = (v) => typeof v === 'string' || (v !== null && typeof v === 'object');

  // menu labels ('@item.<name>') resolve in the menu lib, whatever app renders them
  if (scope === 'item') {
    const bundle = scopeBundle('cms/menu/feature');
    if (!ok(lookup(bundle, `item.${path}`))) report(where, `reference: "${fullKey}" missing from libs/cms/menu/feature/src/i18n/de.json`);
    return;
  }
  if (scope.includes('/')) {
    const bundle = scopeBundle(scope);
    if (!bundle) { report(where, `reference: unknown scope "${scope}" — no libs/${scope}/src/i18n/de.json`); return; }
    if (!ok(lookup(bundle, path))) report(where, `reference: "${fullKey}" missing from libs/${scope}/src/i18n/de.json`);
    return;
  }
  if (mainBundles.length === 0) return;
  // a top-level name no main bundle knows is not an i18n key (e.g. an email domain) — skip it
  if (!mainBundles.some((b) => scope in b.json)) return;
  for (const b of mainBundles) {
    if (!ok(lookup(b.json, `${scope}.${path}`))) report(where, `reference: "${fullKey}" missing from ${b.file}`);
  }
};

// ---------------------------------------------------------------- 2. references
const KEY_LITERAL = /(['"`])(@[a-z][\w-]*(?:\/[\w-]+)*\.[\w.-]*)\1/g;
const PFX_DECL = /const\s+(\w+)\s*=\s*(['"`])(@[a-z][\w-]*(?:\/[\w-]+)*\.[\w.-]*)\2/g;

// seed scripts write menuItems docs — their '@item.*' labels must exist before they are seeded
const sources = [
  ...find(`libs -name '*.ts' -not -name '*.spec.ts' -not -name '*.d.ts' -path '*/src/*'`),
  ...find(`scripts -name 'seed-*.mjs'`),
];
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

for (const file of sources) {
  if (ALLOWLIST[file]?.includes('*')) continue;
  // blank out comments (keeping line numbers) — doc examples like '@domain/layer.key' are not lookups
  const src = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/^(\s*)\/\/.*$/gm, '$1');
  if (!src.includes("'@") && !src.includes('"@') && !src.includes('`@')) continue;

  const prefixes = new Map();
  for (const m of src.matchAll(PFX_DECL)) prefixes.set(m[1], m[3]);

  for (const m of src.matchAll(KEY_LITERAL)) {
    const key = m[2];
    if (key.endsWith('.')) continue;                     // a prefix declaration, checked via its uses
    // skip npm import specifiers ('@angular/core.x' never occurs; '@okr/x' has no dot after scope)
    if (allowed(file, key)) continue;
    checkKey(`${file}:${lineOf(src, m.index)}`, key);
  }
  for (const [name, pfx] of prefixes) {
    const use = new RegExp(String.raw`\b${name}\s*\+\s*(['"\`])([\w.-]+)\1`, 'g');
    for (const m of src.matchAll(use)) checkKey(`${file}:${lineOf(src, m.index)}`, pfx + m[2]);
  }

  // ---------------------------------------------------------------- 3. validation
  if (file.endsWith('.validations.ts') && mainBundles.length > 0) {
    for (const m of src.matchAll(/\btest\(\s*['"`][\w.]+['"`]\s*,\s*(['"`])([^'"`@]+)\1/g)) {
      const where = `${file}:${lineOf(src, m.index)}`;
      if (/^[\w.]+$/.test(m[2])) checkKey(where, `@validation.${m[2]}`);
      else report(where, `validation: message "${m[2]}" is prose — okr-error-note looks it up as a key; use '@<scope>.validation.<key>'`);
    }
  }
}

// ---------------------------------------------------------------- result
if (mainBundles.length === 0) console.log('check-i18n: no app main bundles found (submodules not checked out) — main-bundle checks skipped');
if (findings.length) {
  console.error(findings.join('\n'));
  console.error(`\ncheck-i18n: ${findings.length} finding(s)`);
  process.exit(1);
}
console.log('check-i18n: ok');
