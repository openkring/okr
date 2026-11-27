import { describe, expect, it } from 'vitest';

import { ArticleBlock, ArticleSection, SectionModel, ViewPosition, drawnArticle, withClassicFields } from '@okr/shared-models';

import { joinWithAbove } from './article-editor.util';
import {
  articleWithBlocks, changedMeanwhile, germanHash, isArticleChanged, newArticleForEditor, openArticle, outdatedPaths, prepareArticleForSave,
} from './article-editor-open.util';

const counter = () => { let n = 0; return () => `n${++n}`; };
const img = (url: string) => ({ url, label: url });
const base = (properties: object = {}, content: object = {}, rest: object = {}): ArticleSection => ({
  okey: 'a1', type: 'article', state: 'published', name: 'n', title: 'T', subTitle: 'S', index: '1', color: 'primary', colSize: '12',
  roleNeeded: 'contentAdmin', isArchived: false, notes: '', tags: '', tenants: ['scs'],
  content: { htmlContent: '<p>hello</p>', colSize: 4, position: ViewPosition.None, ...content },
  properties: { images: [], ...properties }, ...rest,
}) as unknown as ArticleSection;
const blocksOf = (s: ArticleSection): ArticleBlock[] => s.properties.blocks as ArticleBlock[];
const text = (id: string, html: string, htmlI18n?: Record<string, string>) => ({ id, type: 'text', html, ...(htmlI18n ? { htmlI18n } : {}) }) as ArticleBlock;
const withBlocks = (blocks: unknown[], extra: object = {}, rest: object = {}) => base({ blocks, ...extra }, {}, rest);
const meta = (srcHash: string, origin: 'auto' | 'manual' = 'manual') => ({ origin, srcHash, at: 't0' });

