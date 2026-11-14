import { describe, expect, it } from 'vitest';
import { ARTICLE_SECTION_SHAPE, ArticleSection } from '@okr/shared-models';

import { articleSectionValidations } from './article-section.validations';
import { IMAGE_LAYOUT_IDS } from './image-layout.util';

describe('articleSectionValidations', () => {
  it('does not flag a valid title', () => {
    expect(articleSectionValidations({ ...ARTICLE_SECTION_SHAPE }).hasErrors('title')).toBe(false);
  });

  it('flags a non-string title', () => {
    const model = { ...ARTICLE_SECTION_SHAPE, title: 123 } as unknown as ArticleSection;
    expect(articleSectionValidations(model).hasErrors('title')).toBe(true);
  });

  it('does not throw for a section whose properties lack images/imageStyle', () => {
    // older stored article sections may not carry images[] or imageStyle at all
    const model = { ...ARTICLE_SECTION_SHAPE, properties: {} } as unknown as ArticleSection;
    expect(() => articleSectionValidations(model)).not.toThrow();
  });
});

describe('articleSectionValidations cta', () => {
  const withCta = (cta: unknown) =>
    ({ ...ARTICLE_SECTION_SHAPE, properties: { ...ARTICLE_SECTION_SHAPE.properties, cta } }) as unknown as ArticleSection;

  it('does not flag an article without cta', () => {
    const r = articleSectionValidations({ ...ARTICLE_SECTION_SHAPE });
    expect(r.hasErrors('cta.label')).toBe(false);
    expect(r.hasErrors('cta.url')).toBe(false);
  });

  it('accepts label and url together', () => {
    const r = articleSectionValidations(withCta({ label: 'Los', url: 'bootshaus.html', style: 'primary' }));
    expect(r.hasErrors('cta.label')).toBe(false);
    expect(r.hasErrors('cta.url')).toBe(false);
  });

  it('flags a label without url and a url without label', () => {
    expect(articleSectionValidations(withCta({ label: 'Los', url: '', style: 'primary' })).hasErrors('cta.url')).toBe(true);
    expect(articleSectionValidations(withCta({ label: '', url: '#a', style: 'primary' })).hasErrors('cta.label')).toBe(true);
  });

  it('flags an unsafe url', () => {
    expect(articleSectionValidations(withCta({ label: 'Los', url: 'javascript:x', style: 'primary' })).hasErrors('cta.url')).toBe(true);
  });
});

describe('articleSectionValidations imageLayout', () => {
  const withLayout = (imageLayout: unknown, imageCount = 3) =>
    ({
      ...ARTICLE_SECTION_SHAPE,
      properties: {
        ...ARTICLE_SECTION_SHAPE.properties,
        imageLayout,
        images: Array.from({ length: imageCount }, (_, i) => ({ url: `img${i}` })),
      },
    }) as unknown as ArticleSection;

  it('does not flag an article without a layout (the slider)', () => {
    expect(articleSectionValidations({ ...ARTICLE_SECTION_SHAPE }).hasErrors('imageLayout')).toBe(false);
  });

  it('accepts every known layout id', () => {
    for (const id of IMAGE_LAYOUT_IDS) expect(articleSectionValidations(withLayout(id)).hasErrors('imageLayout')).toBe(false);
  });

  it('refuses an unknown layout id', () => {
    expect(articleSectionValidations(withLayout('xyz')).hasErrors('imageLayout')).toBe(true);
    expect(articleSectionValidations(withLayout('')).hasErrors('imageLayout')).toBe(true);
  });

  it('ignores an unknown id below two images (the layout is not used)', () => {
    expect(articleSectionValidations(withLayout('xyz', 1)).hasErrors('imageLayout')).toBe(false);
  });

  it('refuses an unknown id with three images', () => {
    expect(articleSectionValidations(withLayout('xyz', 3)).hasErrors('imageLayout')).toBe(true);
  });
});
