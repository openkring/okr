import { describe, expect, it } from 'vitest';

import type { SectionModel } from '@okr/shared-models';

import { offersImageUpload, usesArticleEditor } from './article-editor-entry.util';

const section = (o: object = {}): SectionModel => ({ okey: 'a', type: 'article', properties: { images: [] }, ...o }) as unknown as SectionModel;
const withBlocks = (o: object = {}): SectionModel => section({ properties: { blocks: [{ id: 'b', type: 'text', html: '' }] }, ...o });

describe('usesArticleEditor', () => {
  it.each<[string, SectionModel, boolean, boolean, boolean]>([
    ['an article, gate open', section(), false, true, true],
    ['an article, gate closed', section(), false, false, false],
    ['an article with blocks, gate closed', withBlocks(), false, false, true],
    ['an article with an empty list of blocks, gate closed', section({ properties: { blocks: [] } }), false, false, true],
    ['an article with blocks, gate open', withBlocks(), false, true, true],
    ['read-only, gate open', section(), true, true, false],
    ['read-only with blocks', withBlocks(), true, true, false],
    ['an article of a travel journal, gate open', section({ journalKey: 'j' }), false, true, false],
    ['an article of a travel journal with blocks', withBlocks({ journalKey: 'j' }), false, true, false],
    ['an empty journalKey is none', section({ journalKey: '' }), false, true, true],
    ['another type, gate open', section({ type: 'button' }), false, true, false],
    ['another type with a field of that name', withBlocks({ type: 'slider' }), false, true, false],
    ['an article without properties, gate open', section({ properties: undefined }), false, true, true],
    ['an article without properties, gate closed', section({ properties: undefined }), false, false, false],
    ['an article without a key, gate open', section({ okey: '' }), false, true, true],
  ])('%s', (_name, model, readOnly, gateOpen, expected) => {
    expect(usesArticleEditor(model, readOnly, gateOpen)).toBe(expected);
  });
});

describe('offersImageUpload', () => {
  it.each<[string, SectionModel | undefined, boolean, boolean]>([
    ['an article, gate closed', section(), false, true],
    ['an article, gate open', section(), true, false],
    ['an article with blocks, gate closed', withBlocks(), false, false],
    ['an article without properties, gate closed', section({ properties: undefined }), false, true],
    ['another type', section({ type: 'button' }), false, false],
    ['no section', undefined, false, false],
  ])('%s', (_name, model, gateOpen, expected) => {
    expect(offersImageUpload(model, gateOpen)).toBe(expected);
  });
});
