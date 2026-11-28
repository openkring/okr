import { describe, expect, it } from 'vitest';

import type { ArticleSection } from '@okr/shared-models';

import { createPickedSection, newSliderArticle, SLIDER_GALLERY_ID, SLIDER_PRESET } from './section-presets.util';

describe('newSliderArticle', () => {
  it('is an article of the tenant with one empty gallery block in the carousel layout', () => {
    const s = newSliderArticle('scs');
    expect(s.type).toBe('article');
    expect(s.tenants).toEqual(['scs']);
    expect(s.properties.images).toEqual([]);
    expect(s.properties.blocks).toEqual([{ id: SLIDER_GALLERY_ID, type: 'gallery', images: [], layout: 'slider' }]);
  });

  it('does not share its properties between two new sliders', () => {
    const a = newSliderArticle('scs');
    a.properties.blocks?.push({ id: 't', type: 'text', html: '' });
    expect(newSliderArticle('scs').properties.blocks).toHaveLength(1);
  });
});

describe('createPickedSection', () => {
  it('makes the slider preset an article and any other entry a section of that type', () => {
    expect((createPickedSection(SLIDER_PRESET, 'scs') as ArticleSection).properties.blocks?.[0]?.type).toBe('gallery');
    expect(createPickedSection('album', 'scs').type).toBe('album');
  });
});
