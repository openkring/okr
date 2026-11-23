import { describe, expect, it } from 'vitest';
import {
  ArticleLike, articleBlocksOf, articleCover, blockHtml, blockImages, blocksFromClassic, convertsExactly, drawnArticle, isFreeArticle, isSlideshowActive,
  withClassicFields,
} from './article-blocks.util';
import { ViewPosition } from './enums/view-position.enum';
import { ImageType } from './enums/image-type.enum';
import { ImageConfig } from './image.model';
import { IMAGE_STYLE_SHAPE } from './image.shapes';
import { ArticleBlock, ArticleConfig, ArticleSlideshow, ButtonBlock, CalloutBlock, ColumnsBlock, GalleryBlock, ImageBlock, SectionCta, TextBlock } from './section.model';

const img = (url: string): ImageConfig => ({ label: url, type: ImageType.Image, url, actionUrl: '', altText: '', overlay: '' });
const cta: SectionCta = { label: 'Mehr', url: '/mehr', style: 'primary' };
const show: ArticleSlideshow = { effect: 'fade', autoplay: true, interval: 3, duration: 1 };

type Content = NonNullable<ArticleLike['content']>;
/** builds a deep-frozen article, so every test also proves that the input is not mutated */
function art(content?: Content, properties?: object): ArticleLike {
  return deepFreeze({ type: 'article', ...(content ? { content } : {}), ...(properties ? { properties } : {}) });
}
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}
/** an article made of blocks; the blocks are not type-checked, stored data is not either */
const free = (blocks: unknown, rest: object = {}): ArticleLike => art(undefined, { blocks, ...rest });
const propsOf = (s: ArticleLike): ArticleConfig => s.properties as ArticleConfig;

// blocks
const text = (html: string, more: Partial<TextBlock> = {}): TextBlock => ({ id: `t-${html}`, type: 'text', html, ...more });
const image = (url: string, more: Partial<ImageBlock> = {}): ImageBlock => ({ id: `i-${url}`, type: 'image', image: img(url), ...more });
const gallery = (urls: string[], more: Partial<GalleryBlock> = {}): GalleryBlock => ({ id: 'g', type: 'gallery', images: urls.map(img), ...more });
const button = (c: SectionCta = cta, more: Partial<ButtonBlock> = {}): ButtonBlock => ({ id: `b-${c.url}`, type: 'button', cta: c, ...more });
const callout = (html: string, more: Partial<CalloutBlock> = {}): CalloutBlock => ({ id: `c-${html}`, type: 'callout', html, tone: 'neutral', ...more });
const columns = (sizes: number[], contents: ColumnsBlock['columns'][number]['blocks'][], more: Partial<ColumnsBlock> = {}): ColumnsBlock => ({
  id: 'cols', type: 'columns', columns: contents.map((blocks, i) => ({ size: sizes[i], blocks })), ...more,
});

const roundTrip = (s: ArticleLike) => {
  const { blocks, cover } = blocksFromClassic(s);
  return withClassicFields({ ...s, content: undefined, properties: { blocks, ...(cover ? { cover } : {}) } });
};

