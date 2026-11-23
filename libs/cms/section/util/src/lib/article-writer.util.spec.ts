import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ArticleBlock, ArticleSection, ColorIonic, ImageActionType, SectionModel, ViewPosition, drawnArticle, isFreeArticle, withClassicFields,
} from '@okr/shared-models';

import { articleSectionValidations } from './article-section.validations';
import { articlesToWrite } from './article-writer.util';
import { createSection } from './section.util';

/** The article that `GroupStore.createArticleSection` and `ChatMaintenanceStore.ensureArticleSection` write. */
const groupIntro = (htmlContent = '<p></p>'): ArticleSection => ({
  okey: 'g-scs_test', type: 'article', state: 'published', name: 'group-intro-scs_test', title: 'Test', subTitle: '', index: '',
  color: ColorIonic.Light, colSize: '12', roleNeeded: 'groupAdmin', isArchived: false,
  content: { htmlContent, colSize: 3, position: ViewPosition.None },
  properties: {
    images: [],
    imageStyle: {
      imgIxParams: '', width: '100%', height: 'auto', sizes: '(max-width: 786px) 50vw, 100vw', border: '1px', borderRadius: '4px',
      isThumbnail: false, slot: 'none', fill: false, hasPriority: false, action: ImageActionType.None, zoomFactor: 2,
    },
  },
  notes: '', tags: '', tenants: ['scs'],
} as ArticleSection);

/** A starter section of `GroupStore.showOnWebsite`. */
const starter = (type: 'article' | 'tiles'): SectionModel =>
  ({ ...createSection(type, 'scs'), okey: `scs_test_${type}`, name: `scs_test-${type}`, title: 'Wann und wo', state: 'draft' }) as SectionModel;

const open = () => Promise.resolve(true);
const closed = () => Promise.resolve(false);
const blocksOf = (s: SectionModel): ArticleBlock[] | undefined => (s as ArticleSection).properties.blocks;

describe('articlesToWrite', () => {
  afterEach(() => vi.useRealTimers());

  it('gives an article its content as blocks when blocks may be written', async () => {
    const section = groupIntro('<p>Willkommen</p>');
    const [written] = await articlesToWrite([section], open);
    expect(blocksOf(written)).toEqual([{ id: 'classic-text', type: 'text', html: '<p>Willkommen</p>' }]);
    const { blocks: _blocks, ...properties } = written.properties;
    expect({ ...written, properties }).toEqual(section);                                           // nothing else changes
  });

  it('never mutates its input', async () => {
    const section = groupIntro();
    const before = structuredClone(section);
    await articlesToWrite([section], open);
    expect(section).toEqual(before);
  });

  it('writes as today when blocks may not be written', async () => {
    const sections = [groupIntro(), starter('article')];
    const written = await articlesToWrite(sections, closed);
    expect(written[0]).toBe(sections[0]);
    expect(written[1]).toBe(sections[1]);
  });

  it('writes as today when the gate cannot be read', async () => {
    const section = groupIntro();
    expect((await articlesToWrite([section], () => Promise.reject(new Error('offline'))))[0]).toBe(section);
    expect((await articlesToWrite([section], () => { throw new Error('broken'); }))[0]).toBe(section);
  });

  it('writes as today when the gate does not answer, without blocking the action', async () => {
    vi.useFakeTimers();
    const section = groupIntro();
    const written = articlesToWrite([section], () => new Promise<boolean>(() => undefined));
    await vi.advanceTimersByTimeAsync(5000);
    expect((await written)[0]).toBe(section);
  });

  it('asks the gate once, and leaves no timer behind', async () => {
    vi.useFakeTimers();
    const mayWrite = vi.fn(open);
    await articlesToWrite([groupIntro(), starter('article')], mayWrite);
    expect(mayWrite).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('converts the articles of a list only, in place', async () => {
    const sections = [starter('tiles'), starter('article')];
    const written = await articlesToWrite(sections, open);
    expect(written[0]).toBe(sections[0]);
    expect(blocksOf(written[1])?.map((b) => b.type)).toEqual(['text']);
    expect(written.map((s) => s.okey)).toEqual(['scs_test_tiles', 'scs_test_article']);
  });

  it('does not ask the gate when there is nothing to convert', async () => {
    const mayWrite = vi.fn(open);
    const sections = [starter('tiles')];
    expect(await articlesToWrite(sections, mayWrite)).toEqual(sections);
    expect(mayWrite).not.toHaveBeenCalled();
  });

  it('keeps an article that does not convert exactly, for example a picture without url', async () => {
    const section = { ...groupIntro(), properties: { ...groupIntro().properties, images: [{ url: '' }] } } as unknown as ArticleSection;
    expect((await articlesToWrite([section], open))[0]).toBe(section);
    const written = await articlesToWrite([section, groupIntro()], open);   // also beside one that does
    expect(written[0]).toBe(section);
    expect(blocksOf(written[1])).toHaveLength(1);
  });

  it('keeps an article that has blocks', async () => {
    const section = { ...groupIntro(), properties: { images: [], blocks: [{ id: 'a', type: 'text', html: '' }] } } as unknown as ArticleSection;
    expect((await articlesToWrite([section], open))[0]).toBe(section);
  });

  it.each([
    ['the intro of a group', () => groupIntro('<p>Willkommen</p>')],
    ['the empty intro of a converted chat', () => groupIntro()],
    ['a starter article of the website page', () => starter('article') as ArticleSection],
  ])('what is written for %s is valid in the editor, classic, and drawn as today', async (_name, create) => {
    const section = create();
    const [written] = await articlesToWrite([section], open);
    expect(blocksOf(written)).toHaveLength(1);
    expect(articleSectionValidations(written).getErrors()).toEqual(articleSectionValidations(section).getErrors());
    expect(articleSectionValidations(written).getErrors()).toEqual({});
    expect(isFreeArticle(written)).toBe(false);
    expect(drawnArticle(withClassicFields(written))).toEqual(drawnArticle(section));
  });

  it('writes no undefined value (Firestore rejects it)', async () => {
    const [written] = await articlesToWrite([groupIntro()], open);
    expect(JSON.parse(JSON.stringify(written))).toEqual(written);
    expect(Object.values(blocksOf(written)?.[0] ?? {})).not.toContain(undefined);
  });
});
