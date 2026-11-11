/**
 * Pure helpers of scripts/seed-website-scs.mjs (1.153 task 8). The single source of the tree is the
 * parity fixture apps/scs-website/tests/fixtures/site.json: the seed builds `websites/scs` from it, so
 * what is seeded is exactly what the templates were verified against.
 */
import { readFileSync } from 'node:fs';

export const FIXTURE_URL = new URL('../../apps/scs-website/tests/fixtures/site.json', import.meta.url);

/** Fields a plain --update may touch. Server-only fields are never in here. */
export const EDITABLE_FIELDS = ['name', 'languages', 'tagline', 'taglineI18n', 'nav', 'footer', 'homePageKey'];
/** Set by the Admin-SDK seed on create; on --update only with --set-hosting. */
export const SERVER_FIELDS = ['hostingSite', 'domain', 'templateVersion'];

export const loadFixture = (url = FIXTURE_URL) => JSON.parse(readFileSync(url, 'utf8'));

/** The websites/<id> doc for `fixture` (without the fixture's `//` comment and `okey`). */
export function buildWebsiteDoc(fixture, now = new Date().toISOString()) {
  const { '//': _comment, okey: _okey, ...doc } = fixture;
  return { ...structuredClone(doc), draftChangedAt: now };
}

/** Every node of a tree, depth first, with its path of ids. */
export function walk(tree, path = []) {
  const out = [];
  for (const n of tree ?? []) {
    const p = [...path, n.id];
    out.push({ node: n, path: p });
    if (n.children) out.push(...walk(n.children, p));
  }
  return out;
}

/** Unique page keys referenced by nav, footer and homePageKey, with where they are used. */
export function collectPageKeys(doc) {
  const keys = new Map();
  const add = (key, where) => {
    if (!keys.has(key)) keys.set(key, []);
    keys.get(key).push(where);
  };
  for (const area of ['nav', 'footer']) {
    for (const { node, path } of walk(doc[area])) if (node.type === 'page') add(node.pageKey, `${area}/${path.join('/')}`);
  }
  if (doc.homePageKey) add(doc.homePageKey, 'homePageKey');
  return [...keys].map(([key, usedAt]) => ({ key, usedAt }));
}

/**
 * isPrivate plan. `docs`: pageKey -> page doc data, or null/undefined when the doc does not exist.
 * -> { missing, makePublic, alreadyPublic } (keys).
 */
export function planIsPrivate(keys, docs) {
  const missing = [];
  const makePublic = [];
  const alreadyPublic = [];
  for (const key of keys) {
    const d = docs[key];
    if (!d) missing.push(key);
    else if (d.isPrivate === false) alreadyPublic.push(key);
    else makePublic.push(key); // true or undefined (the model default is true)
  }
  return { missing, makePublic, alreadyPublic };
}

const stable = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]]))
  : x));
export const sameValue = (a, b) => stable(a) === stable(b);

/** A tree as a path -> node-without-children map, for readable per-node diffs. */
export function flattenTree(tree) {
  const m = new Map();
  for (const { node, path } of walk(tree)) {
    const { children, ...rest } = node;
    m.set(path.join('/'), { ...rest, ...(children ? { childIds: children.map((c) => c.id) } : {}) });
  }
  return m;
}

/** Diff existing vs desired on EDITABLE_FIELDS (+ SERVER_FIELDS when `withServer`). Lines of text; [] = equal. */
export function diffSite(existing, desired, { withServer = false } = {}) {
  const lines = [];
  const fields = withServer ? [...EDITABLE_FIELDS, ...SERVER_FIELDS] : EDITABLE_FIELDS;
  for (const f of fields) {
    if (sameValue(existing[f], desired[f])) continue;
    if (f === 'nav' || f === 'footer') {
      const a = flattenTree(existing[f]);
      const b = flattenTree(desired[f]);
      for (const [p, n] of b) {
        if (!a.has(p)) lines.push(`+ ${f}/${p}  ${stable(n)}`);
        else if (!sameValue(a.get(p), n)) lines.push(`~ ${f}/${p}\n    - ${stable(a.get(p))}\n    + ${stable(n)}`);
      }
      for (const p of a.keys()) if (!b.has(p)) lines.push(`- ${f}/${p}`);
    } else {
      lines.push(`~ ${f}\n    - ${stable(existing[f])}\n    + ${stable(desired[f])}`);
    }
  }
  return lines;
}

/** CLI args -> { apply, update, setHosting } or { error }. */
export function parseArgs(argv) {
  const known = ['--apply', '--dry-run', '--update', '--set-hosting'];
  const bad = argv.filter((a) => !known.includes(a));
  if (bad.length) return { error: `unknown argument(s): ${bad.join(' ')}` };
  const has = (f) => argv.includes(f);
  if (has('--apply') && has('--dry-run')) return { error: '--apply and --dry-run exclude each other' };
  if (has('--set-hosting') && !has('--update')) return { error: '--set-hosting only makes sense with --update (create always sets the server fields)' };
  return { apply: has('--apply'), update: has('--update'), setHosting: has('--set-hosting') };
}