describe('openArticle', () => {
  it('turns an article without blocks into blocks and keeps the old fields verbatim', () => {
    const s = base({ images: [img('a.jpg')], imageStyle: { x: 1 }, cta: { label: 'Go', url: '/x', style: 'primary' }, contentI18n: { en: '<p>hi</p>' } }, { position: ViewPosition.Top });
    const opened = openArticle(s, counter());
    expect(opened.notice).toBeUndefined();
    expect(blocksOf(opened.section).map((b) => b.type)).toEqual(['image', 'text', 'button']);
    const p = opened.section.properties as unknown as Record<string, unknown>;
    expect(p['images']).toEqual([img('a.jpg')]);
    expect(p['imageStyle']).toEqual({ x: 1 });
    expect(p['contentI18n']).toEqual({ en: '<p>hi</p>' });
    expect(opened.section.content.htmlContent).toBe('<p>hello</p>');
  });

  it('leaves its input untouched', () => {
    const s = withBlocks([null, { type: 'text' }, text('a', ''), text('a', '<p>b</p>', { de: '<p>de</p>' })]);
    const before = structuredClone(s);
    openArticle(s, counter());
    openArticle(base({ images: [img('a.jpg'), { url: '' }] }, { position: ViewPosition.Left }), counter());
    expect(s).toEqual(before);
  });

  it.each([
    ['text only', {}, {}],
    ['image on top', { images: [img('a.jpg')] }, { position: ViewPosition.Top }],
    ['image at the bottom', { images: [img('a.jpg')] }, { position: ViewPosition.Bottom }],
    ['image left', { images: [img('a.jpg')] }, { position: ViewPosition.Left, colSize: 4 }],
    ['image right', { images: [img('a.jpg')] }, { position: ViewPosition.Right, colSize: 5 }],
    ['gallery on top', { images: [img('a.jpg'), img('b.jpg')], imageLayout: 'row' }, { position: ViewPosition.Top }],
    ['image with button', { images: [img('a.jpg')], cta: { label: 'Go', url: '/x', style: 'primary' } }, { position: ViewPosition.Top }],
    ['hidden image', { images: [img('a.jpg')] }, { position: ViewPosition.None }],
    ['gallery at the bottom', { images: [img('a.jpg'), img('b.jpg')], imageLayout: 'row' }, { position: ViewPosition.Bottom }],
    ['single side-by-side image', { images: [img('a.jpg')], imageLayout: 'big-left' }, { position: ViewPosition.Top }],
    ['single image with slideshow on top', { images: [img('a.jpg')], slideshow: { effect: 'fade', autoplay: true, interval: 3, duration: 1 } }, { position: ViewPosition.Top }],
    ['gallery with slideshow', { images: [img('a.jpg'), img('b.jpg')], slideshow: { effect: 'fade', autoplay: true, interval: 3, duration: 1 } }, { position: ViewPosition.Top }],
    ['text with button', { cta: { label: 'Go', url: '/x', style: 'primary' } }, {}],
    ['translated text', { contentI18n: { en: '<p>hi</p>' } }, {}],
  ])('draws the opened article like the old one: %s', (_name, properties, content) => {
    const s = base(properties, content);
    const opened = openArticle(s, counter());
    expect(opened.notice).toBeUndefined();
    expect(drawnArticle(withClassicFields({ ...opened.section }))).toEqual(drawnArticle(s));
  });

  it('removes images without url and says so', () => {
    const s = base({ images: [img('a.jpg'), { url: '' }] }, { position: ViewPosition.Left, colSize: 4 });
    const { section, notice } = openArticle(s, counter());
    expect(notice).toBe('noPicture');
    expect(blocksOf(section).map((b) => b.type)).toEqual(['columns']);
  });

  it('turns an image place without picture into a lone text', () => {
    const s = base({ images: [{ url: '' }] }, { position: ViewPosition.Left });
    const { section, notice } = openArticle(s, counter());
    expect(notice).toBe('noPicture');
    expect(blocksOf(section).map((b) => b.type)).toEqual(['text']);
  });

  it("notices a look that differs when the article does not convert exactly", () => {
    const s = base({ images: [img('a.jpg')], slideshow: { effect: 'fade', autoplay: true, interval: 3, duration: 1 } }, { position: ViewPosition.Left, colSize: 4 });
    expect(openArticle(s, counter()).notice).toBe('look');
  });

  it('gives no notice for an article with blocks', () => {
    expect(openArticle(withBlocks([text('a', '<p>x</p>')]), counter()).notice).toBeUndefined();
  });

  it('removes entries that are no objects and gives every block its own id', () => {
    const s = withBlocks([null, { type: 'text' }, text('a', '<p>1</p>'), text('a', '<p>2</p>')]);
    const ids = blocksOf(openArticle(s, counter()).section).map((b) => b.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toContain('a');
  });

  it('fixes ids of inner blocks and keeps unknown types verbatim', () => {
    const cols = { id: 'c', type: 'columns', columns: [{ size: 6, blocks: [null, { type: 'text', html: '' }, text('c', '')] }, { size: 6, blocks: [] }] };
    const unknown = { id: 'u', type: 'weird', foo: { bar: 1 } };
    const opened = openArticle(withBlocks([cols, unknown]), counter()).section;
    const [c, u] = blocksOf(opened) as unknown as [{ columns: { blocks: { id: string }[] }[] }, unknown];
    expect(c.columns[0].blocks).toHaveLength(2);
    expect(new Set(['c', ...c.columns[0].blocks.map((b) => b.id)]).size).toBe(3);
    expect(u).toEqual(unknown);
  });

  it('uses htmlI18n.de when html is empty and drops it everywhere', () => {
    const opened = openArticle(withBlocks([text('a', '', { de: '<p>de</p>', en: '<p>en</p>' }), text('b', '<p>own</p>', { de: '<p>other</p>' })]), counter()).section;
    const [a, b] = blocksOf(opened) as unknown as { html: string; htmlI18n?: Record<string, string> }[];
    expect(a).toMatchObject({ html: '<p>de</p>', htmlI18n: { en: '<p>en</p>' } });
    expect(a.htmlI18n).not.toHaveProperty('de');
    expect(b.html).toBe('<p>own</p>');
    expect(b.htmlI18n).toBeUndefined();
  });

  it('gives a block with id "" a new id', () => {
    const ids = blocksOf(openArticle(withBlocks([text('', '<p>a</p>'), text('b', '<p>b</p>')]), counter()).section).map((b) => b.id);
    expect(ids[0]).not.toBe('');
    expect(ids[1]).toBe('b');
  });

  it('survives columns: null and a column without blocks', () => {
    const s = withBlocks([{ id: 'c1', type: 'columns', columns: null }, { id: 'c2', type: 'columns', columns: [{ size: 6 }, { size: 6, blocks: [text('x', '')] }] }]);
    const opened = openArticle(s, counter()).section;
    const [c1, c2] = blocksOf(opened) as unknown as [{ columns: unknown }, { columns: { blocks?: unknown[] }[] }];
    expect(c1.columns).toBeNull();
    expect(c2.columns[0]).toEqual({ size: 6 });
    expect(c2.columns[1].blocks).toHaveLength(1);
  });

  it('turns the German of a classic contentI18n into nothing and keeps the others', () => {
    const opened = openArticle(base({ contentI18n: { de: '<p>hello</p>', en: '<p>hi</p>' } }), counter()).section;
    expect(blocksOf(opened)[0]).toMatchObject({ html: '<p>hello</p>', htmlI18n: { en: '<p>hi</p>' } });
    expect((blocksOf(opened)[0] as unknown as { htmlI18n: object }).htmlI18n).not.toHaveProperty('de');
  });

  it('handles htmlI18n.de inside a column', () => {
    const cols = { id: 'c', type: 'columns', columns: [{ size: 6, blocks: [text('i', '', { de: '<p>de</p>', en: 'e' })] }, { size: 6, blocks: [] }] };
    const opened = openArticle(withBlocks([cols]), counter()).section;
    const inner = (blocksOf(opened)[0] as unknown as { columns: { blocks: object[] }[] }).columns[0].blocks[0];
    expect(inner).toMatchObject({ html: '<p>de</p>', htmlI18n: { en: 'e' } });
    expect(inner).not.toHaveProperty('htmlI18n.de');
  });

  it('fills missing properties and content with empty shapes', () => {
    const s = { okey: 'a', type: 'article', title: 'x' } as unknown as ArticleSection;
    const opened = openArticle(s, counter()).section;
    expect(opened.content).toEqual({ htmlContent: '', colSize: 4, position: ViewPosition.None });
    expect(opened.properties.images).toEqual([]);
    expect(blocksOf(opened).map((b) => b.type)).toEqual(['text']);
  });

  it('is its own baseline', () => {
    const s = base({ images: [img('a.jpg')] }, { position: ViewPosition.Right, colSize: 4 });
    expect(isArticleChanged(openArticle(s, counter()).section, openArticle(s, counter()).section)).toBe(false);
    const messy = withBlocks([null, { type: 'text' }, text('a', '', { de: 'x' })]);
    expect(isArticleChanged(openArticle(messy, counter()).section, openArticle(messy, counter()).section)).toBe(false);
  });
});

describe('newArticleForEditor / articleWithBlocks', () => {
  it('starts with one empty text block and the okey', () => {
    const s = newArticleForEditor(base(), 'new1', counter());
    expect(s.okey).toBe('new1');
    expect(blocksOf(s)).toEqual([{ id: 'n1', type: 'text', html: '' }]);
  });

  it('keeps the blocks a new article was made with (a new slider)', () => {
    const gallery = { id: 'slider-gallery', type: 'gallery', images: [], layout: 'slider' } as ArticleBlock;
    const s = newArticleForEditor(base({ blocks: [gallery] }), 'new1', counter());
    expect(blocksOf(s)).toEqual([gallery]);
  });

  it('turns an article into a block article for writers, keeping old fields', () => {
    const s = articleWithBlocks(base({ images: [img('a.jpg')] }, { position: ViewPosition.Top }));
    expect(blocksOf(s).map((b) => b.type)).toEqual(['image', 'text']);
    expect(s.content.htmlContent).toBe('<p>hello</p>');
  });

  it('returns an article that has blocks unchanged', () => {
    const s = withBlocks([text('a', '<p>x</p>')]);
    expect(articleWithBlocks(s)).toBe(s);
  });
});

describe('isArticleChanged', () => {
  const opened = openArticle(withBlocks([text('a', '<p>x</p>')]), counter()).section;
  it('sees a changed text, title and intro', () => {
    expect(isArticleChanged(opened, { ...opened, properties: { ...opened.properties, blocks: [text('a', '<p>y</p>')] } })).toBe(true);
    expect(isArticleChanged(opened, { ...opened, title: 'other' })).toBe(true);
    expect(isArticleChanged(opened, { ...opened, intro: 'hi' })).toBe(true);
  });
  it('treats absent, undefined, empty as the same and ignores tenants and index', () => {
    expect(isArticleChanged(opened, { ...opened, intro: '', notes: undefined as unknown as string, tenants: ['x'], index: '9' })).toBe(false);
    expect(isArticleChanged(opened, { ...opened, properties: { ...opened.properties, cover: undefined } })).toBe(false);
  });
});

describe('changedMeanwhile', () => {
  const loaded = withBlocks([text('a', '<p>x</p>')], {}, { intro: undefined, tags: '' }) as unknown as SectionModel;
  const stored = () => structuredClone(loaded) as unknown as Record<string, unknown>;

  it('is false for the same data and for loading differences', () => {
    expect(changedMeanwhile(loaded, stored())).toBe(false);
    const s = stored();
    s['intro'] = '';
    s['tags'] = undefined;
    s['index'] = '77';
    s['tenants'] = ['scs', 'kring'];
    s['okey'] = 'zz';
    s['notes'] = '';
    expect(changedMeanwhile(loaded, s)).toBe(false);
  });
  it('treats [] and "" as absent at field level, also in properties via isSameValue', () => {
    const s = stored();
    s['tags'] = [];
    expect(changedMeanwhile(loaded, s)).toBe(false);
    (s['properties'] as Record<string, unknown>)['cover'] = undefined;
    expect(changedMeanwhile(loaded, s)).toBe(false);
  });
  it('is true when a compared field changed', () => {
    for (const [key, value] of [['title', 'new'], ['state', 'draft'], ['isArchived', true], ['colSize', '6'], ['intro', 'x']] as const) {
      const s = stored();
      s[key] = value;
      expect(changedMeanwhile(loaded, s), key).toBe(true);
    }
    const s = stored();
    ((s['properties'] as { blocks: { html: string }[] }).blocks[0]).html = '<p>other</p>';
    expect(changedMeanwhile(loaded, s)).toBe(true);
    const c = stored();
    (c['content'] as Record<string, unknown>)['htmlContent'] = 'z';
    expect(changedMeanwhile(loaded, c)).toBe(true);
  });
});

describe('germanHash', () => {
  it('is 16 hex characters', async () => {
    expect(await germanHash('abc')).toMatch(/^[0-9a-f]{16}$/);
    expect(await germanHash('abc')).toBe('ba7816bf8f01cfea');   // sha-256('abc') starts with it
  });
  it('ignores whitespace and empty paragraphs', async () => {
    expect(await germanHash('<p>a  b</p>')).toBe(await germanHash(' <p>a b</p><p></p>'));
    expect(await germanHash('<p>a</p><p><br></p>')).toBe(await germanHash('<p>a</p>'));
  });
  it('tells different text apart', async () => {
    expect(await germanHash('<p>a</p>')).not.toBe(await germanHash('<p>b</p>'));
  });
});

describe('prepareArticleForSave', () => {
  const NOW = '2026-11-23T10:00:00.000Z';
  const prep = (opened: ArticleSection, current: ArticleSection, copiedFrom: Record<string, string> = {}) =>
    prepareArticleForSave(opened, current, copiedFrom, NOW);
  const metaOf = (s: ArticleSection) => (s.properties as { i18nMeta?: Record<string, Record<string, unknown>> }).i18nMeta;
  const edit = (s: ArticleSection, blocks: ArticleBlock[], extra: object = {}): ArticleSection =>
    ({ ...s, ...extra, properties: { ...s.properties, blocks } }) as ArticleSection;
  const H = (t: string) => germanHash(t);

  it('writes manual meta with the hash of the opened German when German changed and a translation exists', async () => {
    const opened = withBlocks([text('a', '<p>old</p>', { en: '<p>en</p>', fr: '<p>fr</p>' })]);
    const out = await prep(opened, edit(opened, [text('a', '<p>new</p>', { en: '<p>en</p>', fr: '<p>fr</p>' })]));
    const h = await H('<p>old</p>');
    expect(metaOf(out)).toEqual({ 'blocks.a.htmlI18n': { en: { origin: 'manual', srcHash: h, at: NOW }, fr: { origin: 'manual', srcHash: h, at: NOW } } });
  });

  it('writes nothing when German is unchanged or changed only in whitespace; absent stays absent', async () => {
    const opened = withBlocks([text('a', '<p>old</p>', { en: '<p>en</p>' })]);
    const same = await prep(opened, opened);
    expect(same.properties).not.toHaveProperty('i18nMeta');
    const ws = await prep(opened, edit(opened, [text('a', ' <p>old</p><p></p>', { en: '<p>en</p>' })]));
    expect(ws.properties).not.toHaveProperty('i18nMeta');
  });

  it('writes nothing for a language without translation', async () => {
    const opened = withBlocks([text('a', '<p>old</p>')]);
    const out = await prep(opened, edit(opened, [text('a', '<p>new</p>')]));
    expect(out.properties).not.toHaveProperty('i18nMeta');
  });

  it('never changes existing meta', async () => {
    const existing = { 'blocks.a.htmlI18n': { en: meta('zzz', 'auto') } };
    const opened = withBlocks([text('a', '<p>old</p>', { en: 'x', fr: 'y' })], { i18nMeta: existing });
    const out = await prep(opened, edit(opened, [text('a', '<p>new</p>', { en: 'x', fr: 'y' })]));
    expect(metaOf(out)?.['blocks.a.htmlI18n']['en']).toEqual(meta('zzz', 'auto'));
    expect(metaOf(out)?.['blocks.a.htmlI18n']['fr']).toEqual({ origin: 'manual', srcHash: await H('<p>old</p>'), at: NOW });
  });

  it('handles the button label, title, subtitle and intro', async () => {
    const button = (label: string) => ({ id: 'b', type: 'button', cta: { label, url: '/x', style: 'primary', labelI18n: { en: 'Go' } } }) as ArticleBlock;
    const opened = withBlocks([button('Los')], { titleI18n: { en: 'T' }, subTitleI18n: { en: 'S' }, introI18n: { en: 'I' } }, { intro: 'Intro' });
    const current = edit(opened, [button('Weiter')], { title: 'T2', subTitle: 'S2', intro: 'Intro2' });
    const m = metaOf(await prep(opened, current));
    expect(m?.['blocks.b.cta.labelI18n']['en']).toEqual({ origin: 'manual', srcHash: await H('Los'), at: NOW });
    expect(m?.['titleI18n']['en']).toMatchObject({ srcHash: await H('T') });
    expect(m?.['subTitleI18n']['en']).toMatchObject({ srcHash: await H('S') });
    expect(m?.['introI18n']['en']).toMatchObject({ srcHash: await H('Intro') });
  });

  it('finds blocks inside columns', async () => {
    const cols = (html: string) => ({ id: 'c', type: 'columns', columns: [{ size: 6, blocks: [text('i', html, { en: 'e' })] }, { size: 6, blocks: [] }] }) as unknown as ArticleBlock;
    const opened = withBlocks([cols('<p>1</p>')]);
    const m = metaOf(await prep(opened, edit(opened, [cols('<p>2</p>')])));
    expect(m?.['blocks.i.htmlI18n']['en']).toMatchObject({ srcHash: await H('<p>1</p>') });
  });

  it('removes meta of blocks that no longer exist and keeps other paths', async () => {
    const existing = { 'blocks.a.htmlI18n': { en: meta('1') }, 'blocks.gone.htmlI18n': { en: meta('2') }, 'contentI18n': { en: meta('3') } };
    const opened = withBlocks([text('a', '<p>x</p>', { en: 'e' }), text('gone', '<p>g</p>', { en: 'e' })], { i18nMeta: existing });
    const m = metaOf(await prep(opened, edit(opened, [text('a', '<p>x</p>', { en: 'e' })])));
    expect(Object.keys(m ?? {}).sort()).toEqual(['blocks.a.htmlI18n', 'contentI18n']);
  });

  it('removes the key when nothing is left', async () => {
    const opened = withBlocks([text('a', '<p>x</p>', { en: 'e' })], { i18nMeta: { 'blocks.a.htmlI18n': { en: meta('1') } } });
    const out = await prep(opened, edit(opened, []));
    expect(out.properties).not.toHaveProperty('i18nMeta');
  });

  it('copies the meta of a copied block, also for copies of copies', async () => {
    const opened = withBlocks([text('a', '<p>x</p>', { en: 'e' })], { i18nMeta: { 'blocks.a.htmlI18n': { en: meta('h1') } } });
    const current = edit(opened, [text('a', '<p>x</p>', { en: 'e' }), text('c1', '<p>x</p>', { en: 'e' }), text('c2', '<p>x</p>', { en: 'e' })]);
    const m = metaOf(await prep(opened, current, { c1: 'a', c2: 'c1' }));
    expect(m?.['blocks.c1.htmlI18n']['en']).toEqual(meta('h1'));
    expect(m?.['blocks.c2.htmlI18n']['en']).toEqual(meta('h1'));
    expect(m?.['blocks.a.htmlI18n']['en']).toEqual(meta('h1'));
  });

  it('marks a copy whose German was edited, from the source German, when the source has no meta', async () => {
    const opened = withBlocks([text('a', '<p>x</p>', { en: 'e' })]);
    const current = edit(opened, [text('a', '<p>x</p>', { en: 'e' }), text('c1', '<p>edited</p>', { en: 'e' })]);
    const m = metaOf(await prep(opened, current, { c1: 'a' }));
    expect(m?.['blocks.c1.htmlI18n']['en']).toEqual({ origin: 'manual', srcHash: await H('<p>x</p>'), at: NOW });
    expect(m).not.toHaveProperty('blocks.a.htmlI18n');
  });

  it('gives no meta to a new block that is no copy', async () => {
    const opened = withBlocks([text('a', '<p>x</p>')]);
    const out = await prep(opened, edit(opened, [text('a', '<p>x</p>'), text('new', '<p>y</p>', { en: 'e' })]));
    expect(out.properties).not.toHaveProperty('i18nMeta');
  });

  it('marks the upper text of a join that now holds translations of the lower half', async () => {
    const opened = withBlocks([text('up', '<p>A</p>'), text('lo', '<p>B</p>', { en: '<p>b</p>' })]);
    // joinWithAbove: upper keeps its id, German is both halves, the language is filled with the German of the side that lacks it
    const joined = edit(opened, [text('up', '<p>A</p><p>B</p>', { en: '<p>A</p><p>b</p>' })]);
    const m = metaOf(await prep(opened, joined));
    expect(m?.['blocks.up.htmlI18n']['en']).toEqual({ origin: 'manual', srcHash: await H('<p>A</p>'), at: NOW });
  });

  it('marks the upper text of a join whose upper half was translated', async () => {
    const opened = withBlocks([text('up', '<p>A</p>', { en: '<p>a</p>' }), text('lo', '<p>B</p>')]);
    const joined = edit(opened, [text('up', '<p>A</p><p>B</p>', { en: '<p>a</p><p>B</p>' })]);
    const m = metaOf(await prep(opened, joined));
    expect(m?.['blocks.up.htmlI18n']['en']).toMatchObject({ origin: 'manual', srcHash: await H('<p>A</p>') });
  });

  it('keeps the meta inside unknown blocks and drops only known blocks that are gone', async () => {
    const existing = { 'blocks.in.htmlI18n': { en: meta('1') }, 'blocks.gone.htmlI18n': { en: meta('2') } };
    const grid = { id: 'g', type: 'grid', cells: [{ id: 'in' }] } as unknown as ArticleBlock;
    const opened = withBlocks([grid, text('gone', '<p>g</p>', { en: 'e' })], { i18nMeta: existing });
    const m = metaOf(await prep(opened, edit(opened, [grid])));
    expect(Object.keys(m ?? {})).toEqual(['blocks.in.htmlI18n']);
  });

  it('keeps the meta of the lower text when it is joined into a new empty upper text', async () => {
    const opened = withBlocks([text('lo', '<p>B</p>', { en: '<p>b</p>' })], { i18nMeta: { 'blocks.lo.htmlI18n': { en: meta('h1') } } });
    const start = edit(opened, [text('up', ''), text('lo', '<p>B</p>', { en: '<p>b</p>' })]);
    const joined = joinWithAbove(start.properties.blocks as ArticleBlock[], 'lo');
    expect(joined?.joined).toBe(true);
    const m = metaOf(await prep(opened, edit(opened, joined?.blocks ?? []), { up: 'lo' }));
    expect(m).toEqual({ 'blocks.up.htmlI18n': { en: meta('h1') } });
  });

  it('marks a new upper text joined with a translated lower text against the German of the lower', async () => {
    const opened = withBlocks([text('lo', '<p>B</p>', { en: '<p>b</p>' })]);
    const start = edit(opened, [text('up', '<p>A</p>'), text('lo', '<p>B</p>', { en: '<p>b</p>' })]);
    const joined = joinWithAbove(start.properties.blocks as ArticleBlock[], 'lo');
    const m = metaOf(await prep(opened, edit(opened, joined?.blocks ?? []), { up: 'lo' }));
    expect(m).toEqual({ 'blocks.up.htmlI18n': { en: { origin: 'manual', srcHash: await H('<p>B</p>'), at: NOW } } });
  });

  it('does not mutate its input', async () => {
    const opened = withBlocks([text('a', '<p>old</p>', { en: 'e' })]);
    const current = edit(opened, [text('a', '<p>new</p>', { en: 'e' })]);
    const before = structuredClone(current);
    await prep(opened, current, { z: 'a' });
    expect(current).toEqual(before);
  });
});

describe('outdatedPaths', () => {
  it('lists the languages whose meta has another hash than the current German', async () => {
    const h = await germanHash('<p>x</p>');
    const opened = withBlocks([text('a', '<p>x</p>', { en: 'e', fr: 'f' })], { i18nMeta: { 'blocks.a.htmlI18n': { en: meta(h), fr: meta('other') } } });
    expect(await outdatedPaths(opened, opened)).toEqual({ 'blocks.a.htmlI18n': ['fr'] });
  });
  it('lists translations without meta when the German changed since opening', async () => {
    const opened = withBlocks([text('a', '<p>x</p>', { en: 'e' }), text('b', '<p>y</p>', { en: 'e' })], {}, { title: 'T' });
    const current = { ...opened, properties: { ...opened.properties, blocks: [text('a', '<p>changed</p>', { en: 'e' }), text('b', '<p>y</p>', { en: 'e' })] } } as ArticleSection;
    expect(await outdatedPaths(opened, current)).toEqual({ 'blocks.a.htmlI18n': ['en'] });
  });
  it('is empty when nothing is outdated and ignores German and empty translations', async () => {
    const opened = withBlocks([text('a', '<p>x</p>', { de: '<p>x</p>', en: '' })]);
    expect(await outdatedPaths(opened, opened)).toEqual({});
  });
  it('uses the meta, not the change since opening, when meta exists', async () => {
    const h = await germanHash('<p>new</p>');
    const opened = withBlocks([text('a', '<p>old</p>', { en: 'e' })], { i18nMeta: { 'blocks.a.htmlI18n': { en: meta(h) } } });
    const current = { ...opened, properties: { ...opened.properties, blocks: [text('a', '<p>new</p>', { en: 'e' })] } } as ArticleSection;
    expect(await outdatedPaths(opened, current)).toEqual({});
  });
});
