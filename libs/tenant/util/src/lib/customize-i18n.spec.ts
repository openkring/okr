import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODEL_FIELDS } from '@okr/shared-util-core';

import { CUSTOMIZE_I18N_KEYS, customizeFieldKey, customizeGroupKey } from './customize-i18n';

const LANGS = ['de', 'en', 'fr', 'es', 'it'];
const bundles = Object.fromEntries(LANGS.map((lang) => [
  lang, JSON.parse(readFileSync(join(__dirname, '..', 'i18n', `${lang}.json`), 'utf8')) as Record<string, unknown>,
]));

/** Looks a scope key such as '@tenant/util.customize.field_person_title' up in a bundle. */
function lookup(bundle: Record<string, unknown>, key: string): unknown {
  return key.replace('@tenant/util.', '').split('.').reduce<unknown>(
    (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), bundle);
}

const entries = Object.entries(MODEL_FIELDS).flatMap(([model, specs]) => specs.map((s) => ({ model, field: s.field })));

describe('CUSTOMIZE_I18N_KEYS', () => {
  it('names a field label per MODEL_FIELDS entry', () => {
    expect(customizeFieldKey('resource.rboat', 'tripAlert')).toBe('field_resource_rboat_tripAlert');
    for (const { model, field } of entries) {
      expect(CUSTOMIZE_I18N_KEYS, `${model}.${field}`).toHaveProperty(customizeFieldKey(model, field));
    }
  });

  it('has a group title per model', () => {
    for (const model of Object.keys(MODEL_FIELDS)) {
      expect(CUSTOMIZE_I18N_KEYS).toHaveProperty(customizeGroupKey(model));
    }
  });

  it.each(LANGS)('has a non-empty text for every key in %s', (lang) => {
    for (const [name, key] of Object.entries(CUSTOMIZE_I18N_KEYS)) {
      const text = lookup(bundles[lang], key);
      expect(typeof text, `${lang}: ${name}`).toBe('string');
      expect((text as string).trim().length, `${lang}: ${name}`).toBeGreaterThan(0);
      expect(text as string, `${lang}: ${name}`).not.toContain('!');
    }
  });
});
