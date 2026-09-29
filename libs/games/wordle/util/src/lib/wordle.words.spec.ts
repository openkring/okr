import { describe, expect, it } from 'vitest';

import { WORDLE_LENGTHS } from './wordle.types';
import { rawWordlePool, wordlePool, wordleWords } from './wordle.words';

describe('word catalogue', () => {
  it('has no duplicate in the raw pool (case-insensitive), so pool order stays predictable', () => {
    const lower = rawWordlePool().map(w => w.toLowerCase());
    const dups = lower.filter((w, i) => lower.indexOf(w) !== i);
    expect(dups).toEqual([]);
  });

  it('transcribes to A–Z only', () => {
    for (const word of wordlePool()) expect(word).toMatch(/^[A-Z]+$/);
  });

  it.each(WORDLE_LENGTHS)('serves at least 150 words of length %i, each of that length', length => {
    const words = wordleWords(length);
    expect(words.length).toBeGreaterThanOrEqual(150);
    for (const word of words) expect(word).toHaveLength(length);
  });

  it('counts a transcribed umlaut as two letters', () => {
    expect(wordleWords(5)).toContain('KAESE');
    expect(wordleWords(4)).toContain('TUER');
    expect(wordleWords(4)).toContain('FUSS');
  });

  it('serves nothing for an unsupported length', () => {
    expect(wordleWords(3)).toEqual([]);
    expect(wordleWords(8)).toEqual([]);
  });
});
