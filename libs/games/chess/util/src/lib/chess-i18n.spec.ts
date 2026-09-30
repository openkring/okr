import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CHESS_I18N_KEYS } from './chess-i18n';

const PFX = '@games/chess/feature.';
const LANGS = ['de', 'en', 'es', 'fr', 'it'];

function bundle(lang: string): Record<string, unknown> {
  const dir = dirname(fileURLToPath(import.meta.url));
  const file = resolve(dir, `../../../feature/src/i18n/${lang}.json`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

function lookup(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
}

describe('chess i18n', () => {
  it('uses the prefix that mirrors the lib path', () => {
    for (const key of Object.values(CHESS_I18N_KEYS)) expect(key.startsWith(PFX)).toBe(true);
  });

  it.each(LANGS)('%s has every key, none empty', lang => {
    const json = bundle(lang);
    for (const key of Object.values(CHESS_I18N_KEYS)) {
      const value = lookup(json, key.slice(PFX.length));
      expect(typeof value === 'string' && value.length > 0, `${lang}: ${key}`).toBe(true);
    }
  });

  it.each(LANGS)('%s has no exclamation mark', lang => {
    expect(JSON.stringify(bundle(lang))).not.toMatch(/[!¡]/);
  });
});
