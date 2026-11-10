import { describe, expect, it } from 'vitest';

import { DESCRIPTION_LENGTH, NAME_LENGTH } from '@okr/shared-constants';
import { PageModel } from '@okr/shared-models';

import { PAGE_ABSTRACT_LENGTH, pageValidations } from './page.validations';

function newPage(patch: Partial<PageModel> = {}): PageModel {
  return { ...new PageModel('scs'), name: 'home', title: 'Home', type: 'content', state: 'published', ...patch };
}

const run = (page: PageModel) => pageValidations(page, 'scs', '');

describe('pageValidations — website fields', () => {
  it('accepts a page without website fields', () => {
    expect(run(newPage()).hasErrors('abstract')).toBe(false);
    expect(run(newPage()).hasErrors('bannerAltText')).toBe(false);
  });

  it('accepts an abstract of exactly 500 characters', () => {
    expect(PAGE_ABSTRACT_LENGTH).toBe(500);
    expect(run(newPage({ abstract: 'x'.repeat(500) })).hasErrors('abstract')).toBe(false);
  });

  it('rejects an abstract of 501 characters', () => {
    expect(run(newPage({ abstract: 'x'.repeat(501) })).hasErrors('abstract')).toBe(true);
  });

  it('rejects a banner url without alt text', () => {
    expect(run(newPage({ bannerUrl: 'https://x.test/a.jpg', bannerAltText: '' })).hasErrors('bannerAltText')).toBe(true);
    expect(run(newPage({ bannerUrl: 'https://x.test/a.jpg', bannerAltText: '   ' })).hasErrors('bannerAltText')).toBe(true);
  });

  it('accepts a banner url with alt text', () => {
    expect(run(newPage({ bannerUrl: 'https://x.test/a.jpg', bannerAltText: 'Boot' })).hasErrors('bannerAltText')).toBe(false);
  });

  it('accepts alt text without a banner url', () => {
    expect(run(newPage({ bannerUrl: '', bannerAltText: '' })).hasErrors('bannerAltText')).toBe(false);
  });

  it('tolerates legacy pages without the new fields', () => {
    const legacy = newPage();
    delete (legacy as unknown as Record<string, unknown>)['abstract'];
    delete (legacy as unknown as Record<string, unknown>)['bannerUrl'];
    delete (legacy as unknown as Record<string, unknown>)['bannerAltText'];
    expect(run(legacy).hasErrors('abstract')).toBe(false);
    expect(run(legacy).hasErrors('bannerAltText')).toBe(false);
  });

  it('caps subTitle and bannerAltText at NAME_LENGTH', () => {
    expect(run(newPage({ subTitle: 'x'.repeat(NAME_LENGTH) })).hasErrors('subTitle')).toBe(false);
    expect(run(newPage({ subTitle: 'x'.repeat(NAME_LENGTH + 1) })).hasErrors('subTitle')).toBe(true);
    const banner = { bannerUrl: 'https://x.test/a.jpg' };
    expect(run(newPage({ ...banner, bannerAltText: 'x'.repeat(NAME_LENGTH) })).hasErrors('bannerAltText')).toBe(false);
    expect(run(newPage({ ...banner, bannerAltText: 'x'.repeat(NAME_LENGTH + 1) })).hasErrors('bannerAltText')).toBe(true);
  });

  it('caps the meta description at DESCRIPTION_LENGTH', () => {
    const meta = (n: number) => [{ name: 'description', content: 'x'.repeat(n) }];
    expect(run(newPage({ meta: meta(DESCRIPTION_LENGTH) })).hasErrors('meta')).toBe(false);
    expect(run(newPage({ meta: meta(DESCRIPTION_LENGTH + 1) })).hasErrors('meta')).toBe(true);
  });
});
