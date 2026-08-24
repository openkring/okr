import { describe, expect, it } from 'vitest';

import { articleSlug } from './news';

describe('articleSlug', () => {
  it('uses the section name when it has one', () => {
    expect(articleSlug({ name: '20260730news_coupedelajeunesse', okey: 'qwia9mb' }))
      .toBe('20260730news_coupedelajeunesse');
  });

  it('falls back to the document id when the name is empty', () => {
    // 2 of scs\'s 209 article sections carry an empty name; an empty slug makes the article
    // unreachable, because the detail route cannot match a blank path segment.
    expect(articleSlug({ name: '', okey: '645sg5sabenrlhc0t1us' })).toBe('645sg5sabenrlhc0t1us');
  });

  it('treats a whitespace-only name as empty', () => {
    expect(articleSlug({ name: '   ', okey: 'abc' })).toBe('abc');
  });

  it('tolerates a missing name field on a legacy document', () => {
    expect(articleSlug({ okey: 'abc' } as { name: string; okey: string })).toBe('abc');
  });
});
