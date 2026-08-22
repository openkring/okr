import { describe, expect, it } from 'vitest';

import { AliasSpaceModel } from '@okr/shared-models';

import { ALIAS_CHARSETS, buildAliasDocId, generateAliasCode, isValidAliasFormat, normalizeAlias } from './alias-key.util';

describe('normalizeAlias', () => {
  it('lowercases when the space is case-insensitive', () => {
    expect(normalizeAlias('Barbara', false)).toBe('barbara');
  });

  it('leaves the alias untouched when the space is case-sensitive', () => {
    expect(normalizeAlias('Ab3xK9', true)).toBe('Ab3xK9');
  });

  it('trims surrounding whitespace either way', () => {
    expect(normalizeAlias('  gv2026  ', true)).toBe('gv2026');
  });
});

describe('buildAliasDocId', () => {
  it('joins tenant, space and the normalized alias with a double underscore', () => {
    expect(buildAliasDocId('scs', 'qr', 'Ab3x', true)).toBe('scs__qr__Ab3x');
  });

  it('applies the space case rule, so Barbara and barbara are one document', () => {
    expect(buildAliasDocId('scs', 'diary-person', 'Barbara', false))
      .toBe(buildAliasDocId('scs', 'diary-person', 'barbara', false));
  });
});

describe('ALIAS_CHARSETS', () => {
  it('excludes every look-alike from base32-safe', () => {
    for (const c of ['0', 'O', '1', 'l', 'I']) {
      expect(ALIAS_CHARSETS['base32-safe']).not.toContain(c);
    }
  });

  it('holds exactly 32 distinct characters in base32-safe', () => {
    const chars = ALIAS_CHARSETS['base32-safe'];
    expect(chars).toHaveLength(32);
    expect(new Set(chars).size).toBe(32);
  });

  it('holds exactly 62 distinct characters in base62', () => {
    expect(new Set(ALIAS_CHARSETS['base62']).size).toBe(62);
  });
});

describe('generateAliasCode', () => {
  it('returns the requested length', () => {
    expect(generateAliasCode('base32-safe', 6)).toHaveLength(6);
    expect(generateAliasCode('base62', 10)).toHaveLength(10);
  });

  it('only ever emits characters of the chosen alphabet', () => {
    const code = generateAliasCode('base32-safe', 200);
    for (const c of code) expect(ALIAS_CHARSETS['base32-safe']).toContain(c);
  });

  it('maps the random source deterministically onto the alphabet', () => {
    // random() === 0 must pick the first character, every time
    expect(generateAliasCode('base32-safe', 3, () => 0))
      .toBe(ALIAS_CHARSETS['base32-safe'][0].repeat(3));
  });

  it('rejects the words charset until a word list exists', () => {
    expect(() => generateAliasCode('words', 2)).toThrowError(/words/i);
  });
});

describe('isValidAliasFormat', () => {
  it('accepts a code built from the space alphabet', () => {
    const space = new AliasSpaceModel('scs');
    expect(isValidAliasFormat(generateAliasCode('base32-safe', 6), space)).toBe(true);
  });

  it('rejects a slash — it would break the /s/:space/:code route', () => {
    const space = new AliasSpaceModel('scs');
    space.allowCustom = true;
    expect(isValidAliasFormat('a/b', space)).toBe(false);
  });

  it('rejects an empty alias', () => {
    expect(isValidAliasFormat('', new AliasSpaceModel('scs'))).toBe(false);
  });

  it('allows a vanity handle outside the alphabet only when the space permits it', () => {
    const strict = new AliasSpaceModel('scs');
    const open = new AliasSpaceModel('scs');
    open.allowCustom = true;
    expect(isValidAliasFormat('gv2026', strict)).toBe(false);
    expect(isValidAliasFormat('gv2026', open)).toBe(true);
  });
});
