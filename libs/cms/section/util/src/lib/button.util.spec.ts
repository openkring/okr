import { describe, expect, it } from 'vitest';

import { toCssLength } from './button.util';

describe('toCssLength', () => {
  it('adds px to a plain number string', () => {
    expect(toCssLength('120', '60')).toBe('120px');
  });
  it('adds px to a number', () => {
    expect(toCssLength(80, '60')).toBe('80px');
  });
  it('keeps a value with a unit', () => {
    expect(toCssLength('4rem', '60')).toBe('4rem');
    expect(toCssLength('50%', '60')).toBe('50%');
    expect(toCssLength('60px', '60')).toBe('60px');
  });
  it('falls back on an empty value', () => {
    expect(toCssLength('', '60')).toBe('60px');
    expect(toCssLength(undefined, '60')).toBe('60px');
    expect(toCssLength('  ', '60')).toBe('60px');
  });
  it('returns an empty string when the fallback is empty too', () => {
    expect(toCssLength(undefined, '')).toBe('');
  });
});
