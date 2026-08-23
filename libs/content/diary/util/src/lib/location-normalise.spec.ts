import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIARY_FILE_NAME } from './diary-file';
import { fmScalar } from './diary-frontmatter';
import { parseDiaryMarkdown } from './diary-parse';
import { normaliseLocationLabel } from './location-normalise';

describe('normaliseLocationLabel', () => {
  it('lowercases and folds accents so one alias covers every spelling', () => {
    expect(normaliseLocationLabel('Zürich')).toBe('zuerich');
  });

  it('drops a trailing two-letter Swiss canton code', () => {
    expect(normaliseLocationLabel('Zürich ZH')).toBe('zuerich');
    expect(normaliseLocationLabel('Stäfa ZH')).toBe('staefa');
  });

  it('drops a trailing country suffix after a comma', () => {
    expect(normaliseLocationLabel('Zürich, Switzerland')).toBe('zuerich');
    expect(normaliseLocationLabel('Firenze, Italy')).toBe('firenze');
  });

  it('keeps a two-letter token that is not a canton', () => {
    // 'GO' is not a Swiss canton — dropping it would merge two different places.
    expect(normaliseLocationLabel('Rio GO')).toBe('rio-go');
  });

  it('keeps an interior comma segment that is not a country', () => {
    expect(normaliseLocationLabel('Dieni, Sedrun')).toBe('dieni-sedrun');
  });

  it('collapses whitespace, slashes and repeated separators', () => {
    expect(normaliseLocationLabel('  Dieni / Sedrun  ')).toBe('dieni-sedrun');
  });

  it('returns an empty string for an empty or punctuation-only label', () => {
    expect(normaliseLocationLabel('')).toBe('');
    expect(normaliseLocationLabel('  ,  ')).toBe('');
  });

  it('is idempotent — re-normalising an already-normalised key changes nothing', () => {
    const inputs = [
      'Zürich', 'Zürich ZH', 'Stäfa ZH', 'Zürich, Switzerland', 'Firenze, Italy',
      'Rio GO', 'Dieni, Sedrun', '  Dieni / Sedrun  ', '', '  ,  ',
      // Two consecutive canton-like trailing tokens: a single pop used to leave one behind,
      // so f(x) !== f(f(x)). The strip must loop until no trailing token is a canton code.
      'Foo AG SG',
    ];
    for (const input of inputs) {
      const once = normaliseLocationLabel(input);
      expect(normaliseLocationLabel(once)).toBe(once);
    }
  });
});

/**
 * Round-trips the real diary archive. The archive is personal data and never enters this
 * repository, so this suite only runs when DIARY_ARCHIVE points at it:
 *
 *   DIARY_ARCHIVE=/Users/bruno/gdrive/archive/202x pnpm nx test content-diary-util
 *
 * Without the variable — in CI, and for anyone but the archive's owner — it skips.
 */
const archive = process.env['DIARY_ARCHIVE'];

function collect(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) collect(path, found);
    else if (DIARY_FILE_NAME.test(entry)) found.push(path);
  }
  return found;
}

describe.skipIf(!archive)('normaliseLocationLabel against the real corpus', () => {
  it('collapses the raw location values to strictly fewer keys, and never to an empty one', () => {
    const raw = new Set<string>();
    for (const path of collect(archive as string)) {
      const value = fmScalar(parseDiaryMarkdown(readFileSync(path, 'utf8')), 'location');
      if (value) raw.add(value);
    }
    const keys = new Set([...raw].map(normaliseLocationLabel));
    expect(raw.size).toBeGreaterThan(100);          // guard against a wrong path passing silently
    expect(keys.size).toBeLessThan(raw.size);        // normalisation must actually merge something
    expect([...keys].every((k) => k.length > 0)).toBe(true);
  });

  it('is idempotent for every raw value in the archive', () => {
    const raw = new Set<string>();
    for (const path of collect(archive as string)) {
      const value = fmScalar(parseDiaryMarkdown(readFileSync(path, 'utf8')), 'location');
      if (value) raw.add(value);
    }
    let unstableCount = 0;
    for (const value of raw) {
      const once = normaliseLocationLabel(value);
      if (normaliseLocationLabel(once) !== once) unstableCount++;
    }
    // Never print the offending value(s) — count only.
    expect(unstableCount).toBe(0);
  });
});
