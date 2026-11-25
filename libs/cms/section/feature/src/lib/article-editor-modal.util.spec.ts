import { describe, expect, it } from 'vitest';

import { articleSectionValidations } from '@okr/cms-section-util';
import type { ArticleBlock, ArticleSection } from '@okr/shared-models';

import { closeDecision, withFieldDefaults } from './article-editor-modal.util';

const text = (id: string, html = `<p>${id}</p>`): ArticleBlock => ({ id, type: 'text', html });
const section = (blocks: ArticleBlock[], o: object = {}): ArticleSection => ({ okey: 's', type: 'article', title: 'T', properties: { images: [], blocks }, ...o }) as unknown as ArticleSection;

describe('withFieldDefaults', () => {
  it('a stored article without fields the suite requires has no error that the author could not see or mend', () => {
    const bare = { okey: 'a', type: 'article', properties: { blocks: [text('a')] } } as unknown as ArticleSection;
    expect(articleSectionValidations(bare).isValid()).toBe(false);
    expect(articleSectionValidations(withFieldDefaults(bare)).getErrors()).toEqual({});
  });

  it('null is missing too, what is set stays, also a wrong value', () => {
    const s = withFieldDefaults({ ...section([]), notes: null, roleNeeded: 'admin', isArchived: true, title: 5 } as unknown as ArticleSection) as unknown as Record<string, unknown>;
    expect(s).toMatchObject({ notes: '', roleNeeded: 'admin', isArchived: true, title: 5 });
  });

  it('does not hide an article that everybody could see, and does not touch its input', () => {
    const bare = section([]);
    expect(withFieldDefaults(bare).roleNeeded).toBe('');
    expect('roleNeeded' in bare).toBe(false);
  });

  it.each([undefined, null, ''])('does not open a new article with the role %j', (roleNeeded) => {
    expect(withFieldDefaults(section([], { roleNeeded }), true).roleNeeded).toBe('contentAdmin');
    expect(withFieldDefaults(section([], { roleNeeded: 'registered' }), true).roleNeeded).toBe('registered');
  });

  it('the same object when nothing is missing', () => {
    const full = withFieldDefaults(section([]));
    expect(withFieldDefaults(full)).toBe(full);
  });
});

describe('closeDecision', () => {
  it.each([
    [{ done: false, saving: false, changed: false }, 'allow'],
    [{ done: false, saving: false, changed: true }, 'ask'],
    [{ done: false, saving: true, changed: true }, 'refuse'],
    [{ done: false, saving: true, changed: false }, 'refuse'],
    [{ done: true, saving: false, changed: true }, 'allow'],
    [{ done: true, saving: true, changed: true }, 'allow'],
  ])('%j → %s', (situation, expected) => expect(closeDecision(situation)).toBe(expected));
});