const VP = ViewPosition;
type Case = [name: string, content: Content, properties: object];
const CONVERTIBLE: Case[] = [
  ['no image', { position: VP.None, colSize: 6 }, { images: [] }],
  ['no image, no list, no position', {}, {}],
  ['one image Top', { position: VP.Top }, { images: [img('a')] }],
  ['one image Bottom', { position: VP.Bottom }, { images: [img('a')] }],
  ['one image Left', { position: VP.Left, colSize: 4 }, { images: [img('a')] }],
  ['one image Right', { position: VP.Right, colSize: 8 }, { images: [img('a')] }],
  ['one image Left, smallest size', { position: VP.Left, colSize: 1 }, { images: [img('a')] }],
  ['one image Right, largest size', { position: VP.Right, colSize: 11 }, { images: [img('a')] }],
  ['one image None', { position: VP.None }, { images: [img('a')] }],
  ['one image, position absent', {}, { images: [img('a')] }],
  ['one image Left, colSize absent', { position: VP.Left }, { images: [img('a')] }],
  ['one image Top, a layout for several images', { position: VP.Top }, { images: [img('a')], imageLayout: 'big-left' }],
  ['one image Left, a layout that stops the slideshow', { position: VP.Left, colSize: 5 }, { images: [img('a')], imageLayout: 'mosaic', slideshow: show }],
  ['2 images without layout, Bottom', { position: VP.Bottom }, { images: [img('a'), img('b')] }],
  ['2 images without layout, Left with a size', { position: VP.Left, colSize: 4 }, { images: [img('a'), img('b')] }],
  ['3 images mosaic Top', { position: VP.Top }, { images: [img('a'), img('b'), img('c')], imageLayout: 'mosaic' }],
  ['2 images pair Bottom', { position: VP.Bottom }, { images: [img('a'), img('b')], imageLayout: 'pair' }],
  ['2 images slider Bottom', { position: VP.Bottom }, { images: [img('a'), img('b')], imageLayout: 'slider' }],
  ['one image side-by-side Top', { position: VP.Top }, { images: [img('a')], imageLayout: 'side-by-side' }],
  ['one image side-by-side Bottom', { position: VP.Bottom }, { images: [img('a')], imageLayout: 'side-by-side' }],
  ['one image side-by-side Left (drawn on top)', { position: VP.Left, colSize: 4 }, { images: [img('a')], imageLayout: 'side-by-side' }],
  ['one image side-by-side, position absent', {}, { images: [img('a')], imageLayout: 'side-by-side' }],
  ['one image with slideshow Top', { position: VP.Top }, { images: [img('a')], slideshow: show }],
  ['one image with slideshow Bottom', { position: VP.Bottom }, { images: [img('a')], slideshow: show }],
  ['one image with slideshow, layout slider', { position: VP.Top }, { images: [img('a')], slideshow: show, imageLayout: 'slider' }],
  ['one image with slideshow None', { position: VP.None }, { images: [img('a')], slideshow: show }],
  ['one image with effect none', { position: VP.Left, colSize: 4 }, { images: [img('a')], slideshow: { ...show, effect: 'none' } }],
  ['3 images with slideshow', { position: VP.Top }, { images: [img('a'), img('b'), img('c')], slideshow: show }],
  ['3 images with an inactive slideshow', { position: VP.Top }, { images: [img('a'), img('b'), img('c')], slideshow: show, imageLayout: 'mosaic' }],
  ['contentI18n', { position: VP.Top }, { images: [img('a')], contentI18n: { de: '<p>Hallo</p>', en: '<p>Hello</p>' } }],
  ['contentI18n without images', {}, { contentI18n: { en: '<p>Hello</p>' } }],
  ['contentI18n Left', { position: VP.Left, colSize: 4 }, { images: [img('a')], contentI18n: { en: '<p>Hello</p>' } }],
  ['partial imageStyle Top', { position: VP.Top }, { images: [img('a')], imageStyle: { captionPosition: 'bottom' } }],
  ['partial imageStyle Right', { position: VP.Right, colSize: 3 }, { images: [img('a')], imageStyle: { captionPosition: 'bottom' } }],
  ['partial imageStyle of several images', { position: VP.Top }, { images: [img('a'), img('b')], imageStyle: { captionPosition: 'bottom' } }],
  ['full imageStyle without images', { position: VP.Top }, { images: [], imageStyle: IMAGE_STYLE_SHAPE }],
  ['full imageStyle, position None', { position: VP.None }, { images: [img('a')], imageStyle: IMAGE_STYLE_SHAPE }],
];
const LONG = `<h2>Titel</h2>${'<p>Ein langer Text &amp; mehr.</p>'.repeat(200)}`;
const ROUND_TRIPS = CONVERTIBLE.flatMap(([name, content, properties]) =>
  ['', '<p>Hi</p>', LONG].flatMap((htmlContent) => [false, true].map((withCta): Case => [
    `${name}, html of ${htmlContent.length}${withCta ? ', cta' : ''}`,
    { ...content, htmlContent },
    withCta ? { ...properties, cta } : properties,
  ])));

