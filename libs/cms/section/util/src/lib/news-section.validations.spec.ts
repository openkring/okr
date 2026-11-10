import { describe, expect, it } from 'vitest';

import { NEWS_SECTION_SHAPE, NewsSection } from '@okr/shared-models';
import { newsSectionValidations } from './news-section.validations';
import { getSectionValidationSuite } from './section-validation-registry';

const model = (props: Partial<NewsSection['properties']>): NewsSection =>
  ({ ...NEWS_SECTION_SHAPE, properties: { ...NEWS_SECTION_SHAPE.properties, ...props } }) as NewsSection;

describe('newsSectionValidations (1.151)', () => {
  it('accepts an empty more url', () => {
    expect(newsSectionValidations(model({ showMoreButton: true, moreUrl: '' })).hasErrors('moreUrl')).toBe(false);
  });

  it('accepts app routes and website pages', () => {
    for (const moreUrl of ['/private/news_@TID@/c-contentpage', 'news.html', '#news', 'https://x.ch']) {
      expect(newsSectionValidations(model({ showMoreButton: true, moreUrl })).hasErrors('moreUrl')).toBe(false);
    }
  });

  it('rejects unsafe urls while the more button is on', () => {
    for (const moreUrl of ['javascript:alert(1)', '//evil.com', 'http://x.ch', 'data:text/html,x']) {
      expect(newsSectionValidations(model({ showMoreButton: true, moreUrl })).hasErrors('moreUrl')).toBe(true);
    }
  });

  it('does not check the url while the more button (and so the field) is hidden', () => {
    expect(newsSectionValidations(model({ showMoreButton: false, moreUrl: 'javascript:x' })).hasErrors('moreUrl')).toBe(false);
  });

  it('is the registered suite for news', () => {
    expect(getSectionValidationSuite('news')(model({ showMoreButton: true, moreUrl: '//evil.com' })).hasErrors('moreUrl')).toBe(true);
  });
});
