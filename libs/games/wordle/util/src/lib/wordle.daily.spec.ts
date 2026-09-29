import { describe, expect, it } from 'vitest';

import { dailyWord, dayNumber, isNextDay, randomWord, seededRandom, shuffled } from './wordle.daily';
import { wordleWords } from './wordle.words';

describe('dayNumber / isNextDay', () => {
  it('counts calendar days since 1970-01-01', () => {
    expect(dayNumber('19700101')).toBe(0);
    expect(dayNumber('19700102')).toBe(1);
  });

  it('is not bent by a DST switch', () => {
    // Europe switches to summer time on 2026-03-29
    expect(dayNumber('20260330') - dayNumber('20260329')).toBe(1);
    expect(isNextDay('20260328', '20260329')).toBe(true);
  });

  it('knows month and year boundaries', () => {
    expect(isNextDay('20261231', '20270101')).toBe(true);
    expect(isNextDay('20260228', '20260301')).toBe(true);
    expect(isNextDay('20260227', '20260301')).toBe(false);
    expect(isNextDay('20260301', '20260301')).toBe(false);
  });
});

describe('seededRandom / shuffled', () => {
  it('is deterministic per seed', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('shuffles into a permutation without touching the input', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffled(input, seededRandom(7));
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('dailyWord', () => {
  it('is the same for the same day and length, and a word of that length', () => {
    expect(dailyWord('20260929', 5)).toBe(dailyWord('20260929', 5));
    expect(dailyWord('20260929', 5)).toHaveLength(5);
    expect(wordleWords(5)).toContain(dailyWord('20260929', 5));
  });

  it('does not repeat before the whole list has been played', () => {
    const words = ['AAAA', 'BBBB', 'CCCC', 'DDDD'];
    const start = dayNumber('20260101');
    const days = Array.from({ length: 4 }, (_, i) => {
      const d = new Date((start + i) * 86_400_000);
      return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
    });
    const picked = days.map(day => dailyWord(day, 4, words));
    expect(new Set(picked).size).toBe(4);
  });

  it('yields an empty word for an unsupported length', () => {
    expect(dailyWord('20260929', 3)).toBe('');
  });
});

describe('randomWord', () => {
  it('picks from the list of the length', () => {
    expect(wordleWords(6)).toContain(randomWord(6, () => 0.5));
  });

  it('avoids the previous word', () => {
    const first = wordleWords(4)[0];
    expect(randomWord(4, () => 0, first)).not.toBe(first);
  });
});