describe('the classic shapes', () => {
  it.each(ROUND_TRIPS)('there and back: %s', (_name, content, properties) => {
    const a = art(content, properties);
    expect(drawnArticle(roundTrip(a))).toEqual(drawnArticle(a));
    expect(isFreeArticle({ ...a, properties: blocksFromClassic(a) })).toBe(false);
    expect(convertsExactly(a)).toBe(true);
  });

  it.each<Case>([
    ['one image Left with an active slideshow', { position: VP.Left, colSize: 4 }, { images: [img('a')], slideshow: show }],
    ['one image Right with an active slideshow', { position: VP.Right, colSize: 4 }, { images: [img('a')], slideshow: show }],
    ['one image Left with colSize 0', { position: VP.Left, colSize: 0 }, { images: [img('a')] }],
    ['one image Left with colSize 12', { position: VP.Left, colSize: 12 }, { images: [img('a')] }],
    ['one image Left with colSize 4.5', { position: VP.Left, colSize: 4.5 }, { images: [img('a')] }],
  ])('not convertible: %s', (_name, content, properties) => {
    const a = art({ htmlContent: '<p>Hi</p>', ...content }, properties);
    expect(drawnArticle(roundTrip(a))).not.toEqual(drawnArticle(a));
    expect(convertsExactly(a)).toBe(false);
    expect(blocksFromClassic(a).blocks[0].type).toBe('columns');
  });

  // the website counts only the images with a url: 'a' and '' are one image there (drawn left), two in the app
  it.each([['None', VP.None], ['Top', VP.Top], ['Left', VP.Left], ['Right', VP.Right], ['Bottom', VP.Bottom]])(
    'not convertible: two images, one without a url, %s', (_name, position) => {
      for (const url of ['', ' ', undefined]) {
        const images = [img('a'), { ...img('b'), url }];
        expect(convertsExactly(art({ htmlContent: 'T', position }, { images }))).toBe(false);
        expect(convertsExactly(art({ htmlContent: 'T', position }, { images: images.slice(1) }))).toBe(false);
        expect(convertsExactly(art({ htmlContent: 'T', position }, { images: images.slice(0, 1) }))).toBe(true);
      }
    });

  it('not convertible: malformed fields, an article with blocks, another section', () => {
    for (const properties of [{ images: 'x' }, { images: [null] }, { contentI18n: 'x' }, { contentI18n: { en: 3 } }, { cta: 'x' }, { blocks: [text('A')] }]) {
      expect(convertsExactly(art({ htmlContent: 'T' }, properties))).toBe(false);
    }
    expect(convertsExactly({ type: 'hero', content: { htmlContent: 'T' } })).toBe(false);
    expect(convertsExactly({})).toBe(true);
  });

  it('drawnArticle: what decides how an article is drawn', () => {
    const properties = { images: [img('a')], imageStyle: { width: '50%' }, imageLayout: 'slider', slideshow: show, contentI18n: { en: 'x' }, cta };
    expect(drawnArticle(art({ htmlContent: 'T', position: VP.Left, colSize: 4 }, properties))).toEqual({
      html: 'T', i18n: { en: 'x' }, images: [img('a')], imageStyle: { width: '50%' }, layout: undefined, slideshow: show,
      position: VP.Left, colSize: 4, cta,
    });
    expect(drawnArticle(art({ position: VP.Left, colSize: 4 }, { ...properties, images: [img('a'), img('b')] })))
      .toMatchObject({ position: VP.Top, layout: 'slider', colSize: undefined });
    expect(drawnArticle(art({ position: VP.None }, properties))).toMatchObject({ imageStyle: undefined, slideshow: undefined });
  });

  it('a size outside 1-11 becomes 6', () => {
    for (const colSize of [0, 12, -1, 4.5, NaN]) {
      const [block] = blocksFromClassic(art({ position: VP.Left, colSize }, { images: [img('a')] })).blocks;
      expect((block as ColumnsBlock).columns.map((c) => c.size)).toEqual([6, 6]);
    }
  });
});

