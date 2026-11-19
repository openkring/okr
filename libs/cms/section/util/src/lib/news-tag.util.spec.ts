import { describe, expect, it } from 'vitest';

import { filterNewsByTag, hasNewsTag } from './news-tag.util';

describe('hasNewsTag', () => {
  it('keeps every article for an empty tag', () => {
    expect(hasNewsTag('kiss', '')).toBe(true);
    expect(hasNewsTag('', undefined)).toBe(true);
  });

  it('matches one of several comma-separated tags', () => {
    expect(hasNewsTag('verein, reparatur ,kiss', 'reparatur')).toBe(true);
  });

  it('ignores case and surrounding spaces of the wanted tag', () => {
    expect(hasNewsTag('Reparatur', ' reparatur ')).toBe(true);
  });

  it('does not match a tag that only contains the wanted text', () => {
    expect(hasNewsTag('reparaturcafe', 'reparatur')).toBe(false);
  });

  it('treats a missing tags field as no tags', () => {
    expect(hasNewsTag(undefined, 'kiss')).toBe(false);
  });
});

describe('filterNewsByTag', () => {
  it('keeps the order of the matching articles', () => {
    const list = [{ okey: 'a', tags: 'kiss' }, { okey: 'b', tags: 'smaert' }, { okey: 'c', tags: 'kiss,verein' }];
    expect(filterNewsByTag(list, 'kiss').map(a => a.okey)).toEqual(['a', 'c']);
  });
});
