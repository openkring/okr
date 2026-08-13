import { describe, expect, it } from 'vitest';

import { chunkRecipients, mergeEmailList, parseEmailList } from './email.util';

describe('parseEmailList', () => {
  it('splits on comma, semicolon and whitespace and lower-cases', () => {
    expect(parseEmailList('A@b.ch; c@d.ch, e@f.ch\ng@h.ch')).toEqual(['a@b.ch', 'c@d.ch', 'e@f.ch', 'g@h.ch']);
  });

  it('drops entries that are not plausible addresses', () => {
    expect(parseEmailList('a@b.ch, nonsense, @b.ch, c@d')).toEqual(['a@b.ch']);
  });

  it('returns an empty list for empty input', () => {
    expect(parseEmailList('   ')).toEqual([]);
  });
});

describe('mergeEmailList', () => {
  it('appends new addresses and keeps the existing order', () => {
    expect(mergeEmailList(['a@b.ch'], 'c@d.ch, e@f.ch')).toEqual(['a@b.ch', 'c@d.ch', 'e@f.ch']);
  });

  it('drops duplicates against the existing list and within the input', () => {
    expect(mergeEmailList(['a@b.ch'], 'A@b.ch, c@d.ch, c@d.ch')).toEqual(['a@b.ch', 'c@d.ch']);
  });
});

describe('chunkRecipients', () => {
  it('splits into full blocks plus a remainder', () => {
    expect(chunkRecipients(['1', '2', '3', '4', '5'], 2)).toEqual([['1', '2'], ['3', '4'], ['5']]);
  });

  it('returns one block when everything fits', () => {
    expect(chunkRecipients(['1', '2'], 500)).toEqual([['1', '2']]);
  });

  it('returns no block for an empty list', () => {
    expect(chunkRecipients([], 500)).toEqual([]);
  });

  it('rejects a size below 1', () => {
    expect(() => chunkRecipients(['1'], 0)).toThrow();
  });
});