describe('blocksFromClassic', () => {
  const types = (s: ArticleLike): string[] => blocksFromClassic(s).blocks.map((b) => b.type);
  const shape = (s: ArticleLike): (number | string)[][] =>
    (blocksFromClassic(s).blocks[0] as ColumnsBlock).columns.map((c) => [c.size, ...c.blocks.map((b) => b.type)]);

  it('Left → columns, image first', () => {
    const s = art({ htmlContent: 'T', position: VP.Left, colSize: 4 }, { images: [img('a')] });
    expect(types(s)).toEqual(['columns']);
    expect(shape(s)).toEqual([[4, 'image'], [8, 'text']]);
  });

  it('Right → columns, text first', () => {
    const s = art({ htmlContent: 'T', position: VP.Right, colSize: 8 }, { images: [img('a')] });
    expect(types(s)).toEqual(['columns']);
    expect(shape(s)).toEqual([[4, 'text'], [8, 'image']]);
  });

  it('None → text, the image becomes the cover', () => {
    const { blocks, cover } = blocksFromClassic(art({ htmlContent: 'T', position: VP.None }, { images: [img('a')] }));
    expect(blocks.map((b) => b.type)).toEqual(['text']);
    expect(cover).toEqual(img('a'));
  });

  it('several images are never hidden, so there is no cover', () => {
    const result = blocksFromClassic(art({ htmlContent: 'T', position: VP.None }, { images: [img('a'), img('b')], cta }));
    expect(result.blocks.map((b) => b.type)).toEqual(['gallery', 'text', 'button']);
    expect('cover' in result).toBe(false);
  });

  it('the order follows the position', () => {
    expect(types(art({ position: VP.Top }, { images: [img('a')] }))).toEqual(['image', 'text']);
    expect(types(art({ position: VP.Bottom }, { images: [img('a')], cta }))).toEqual(['text', 'image', 'button']);
    expect(types(art({ position: VP.Bottom }, { images: [img('a'), img('b')] }))).toEqual(['gallery', 'text']);
    expect(types(art({ position: VP.Bottom }, { images: [img('a'), img('b')], imageLayout: 'pair' }))).toEqual(['text', 'gallery']);
    expect(types(art({ position: VP.Left }, { images: [img('a')], imageLayout: 'side-by-side' }))).toEqual(['gallery', 'text']);
    expect(types(art({ position: VP.Bottom }, { images: [img('a')], slideshow: show }))).toEqual(['text', 'gallery']);
  });

  it('uses fixed ids', () => {
    const ids = (s: ArticleLike): string[] => blocksFromClassic(s).blocks.map((b) => b.id);
    expect(ids(art({ position: VP.Top }, { images: [img('a')], cta }))).toEqual(['classic-image', 'classic-text', 'classic-button']);
    expect(ids(art({}, { images: [img('a'), img('b')] }))).toEqual(['classic-gallery', 'classic-text']);
    const s = art({ position: VP.Left }, { images: [img('a')] });
    expect(ids(s)).toEqual(['classic-columns']);
    expect((blocksFromClassic(s).blocks[0] as ColumnsBlock).columns.map((c) => c.blocks[0].id)).toEqual(['classic-image', 'classic-text']);
  });

  it('copies contentI18n, imageStyle, layout, slideshow and cta verbatim', () => {
    const properties = { images: [img('a'), img('b')], imageStyle: IMAGE_STYLE_SHAPE, imageLayout: 'pair', slideshow: show, contentI18n: { de: 'x', en: 'y' }, cta };
    expect(blocksFromClassic(art({ htmlContent: 'T' }, properties)).blocks).toEqual([
      { id: 'classic-gallery', type: 'gallery', images: [img('a'), img('b')], imageStyle: IMAGE_STYLE_SHAPE, layout: 'pair', slideshow: show },
      { id: 'classic-text', type: 'text', html: 'T', htmlI18n: { de: 'x', en: 'y' } },
      { id: 'classic-button', type: 'button', cta },
    ]);
  });

  it('leaves out what is absent: Firestore rejects undefined', () => {
    for (const s of [art(), art({ position: VP.Top }, { images: [img('a')] }), art({ position: VP.Left }, { images: [img('a')] }), art({}, { images: [img('a'), img('b')] })]) {
      const { blocks } = blocksFromClassic(s);
      const keys = blocks.flatMap((b) => [b, ...(b.type === 'columns' ? b.columns.flatMap((c) => c.blocks) : [])]);
      for (const block of keys) expect(Object.values(block)).not.toContain(undefined);
    }
  });

  it('an empty article gets an empty text', () => {
    expect(blocksFromClassic({})).toEqual({ blocks: [{ id: 'classic-text', type: 'text', html: '' }] });
  });
});

