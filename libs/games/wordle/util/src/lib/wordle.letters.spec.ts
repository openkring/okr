import { describe, expect, it } from 'vitest';

import { normalizeLetters } from './wordle.letters';

describe('normalizeLetters', () => {
  it('upper-cases plain letters', () => {
    expect(normalizeLetters('Baum')).toBe('BAUM');
  });

  it('transcribes umlauts and ß', () => {
    expect(normalizeLetters('Käse')).toBe('KAESE');
    expect(normalizeLetters('Möwe')).toBe('MOEWE');
    expect(normalizeLetters('Tür')).toBe('TUER');
    expect(normalizeLetters('Fuß')).toBe('FUSS');
    expect(normalizeLetters('ÄÖÜ')).toBe('AEOEUE');
  });

  it('drops everything that is not a letter A–Z', () => {
    expect(normalizeLetters(' a-b 1c.é ')).toBe('ABC');
    expect(normalizeLetters('Enter')).toBe('ENTER');
    expect(normalizeLetters('')).toBe('');
  });
});
