import { describe, expect, it } from 'vitest';

import { fill } from './aoc-i18n';

describe('fill', () => {
  it('substitutes single-brace placeholders', () => {
    expect(fill('{done} von {count} erstellt', { done: 3, count: 240 })).toBe('3 von 240 erstellt');
  });

  it('replaces every occurrence of the same placeholder', () => {
    expect(fill('{n}/{n}', { n: 7 })).toBe('7/7');
  });

  it('leaves an unknown placeholder in place rather than emitting undefined', () => {
    expect(fill('{done} von {count}', { done: 3 })).toBe('3 von {count}');
  });
});