describe('isFreeArticle', () => {
  const button2 = button({ ...cta, url: '/2' });
  it.each<[string, unknown]>([
    ['two texts', [text('A'), text('B')]],
    ['a divider', [text('A'), { id: 'd', type: 'divider' }]],
    ['a space', [{ id: 's', type: 'space', size: 'small' }, text('A')]],
    ['a callout', [callout('A')]],
    ['align center', [text('A', { align: 'center' })]],
    ['align right on the button', [text('A'), button(cta, { align: 'right' })]],
    ['align center in a column', [columns([4, 8], [[image('a')], [text('A', { align: 'center' })]])]],
    ['stackReverse', [columns([4, 8], [[image('a')], [text('A')]], { stackReverse: true })]],
    ['three columns', [columns([4, 4, 4], [[image('a')], [text('A')], [text('B')]])]],
    ['two blocks in one column', [columns([4, 8], [[image('a')], [text('A'), text('B')]])]],
    ['two texts in columns', [columns([4, 8], [[text('A')], [text('B')]])]],
    ['two images in columns', [columns([4, 8], [[image('a')], [image('b')]])]],
    ['column sizes that do not sum to 12', [columns([4, 4], [[image('a')], [text('A')]])]],
    ['a column size of 0', [columns([0, 12], [[image('a')], [text('A')]])]],
    ['2 images without layout after the text', [text('A'), gallery(['a', 'b'])]],
    ['2 images with slideshow but without layout after the text', [text('A'), gallery(['a', 'b'], { slideshow: show })]],
    ['a single-image gallery', [gallery(['a']), text('A')]],
    ['a single-image gallery with an inactive slideshow', [gallery(['a'], { slideshow: { ...show, effect: 'none' } }), text('A')]],
    ['a single-image gallery whose layout stops the slideshow', [gallery(['a'], { slideshow: show, layout: 'mosaic' }), text('A')]],
    ['a gallery without images', [gallery([]), text('A')]],
    ['an unknown type', [text('A'), { id: 'x', type: 'video' }]],
    ['image without text', [image('a')]],
    ['two images around the text', [image('a'), text('A'), image('b')]],
    ['button only', [button()]],
    ['button first', [button(), text('A')]],
    ['two buttons', [text('A'), button(), button2]],
  ])('true: %s', (_name, blocks) => {
    expect(isFreeArticle(free(blocks))).toBe(true);
  });

  it('a cover does not make an article free: it is never drawn in the article', () => {
    for (const blocks of [[image('a'), text('A')], [gallery(['a', 'b']), text('A')], [columns([4, 8], [[image('a')], [text('A')]])]]) {
      const s = free(blocks, { cover: img('c') });
      const f = withClassicFields(s);
      expect(isFreeArticle(s)).toBe(false);
      expect(propsOf(f).images).toEqual(blockImages(blocks));
      expect(f.content).toEqual(withClassicFields(free(blocks)).content);
      expect([articleCover(s)?.url, articleCover(f)?.url]).toEqual(['c', 'c']);
    }
  });

  it.each<[string, unknown]>([
    ['no blocks at all', []],
    ['align left', [text('A', { align: 'left' }), button(cta, { align: 'left' })]],
    ['stackReverse false', [columns([4, 8], [[image('a')], [text('A')]], { stackReverse: false })]],
    ['a gallery with layout after the text', [text('A'), gallery(['a', 'b'], { layout: 'slider' })]],
    ['a single-image gallery side-by-side', [gallery(['a'], { layout: 'side-by-side' }), text('A')]],
    ['a single-image gallery with slideshow', [text('A'), gallery(['a'], { slideshow: show })]],
  ])('false: %s', (_name, blocks) => {
    expect(isFreeArticle(free(blocks))).toBe(false);
  });

  it('false without blocks, for a non-article and for no section', () => {
    expect(isFreeArticle(art({ htmlContent: 'A' }, { images: [] }))).toBe(false);
    expect(isFreeArticle({ type: 'hero', properties: { blocks: [text('A'), text('B')] } })).toBe(false);
    expect(isFreeArticle(undefined)).toBe(false);
  });
});

