import { describe, it, expect } from 'vitest';
import { normalizeParty } from './ocr-rule.util';

describe('normalizeParty (must match CF normalizeVendor)', () => {
  it('lowercases, strips diacritics + legal suffix', () => {
    expect(normalizeParty('MIGROS Zürich AG')).toBe('migros zurich');
  });
  it('handles a bare single token', () => {
    expect(normalizeParty('Migros')).toBe('migros');
  });
  it('drops punctuation and the GmbH suffix, strips accents', () => {
    expect(normalizeParty('Café Sélect GmbH')).toBe('cafe select');
  });
  it('drops the Genossenschaft suffix', () => {
    expect(normalizeParty('Coop Genossenschaft')).toBe('coop');
  });
  it('returns empty string for empty/whitespace input', () => {
    expect(normalizeParty('')).toBe('');
    expect(normalizeParty('   ')).toBe('');
  });
});
