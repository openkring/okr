import { describe, expect, it } from 'vitest';

import { ARTICLE_BLOCK_TYPES, MAIL_BLOCK_TYPES } from '@okr/shared-models';

import { ARTICLE_PROFILE, MAIL_PROFILE } from './editor-profile';

describe('editor profiles', () => {
  it('an article keeps the editor of 1.175', () => {
    expect(ARTICLE_PROFILE).toEqual({
      kind: 'article', types: ['text', 'image', 'gallery', 'button', 'columns', 'callout', 'divider', 'space'], columnTypes: ['text', 'image', 'button'],
      devices: ['mobile', 'tablet', 'desktop'], width: { mobile: 390, tablet: 768, desktop: 1100 }, padding: 0,
      tones: ['primary', 'secondary', 'tertiary', 'neutral'], galleryPairs: false, imageAction: 'all', stackReverse: true, placeholders: true,
    });
    expect(ARTICLE_PROFILE.types).toBe(ARTICLE_BLOCK_TYPES);
  });

  it('a mail has events, two devices and two tones', () => {
    expect(MAIL_PROFILE).toEqual({
      kind: 'mail', types: MAIL_BLOCK_TYPES, columnTypes: ['text', 'image', 'button'], devices: ['mobile', 'desktop'], width: { mobile: 390, desktop: 500 }, padding: 30,
      tones: ['primary', 'neutral'], galleryPairs: true, imageAction: 'link', stackReverse: false, placeholders: false,
    });
  });
});