describe('withClassicFields', () => {
  const b1: SectionCta = { ...cta, url: '/b1' };
  const b2: SectionCta = { ...cta, url: '/b2' };
  const FREE = [text('A'), columns([4, 8], [[text('B')], [image('i1')]]), callout('C'), gallery(['i2']), button(b1), button(b2)];

  it('fallback of a free article', () => {
    const f = withClassicFields(free(FREE));
    expect(f.content).toEqual({ htmlContent: 'ABC', position: ViewPosition.Top, colSize: 6 });
    expect(propsOf(f).images.map((i: ImageConfig) => i.url)).toEqual(['i1', 'i2']);
    expect(propsOf(f).cta).toEqual(b1);
    expect([propsOf(f).imageStyle, propsOf(f).imageLayout, propsOf(f).slideshow]).toEqual([undefined, undefined, undefined]);
    expect('contentI18n' in propsOf(f)).toBe(false);
  });

  it('fallback: the cover comes first', () => {
    expect(propsOf(withClassicFields(free(FREE, { cover: img('c') }))).images.map((i) => i.url)).toEqual(['c', 'i1', 'i2']);
  });

  it('fallback: a button inside a column counts as the first button', () => {
    const f = withClassicFields(free([columns([6, 6], [[text('A')], [button(b2)]]), button(b1)]));
    expect(propsOf(f).cta).toEqual(b2);
  });

  it('fallback: per language, blocks without it contribute German; German comes along', () => {
    const f = withClassicFields(free([text('A', { htmlI18n: { en: 'a' } }), text('B')]));
    expect(propsOf(f).contentI18n).toEqual({ de: 'AB', en: 'aB' });
    expect(propsOf(f).contentI18n).not.toHaveProperty('fr');
    const g = withClassicFields(free([text('A', { htmlI18n: { en: 'a' } }), callout('B', { htmlI18n: { fr: 'b' } }), columns([6, 6], [[text('C', { htmlI18n: { en: 'c' } })], []])]));
    expect(propsOf(g).contentI18n).toEqual({ de: 'ABC', en: 'aBc', fr: 'AbC' });
  });

  it('fallback: an empty translation is none', () => {
    for (const en of ['', ' \n']) {
      expect(propsOf(withClassicFields(free([text('A', { htmlI18n: { en: 'a' } }), text('B', { htmlI18n: { en } })]))).contentI18n).toEqual({ de: 'AB', en: 'aB' });
      expect(propsOf(withClassicFields(free([text('A', { htmlI18n: { en } }), text('B')])))).not.toHaveProperty('contentI18n');
    }
  });

  it('fallback: html wins over a stored htmlI18n.de, which alone is no translation', () => {
    expect(propsOf(withClassicFields(free([text('A', { htmlI18n: { de: 'x', en: 'a' } }), text('B')]))).contentI18n).toEqual({ de: 'AB', en: 'aB' });
    expect(propsOf(withClassicFields(free([text('A', { htmlI18n: { de: 'x' } }), text('B')])))).not.toHaveProperty('contentI18n');
  });

  it('classic: translations verbatim, malformed ones left out', () => {
    const i18nOf = (htmlI18n: unknown): unknown => propsOf(withClassicFields(free([{ ...text('A'), htmlI18n }]))).contentI18n;
    expect(i18nOf({ de: 'x', en: '', fr: ' ' })).toEqual({ de: 'x', en: '', fr: ' ' });
    expect(i18nOf({ en: 'a', fr: 3, it: null })).toEqual({ en: 'a' });
    for (const bad of ['x', 3, null, ['x']]) expect(i18nOf(bad)).toBeUndefined();
  });

  it('keeps the header and the frame, the blocks and the cover', () => {
    const s = deepFreeze({ type: 'article', title: 'T', properties: { blocks: FREE, cover: img('c'), emphasis: 'banner', background: '#fff', titleI18n: { en: 't' } } });
    const f = withClassicFields(s);
    expect(f.title).toBe('T');
    expect(f.properties).toMatchObject({ blocks: FREE, cover: img('c'), emphasis: 'banner', background: '#fff', titleI18n: { en: 't' } });
  });

  it('is idempotent', () => {
    for (const s of [free(FREE), free([image('a'), text('A'), button()]), free([])]) {
      expect(withClassicFields(withClassicFields(s))).toEqual(withClassicFields(s));
    }
  });

  it('returns the same object without blocks and for a non-article', () => {
    const old = art({ htmlContent: 'A' }, { images: [] });
    const hero: ArticleLike = { type: 'hero', properties: { blocks: [text('A')] } };
    expect(withClassicFields(old)).toBe(old);
    expect(withClassicFields(hero)).toBe(hero);
    expect(withClassicFields(undefined)).toBe(undefined);
  });

  it.each<[string, unknown]>([['classic', [text('A')]], ['free', [text('A'), text('B')]], ['empty', []]])(
    'ignores the old fields next to the blocks (%s)', (_name, blocks) => {
      const stale = { images: [img('old')], imageStyle: IMAGE_STYLE_SHAPE, imageLayout: 'pair', slideshow: show, cta, contentI18n: { en: 'old' } };
      const f = withClassicFields(art({ htmlContent: 'old', position: VP.Left, colSize: 3 }, { blocks, ...stale }));
      expect(JSON.stringify(f)).not.toContain('old');
      expect(f.content?.colSize).toBe(6);
      for (const key of ['imageStyle', 'imageLayout', 'slideshow', 'cta', 'contentI18n']) expect(propsOf(f)).not.toHaveProperty(key);
    });

  it('a section without type behaves like an article', () => {
    const s: ArticleLike = { properties: { blocks: [text('A'), text('B')] } };
    expect(isFreeArticle(s)).toBe(true);
    expect(withClassicFields(s).content?.htmlContent).toBe('AB');
  });

  it('always fills images, also without any', () => {
    expect(propsOf(withClassicFields(free([]))).images).toEqual([]);
    expect(propsOf(withClassicFields(free([text('A')]))).images).toEqual([]);
    expect(withClassicFields(free([])).content).toEqual({ htmlContent: '', position: ViewPosition.None, colSize: 6 });
  });

  it('blocks: [] with a cover is classic', () => {
    const s = free([], { cover: img('c') });
    expect(isFreeArticle(s)).toBe(false);
    expect(withClassicFields(s).content?.position).toBe(ViewPosition.None);
    expect(propsOf(withClassicFields(s)).images).toEqual([img('c')]);
  });
});

