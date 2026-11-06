/**
 * Resolves i18n keys against HEAD's lib bundles — shared by check-i18n, check-live-labels and the
 * migrations that rewrite keys stored in Firestore.
 */
import { existsSync, readFileSync } from 'node:fs';

/** Resolves a dotted path; like Transloco's flattening, a JSON key may itself contain dots. */
export const lookup = (obj, dotKey) => {
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

/** A scope's German bundle, or null when the scope has none (the lib moved, or never existed). */
const readScopeBundle = (scope) => {
  const file = `libs/${scope}/src/i18n/de.json`;
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
};

/**
 * True when a scoped key '@<lib/path>.<path.to.key>' renders text. A non-empty string only: an
 * empty value counts as missing at runtime, and a key without `/` in its scope is not checkable
 * here. `de` stands for all five languages — check-i18n enforces their parity.
 */
export const keyResolves = (key, readBundle = readScopeBundle) => {
  const dot = key.indexOf('.');
  if (!key.startsWith('@') || dot < 0) return false;
  const scope = key.slice(1, dot);
  if (!scope.includes('/')) return false;
  const value = lookup(readBundle(scope), key.slice(dot + 1));
  return typeof value === 'string' && value !== '';
};

/** The keys a category's items render with — getItemLabel; [] for a category that shows raw names. */
export const categoryItemKeys = (category) =>
  category.i18n && category.translateItems
    ? (category.items ?? []).map((item) => `${category.i18n}.${category.name}.${item.name}.label`)
    : [];
