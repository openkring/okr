import { describe, expect, it } from 'vitest';
import { ARTICLE_SECTION_SHAPE, ArticleSection } from '@bk2/shared-models';

import { articleSectionValidations } from './article-section.validations';

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