describe('malformed blocks', () => {
  it('blocks that are not an array count as absent', () => {
    for (const blocks of ['x', 3, null, { 0: text('A') }, undefined]) {
      const s = art({ htmlContent: 'A' }, { blocks, images: [img('a')], cover: img('c') });
      expect(articleBlocksOf(s)).toBeUndefined();
      expect(isFreeArticle(s)).toBe(false);
      expect(withClassicFields(s)).toBe(s);
      expect(articleCover(s)).toEqual(img('a'));
    }
  });

  it('entries without a type are dropped', () => {
    expect(articleBlocksOf(free([null, 3, {}, 'x', { type: 7 }, text('A')]))).toEqual([text('A')]);
    expect(articleBlocksOf(free([null, 3, {}]))).toEqual([]);
    expect(isFreeArticle(free([null, text('A'), {}]))).toBe(false);
  });

  it.each<[string, unknown[]]>([
    ['not blocks', [null, 3, {}]],
    ['columns without columns', [{ id: '1', type: 'columns' }]],
    ['columns of nothing', [{ id: '1', type: 'columns', columns: [null, 3] }]],
    ['columns without blocks', [{ id: '1', type: 'columns', columns: [{ size: 6 }, { size: 6, blocks: [null, 3, {}] }] }]],
    ['columns in columns', [{ id: '1', type: 'columns', columns: [{ size: 6, blocks: [{ id: '2', type: 'columns' }] }, { size: 6, blocks: 'x' }] }]],
    ['gallery without images', [{ id: '1', type: 'gallery' }]],
    ['gallery of nothing', [{ id: '1', type: 'gallery', images: [null, 3] }, text('')]],
    ['button without cta', [{ id: '1', type: 'button' }]],
    ['text and a button without cta', [text(''), { id: '1', type: 'button' }]],
    ['text without html', [{ id: '1', type: 'text' }]],
    ['text with a bad translation', [{ id: '1', type: 'text', htmlI18n: 'x' }, { id: '2', type: 'text', htmlI18n: { en: 3 } }]],
    ['image without image', [{ id: '1', type: 'image' }, text('')]],
    ['callout without html', [{ id: '1', type: 'callout' }]],
  ])('never throws and draws nothing: %s', (_name, blocks) => {
    const s = free(blocks);
    const f = withClassicFields(s);
    expect(f.content?.htmlContent).toBe('');
    expect(propsOf(f).images).toEqual([]);
    expect(propsOf(f)).not.toHaveProperty('cta');
    expect(typeof isFreeArticle(s)).toBe('boolean');
    expect(articleCover(s)).toBeUndefined();
  });

  it('never throws on malformed old fields', () => {
    for (const properties of [undefined, { images: 'x' }, { images: [null, 3] }, { images: null, cta: null, slideshow: null }, { cta: 'x' }, { cta: 3 }]) {
      expect(blocksFromClassic({ properties }).blocks).toEqual([{ id: 'classic-text', type: 'text', html: '' }]);
    }
  });

  it('a cover that is no object counts as absent', () => {
    const s = free([text('A')], { cover: 'x' });
    expect(propsOf(withClassicFields(s)).images).toEqual([]);
    expect(articleCover(s)).toBeUndefined();
  });
});

