import { describe, expect, it } from 'vitest';
import { MAX_ANSWER_LENGTH, normalizeAnswer, normalizeEntries } from './crossword.normalize';

describe('normalizeAnswer', () => {
  it('uppercases and expands umlauts to two characters', () => {
    expect(normalizeAnswer('Rückspiegel')).toBe('RUECKSPIEGEL');
    expect(normalizeAnswer('Öl')).toBe('OEL');
    expect(normalizeAnswer('Ähre')).toBe('AEHRE');
    expect(normalizeAnswer('Strasse')).toBe('STRASSE');
    expect(normalizeAnswer('Straße')).toBe('STRASSE');
  });

  it('strips everything outside A-Z', () => {
    expect(normalizeAnswer('Vierer-Boot')).toBe('VIERERBOOT');
    expect(normalizeAnswer('  Ruder ')).toBe('RUDER');
    expect(normalizeAnswer("O'Brien")).toBe('OBRIEN');
    expect(normalizeAnswer('Café')).toBe('CAFE');
  });

  it('returns an empty string when nothing survives', () => {
    expect(normalizeAnswer('123')).toBe('');
    expect(normalizeAnswer('')).toBe('');
  });
});

describe('normalizeEntries', () => {
  it('rejects answers shorter than three letters after normalisation', () => {
    const result = normalizeEntries([
      { answer: 'Au', clue: 'Flussaue' },
      { answer: 'Öl', clue: 'Schmierstoff' },
      { answer: 'Ruder', clue: 'Damit rudert man' },
    ]);
    expect(result.usable.map(e => e.answer)).toEqual(['OEL', 'RUDER']);
    expect(result.rejected).toEqual([{ index: 0, reason: 'too-short' }]);
  });

  it('rejects answers longer than the maximum', () => {
    const long = 'A'.repeat(MAX_ANSWER_LENGTH + 1);
    const result = normalizeEntries([{ answer: long, clue: 'zu lang' }]);
    expect(result.usable).toEqual([]);
    expect(result.rejected).toEqual([{ index: 0, reason: 'too-long' }]);
  });

  it('treats two answers that normalise alike as a duplicate', () => {
    const result = normalizeEntries([
      { answer: 'Müller', clue: 'Beruf' },
      { answer: 'Mueller', clue: 'Nachname' },
    ]);
    expect(result.usable.map(e => e.answer)).toEqual(['MUELLER']);
    expect(result.rejected).toEqual([{ index: 1, reason: 'duplicate' }]);
  });

  it('rejects an entry whose clue is blank', () => {
    const result = normalizeEntries([{ answer: 'Ruder', clue: '   ' }]);
    expect(result.rejected).toEqual([{ index: 0, reason: 'empty-clue' }]);
  });

  it('keeps the original spelling for display', () => {
    const result = normalizeEntries([{ answer: 'Rückspiegel', clue: 'Im Boot' }]);
    expect(result.usable[0]).toEqual({ index: 0, answer: 'RUECKSPIEGEL', clue: 'Im Boot', raw: 'Rückspiegel' });
  });
});
