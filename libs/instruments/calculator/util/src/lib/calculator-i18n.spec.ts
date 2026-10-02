import { describe, expect, it } from 'vitest';

import de from '../i18n/de.json';
import en from '../i18n/en.json';
import es from '../i18n/es.json';
import fr from '../i18n/fr.json';
import it_ from '../i18n/it.json';
import { CALCULATOR_I18N_KEYS, CATEGORY_I18N_KEYS, UNIT_I18N_KEYS } from './calculator-i18n';
import { PFX } from './scope';

type Tree = { [key: string]: string | Tree };

function lookup(tree: Tree, path: string): string | undefined {
  let node: string | Tree | undefined = tree;
  for (const part of path.split('.')) node = typeof node === 'object' ? node[part] : undefined;
  return typeof node === 'string' ? node : undefined;
}

function shape(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([k, v]) => typeof v === 'string' ? [prefix + k] : shape(v, `${prefix}${k}.`)).sort();
}

const bundles = { de, en, fr, es, it: it_ } as Record<string, Tree>;
const allKeys = [...Object.values(CALCULATOR_I18N_KEYS), ...Object.values(UNIT_I18N_KEYS), ...Object.values(CATEGORY_I18N_KEYS)];

describe('calculator i18n', () => {
  it('resolves every key with a non-empty value in every language', () => {
    for (const [lang, tree] of Object.entries(bundles)) {
      for (const key of allKeys) {
        expect(key.startsWith(PFX), key).toBe(true);
        expect(lookup(tree, key.slice(PFX.length)), `${lang}: ${key}`).toBeTruthy();
      }
    }
  });

  it('has the same key set in all five files', () => {
    const reference = shape(bundles['de']);
    for (const tree of Object.values(bundles)) expect(shape(tree)).toEqual(reference);
  });
});