describe('articleCover', () => {
  it('cover wins, else the first image of the blocks', () => {
    const blocks = [text('A'), columns([6, 6], [[text('B')], [image('i1')]]), gallery(['i2'])];
    expect(articleCover(free(blocks, { cover: img('c') }))?.url).toBe('c');
    expect(articleCover(free(blocks))?.url).toBe('i1');
    expect(articleCover(free([text('A')], { images: [img('old')] }))).toBeUndefined();
  });

  it('an old article: the first of its images', () => {
    expect(articleCover(art({}, { images: [img('a'), img('b')] }))?.url).toBe('a');
    expect(articleCover(art({}, { images: [] }))).toBeUndefined();
    expect(articleCover(art())).toBeUndefined();
    expect(articleCover(undefined)).toBeUndefined();
  });

  it('is the same before and after the conversion', () => {
    for (const [, content, properties] of CONVERTIBLE) {
      const a = art(content, properties);
      expect(articleCover({ ...a, properties: blocksFromClassic(a) })).toEqual(articleCover(a));
    }
  });
});

describe('blockImages and blockHtml', () => {
  const blocks: ArticleBlock[] = deepFreeze([
    gallery(['a', 'b']), text('A'), columns([4, 4, 4], [[text('B'), image('c')], [image('d')], [text('C')]]), callout('D'), image('e'),
    { id: 'd', type: 'divider' },
  ]);
  it('reading order, columns flattened', () => {
    expect(blockImages(blocks).map((i) => i.url)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(blockHtml(blocks)).toBe('ABCD');
    expect([blockImages([]), blockHtml([])]).toEqual([[], '']);
  });
});

describe('isSlideshowActive', () => {
  it('a known effect other than none, with the carousel layout', () => {
    expect(isSlideshowActive(show, undefined)).toBe(true);
    expect(isSlideshowActive({ effect: 'kenburns' }, 'slider')).toBe(true);
    expect(isSlideshowActive(show, 'mosaic')).toBe(false);
    expect(isSlideshowActive({ ...show, effect: 'none' }, undefined)).toBe(false);
    expect(isSlideshowActive({ effect: 'wobble' } as unknown as ArticleSlideshow, undefined)).toBe(false);
    expect(isSlideshowActive({}, undefined)).toBe(false);
    expect(isSlideshowActive(undefined, undefined)).toBe(false);
  });
});
