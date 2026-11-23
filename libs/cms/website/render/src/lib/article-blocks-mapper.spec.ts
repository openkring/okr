import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { mapBlocks, mapBlocksI18n, type PublicBlock } from './article-blocks-mapper';
import { mapSection, type PublicImage, type SectionDoc } from './section-mapper';

/** Drops script elements, as the real sanitizer does. */
const sanitize = (html: string): string => html.replace(/<script>.*?<\/script>/g, '');
const keep = (html: string): string => html;

let warn: MockInstance;
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => { vi.restoreAllMocks(); });

const img = (n: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ url: `a/${n}.jpg`, altText: n, ...extra });
const text = (html: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id: 't', type: 'text', html, ...extra });
const image = (n: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id: 'i', type: 'image', image: img(n), ...extra });
const gallery = (ns: string[], extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id: 'g', type: 'gallery', images: ns.map((n) => img(n)), ...extra });
const button = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id: 'b', type: 'button', cta: { label: 'Los', url: '/los.html' }, ...extra });
const columns = (sizes: unknown[], contents: unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> =>
  ({ id: 'c', type: 'columns', columns: contents.map((blocks, i) => ({ size: sizes[i], blocks })), ...extra });
const divider = { id: 'd', type: 'divider' };

const free = (blocks: unknown, extra: Partial<SectionDoc> = {}, props: Record<string, unknown> = {}): SectionDoc =>
  ({ type: 'article', title: 'Titel', subTitle: 'Untertitel', ...extra, properties: { blocks, ...props } });
const run = (blocks: unknown, lang = 'de', s: SectionDoc = free(blocks)): { blocks: PublicBlock[]; images: PublicImage[] } =>
  mapBlocks(s, sanitize, lang, 'sec1');
const urls = (images: PublicImage[]): string[] => images.map((i) => /\/(\w+)\.jpg/.exec(i.url)?.[1] ?? '');
const typesOf = (blocks: unknown): string[] => run(blocks).blocks.map((b) => b.type);
const only = <T extends PublicBlock['type']>(block: unknown, type: T): Extract<PublicBlock, { type: T }> => {
  const { blocks } = run([block]);
  expect(blocks.map((b) => b.type)).toEqual([type]);
  return blocks[0] as Extract<PublicBlock, { type: T }>;
};

describe('mapBlocks: text and callout', () => {
  it('keeps the html and its alignment, and falls back to left', () => {
    expect(run([text('<p>A</p>'), text('B', { align: 'center' }), text('C', { align: 'justify' })]).blocks).toEqual([
      { type: 'text', html: '<p>A</p>', align: 'left' }, { type: 'text', html: 'B', align: 'center' }, { type: 'text', html: 'C', align: 'left' },
    ]);
  });

  it('reads the page language, an empty translation is German', () => {
    const i18n = { htmlI18n: { en: 'A en', fr: '', it: '  ' } };
    const html = (lang: string): unknown => (run([text('A de', i18n)], lang).blocks[0] as { html: string }).html;
    expect(['de', 'en', 'fr', 'it', 'es'].map(html)).toEqual(['A de', 'A en', 'A de', 'A de', 'A de']);
  });

  it.each(['de', 'en'])('drops a script in text and callout (%s)', (lang) => {
    const i18n = { htmlI18n: { en: 'E<script>x</script>' } };
    const { blocks } = run([text('D<script>x</script>', i18n), { id: 'n', type: 'callout', html: 'D<script>x</script>', tone: 'primary', ...i18n }], lang);
    const html = lang === 'de' ? 'D' : 'E';
    expect(blocks).toEqual([{ type: 'text', html, align: 'left' }, { type: 'callout', html, tone: 'primary' }]);
  });

  it('a callout without a known tone is neutral', () => {
    expect(only({ id: 'n', type: 'callout', html: 'A', tone: 'red' }, 'callout').tone).toBe('neutral');
    expect(only({ id: 'n', type: 'callout', html: 'A' }, 'callout').tone).toBe('neutral');
  });

  it('leaves an empty text out without a warning, but keeps a text of a picture only', () => {
    const empty = ['', ' ', '<p></p>', '<p>&nbsp;<br></p>', '<script>x</script>'];
    expect(run([...empty.map((html) => text(html)), ...empty.map((html) => ({ id: 'n', type: 'callout', html }))]).blocks).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    expect(typesOf([text('<p><img src="https://x/y.png"></p>')])).toEqual(['text']);
  });

  it('a malformed translation is German', () => {
    for (const htmlI18n of ['x', 3, null, ['x'], { en: 3 }]) expect(run([text('A', { htmlI18n })], 'en').blocks).toMatchObject([{ html: 'A' }]);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('mapBlocks: images', () => {
  it('an image with its caption and fixed height', () => {
    const block = only(image('x', { imageStyle: { captionPosition: 'top', height: '150px' }, image: img('x', { overlay: 'Text' }) }), 'image');
    expect(block).toMatchObject({ imageHeight: 150, albumOffset: 0, image: { alt: 'x', caption: 'Text', captionPosition: 'top' } });
  });

  it('without a style: natural height, no caption', () => {
    expect(only(image('x'), 'image')).toMatchObject({ imageHeight: 0, image: { caption: '' } });
  });

  it('captions fall back to subtitle, then title, in the page language', () => {
    const block = image('x', { imageStyle: { captionPosition: 'bottom' } });
    const caption = (s: SectionDoc, lang = 'de'): string => (run([], lang, s).blocks[0] as { image: PublicImage }).image.caption;
    expect(caption(free([block]))).toBe('Untertitel');
    expect(caption(free([block], { subTitle: '' }))).toBe('Titel');
    expect(caption(free([block], {}, { subTitleI18n: { en: 'Subtitle' } }), 'en')).toBe('Subtitle');
    expect((run([gallery(['x'], { imageStyle: { captionPosition: 'bottom' } })]).blocks[0] as { images: PublicImage[] }).images[0].caption).toBe('Untertitel');
  });

  it('the album is every image in reading order without the cover, and every offset points at its first image', () => {
    const blocks = [
      image('a'), gallery(['b', 'c'], { layout: 'stacked' }), { id: 'x', type: 'image', image: { url: '' } },
      columns([4, 8], [[image('d'), text('T')], [image('e')]]),
      { id: 'y', type: 'gallery', images: [{ url: '' }, img('f'), {}, img('g')] }, gallery(['h'], { layout: 'side-by-side' }),
    ];
    const { blocks: out, images } = run([], 'de', free(blocks, {}, { cover: img('cover') }));
    expect(urls(images)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    const flat = out.flatMap((b) => (b.type === 'columns' ? b.columns.flatMap((c) => c.blocks) : [b]));
    const shown = flat.flatMap((b) => (b.type === 'image' ? [{ first: b.image, at: b.albumOffset }] : b.type === 'gallery' ? [{ first: b.images[0], at: b.albumOffset }] : []));
    expect(shown.map((s) => s.at)).toEqual([0, 1, 3, 4, 5, 7]);
    for (const { first, at } of shown) expect(images[at]).toBe(first);
  });

  it('leaves an image without url out without a warning', () => {
    expect(run([{ id: 'i', type: 'image', image: { url: '' } }, { id: 'i', type: 'image', image: {} }, { id: 'i', type: 'image', image: { url: '  ' } }]))
      .toEqual({ blocks: [], images: [] });
    expect(warn).not.toHaveBeenCalled();
  });

  it('texts and styles of the wrong type count as absent', () => {
    const bad = { image: img('x', { overlay: 5, credit: {}, altText: 7 }), imageStyle: { captionPosition: 'bottom', captionSize: 3, height: 9 } };
    expect(only(image('x', bad), 'image')).toMatchObject({ imageHeight: 0, image: { alt: '', caption: 'Untertitel', captionCss: { fontSize: '0.8rem' } } });
    for (const imageStyle of ['x', 3, null, []]) expect(only(image('x', { imageStyle }), 'image').imageHeight).toBe(0);
  });
});

describe('mapBlocks: gallery', () => {
  const show = { effect: 'fade', autoplay: true, interval: 3, duration: 1 };

  it.each<[string, string[], Record<string, unknown>, string]>([
    ['no layout', ['a', 'b'], {}, 'slider'],
    ['slider', ['a', 'b'], { layout: 'slider' }, 'slider'],
    ['a grid layout is drawn as a slider', ['a', 'b'], { layout: 'mosaic', slideshow: show }, 'slider'],
    ['slideshow', ['a', 'b'], { slideshow: show }, 'slideshow'],
    ['slideshow with the carousel layout', ['a', 'b'], { layout: 'slider', slideshow: show }, 'slideshow'],
    ['slideshow with an empty layout', ['a', 'b'], { layout: '', slideshow: show }, 'slideshow'],
    ['slideshow of one image', ['a'], { slideshow: show }, 'slideshow'],
    ['slideshow without effect', ['a', 'b'], { slideshow: { ...show, effect: 'none' } }, 'slider'],
    ['side by side', ['a', 'b'], { layout: 'side-by-side', slideshow: show }, 'row'],
    ['one side by side', ['a'], { layout: 'side-by-side' }, 'row'],
    ['stacked', ['a', 'b'], { layout: 'stacked', slideshow: show }, 'column'],
    ['one stacked', ['a'], { layout: 'stacked' }, 'slider'],
    ['a layout of the wrong type', ['a', 'b'], { layout: 5 }, 'slider'],
  ])('%s', (_name, ns, extra, layout) => {
    const block = only(gallery(ns, extra), 'gallery');
    expect(block.layout).toBe(layout);
    expect(urls(block.images)).toEqual(ns);
    expect(block.slideshow !== undefined).toBe(layout === 'slideshow');
    expect('slideshow' in block).toBe(layout === 'slideshow');
  });

  it('only mapped images count', () => {
    expect(only({ id: 'g', type: 'gallery', images: [img('a'), { url: '' }], layout: 'stacked' }, 'gallery').layout).toBe('slider');
    expect(only({ id: 'g', type: 'gallery', images: [null, img('a'), 3, {}] }, 'gallery').images).toHaveLength(1);
  });

  it('side by side: caption below and centred, never the title; the fixed height stays', () => {
    const block = only({ ...gallery([]), images: [img('a', { overlay: 'A' }), img('b')], layout: 'side-by-side', imageStyle: { height: '150px', captionPosition: 'none' } }, 'gallery');
    expect(block.imageHeight).toBe(150);
    expect(block.images.map((i) => [i.caption, i.captionPosition, i.captionCss.textAlign])).toEqual([['A', 'bottom', 'center'], ['', '', 'center']]);
  });

  it('a fixed height of the slider, natural height when stacked', () => {
    expect(only(gallery(['a', 'b'], { imageStyle: { height: '150px' } }), 'gallery').imageHeight).toBe(150);
    expect(only(gallery(['a', 'b'], { layout: 'stacked', imageStyle: { height: '150px' } }), 'gallery').imageHeight).toBe(0);
  });

  it('leaves a gallery without any image out without a warning', () => {
    expect(run([gallery([]), { id: 'g', type: 'gallery', images: [{ url: '' }] }]).blocks).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('mapBlocks: button, divider, space', () => {
  it('a button in the page language', () => {
    const block = button({ cta: { label: 'Los', labelI18n: { en: 'Go' }, url: 'https://x.ch', style: 'secondary' }, align: 'right' });
    expect(run([block], 'en').blocks).toEqual([{ type: 'button', cta: { label: 'Go', url: 'https://x.ch', style: 'secondary' }, align: 'right' }]);
    expect(only(button(), 'button').align).toBe('left');
  });

  it('drops a javascript button with a warning, a half-filled one without', () => {
    expect(run([button({ cta: { label: 'Los', url: 'javascript:alert(1)' } })]).blocks).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(run([button({ cta: { label: '', url: '/x' } }), button({ cta: { label: 'Los', url: ' ' } }), button({ cta: {} })]).blocks).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('divider and space; an unknown size is medium', () => {
    expect(run([divider, { id: 's', type: 'space', size: 'large' }, { id: 's', type: 'space', size: 'huge' }]).blocks)
      .toEqual([{ type: 'divider' }, { type: 'space', size: 'large' }, { type: 'space', size: 'medium' }]);
  });
});

describe('mapBlocks: columns', () => {
  it('sizes, content and stacking order', () => {
    expect(only(columns([4, 8], [[text('A'), button()], [text('B')]], { stackReverse: true }), 'columns')).toEqual({
      type: 'columns', cols: '4fr 8fr', stackReverse: true, columns: [
        { size: 4, blocks: [{ type: 'text', html: 'A', align: 'left' }, { type: 'button', cta: { label: 'Los', url: '/los.html', style: 'primary' }, align: 'left' }] },
        { size: 8, blocks: [{ type: 'text', html: 'B', align: 'left' }] },
      ],
    });
    expect(only(columns([6, 6], [[text('A')], []], { stackReverse: 'x' }), 'columns').stackReverse).toBe(false);
  });

  it.each<[unknown[], string]>([
    [[3, 3, 6], '3fr 3fr 6fr'], [[6, 5], '6fr 6fr'], [[0, 12], '6fr 6fr'], [[4.5, 7.5], '6fr 6fr'], [['4', '8'], '6fr 6fr'],
    [['1fr;x', 8], '6fr 6fr'], [[undefined, undefined], '6fr 6fr'], [[-1, 13], '6fr 6fr'], [[12], '12fr'], [[5, 5, 5], '4fr 4fr 4fr'],
    [[3, 3, 3, 3], '3fr 3fr 3fr 3fr'], [[2, 2, 2, 2, 4], '2fr 2fr 2fr 2fr 2fr'], [Array(13).fill(1), Array(13).fill('1fr').join(' ')],
  ])('sizes %j give %s', (sizes, cols) => {
    const block = only(columns(sizes, sizes.map(() => [text('A')])), 'columns');
    expect(block.cols).toBe(cols);
    expect(block.cols).toMatch(/^\d+fr( \d+fr)*$/);
    expect(block.columns.map((c) => `${c.size}fr`).join(' ')).toBe(cols);
  });

  it('keeps an empty column next to a filled one, leaves out columns that are all empty', () => {
    expect(only(columns([6, 6], [[], [text('A')]]), 'columns').columns.map((c) => c.blocks.length)).toEqual([0, 1]);
    expect(run([columns([6, 6], [[], [text('')]])]).blocks).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('holds only text, image and button', () => {
    const block = only(columns([6, 6], [[text('A'), { ...divider, id: 'no' }, gallery(['x'])], [image('a')]]), 'columns');
    expect(block.columns.map((c) => c.blocks.map((b) => b.type))).toEqual([['text'], ['image']]);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0][0])).toContain('"no"');
  });
});

describe('mapBlocks: malformed blocks', () => {
  it('no article, no blocks', () => {
    for (const blocks of ['x', 3, null, { 0: text('A') }, undefined]) expect(run(blocks)).toEqual({ blocks: [], images: [] });
    expect(run([], 'de', { type: 'hero', properties: { blocks: [text('A')] } }).blocks).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each<[string, unknown]>([
    ['nothing', null], ['a number', 3], ['a string', 'x'], ['no type', { id: 'bad' }], ['a type that is no string', { id: 'bad', type: 7 }],
    ['an unknown type', { id: 'bad', type: 'video' }],
    ['text without html', { id: 'bad', type: 'text' }], ['text with a bad translation', { id: 'bad', type: 'text', htmlI18n: { en: 3 } }],
    ['html of the wrong type', { id: 'bad', type: 'text', html: 5 }], ['callout without html', { id: 'bad', type: 'callout' }],
    ['image without image', { id: 'bad', type: 'image' }], ['an image that is none', { id: 'bad', type: 'image', image: 'x' }],
    ['an image url of the wrong type', { id: 'bad', type: 'image', image: { url: 5 } }],
    ['gallery without images', { id: 'bad', type: 'gallery' }], ['gallery of nothing', { id: 'bad', type: 'gallery', images: [null, 3] }],
    ['button without cta', { id: 'bad', type: 'button' }], ['a cta that is none', { id: 'bad', type: 'button', cta: 'x' }],
    ['columns without columns', { id: 'bad', type: 'columns' }], ['columns of nothing', { id: 'bad', type: 'columns', columns: [null, 3] }],
    ['columns in columns', { id: 'c', type: 'columns', columns: [{ size: 6, blocks: [{ id: 'bad', type: 'columns' }] }, { size: 6, blocks: 'x' }] }],
  ])('leaves out %s, with one warning naming section and block', (_name, block) => {
    expect(run([text('A'), block, divider]).blocks.map((b) => b.type)).toEqual(['text', 'divider']);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('"sec1"');
    const hasId = typeof block === 'object' && block !== null;
    expect(message).toContain(hasId ? '"bad"' : '#1');
  });

  it('columns without blocks', () => {
    expect(run([{ id: 'c', type: 'columns', columns: [{ size: 6 }, { size: 6, blocks: [null, {}] }] }]).blocks).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('a block that cannot be mapped is left out, the others stay', () => {
    const failing = (html: string): string => { if (html === 'boom') throw new Error('boom'); return html; };
    const { blocks } = mapBlocks(free([image('a'), text('boom'), text('A')]), failing, 'de', 'sec1');
    expect(blocks.map((b) => b.type)).toEqual(['image', 'text']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('boom');
  });
});

describe('mapSection: a free article', () => {
  const map = (s: SectionDoc, lang = 'de', clean = keep): Record<string, unknown> => mapSection('sec1', s, new Map(), clean, lang) as Record<string, unknown>;
  const blocks = [
    text('<p>A</p>', { htmlI18n: { en: '<p>a</p>' } }), gallery(['a', 'b'], { imageStyle: { captionPosition: 'bottom' } }), button(), text('<p>B</p>'), image('c'),
    columns([6, 6], [[text('C')], [image('d'), button({ cta: { label: 'Zwei', url: '/2' } })]]), { id: 'n', type: 'callout', html: 'N', tone: 'primary' },
  ];
  const doc = free(blocks, { name: 'Frei', color: 1 }, { cover: img('cover'), emphasis: 'banner', background: '#000', images: [img('old')], cta: { label: 'alt', url: '/alt' }, imageLayout: 'side-by-side' });

  it('carries the blocks, and the fallback in its other keys', () => {
    const out = map(doc);
    expect(out).toMatchObject({
      type: 'article', name: 'frei', title: 'Titel', subTitle: 'Untertitel', content: '<p>A</p><p>B</p>CN', cta: { label: 'Los' },
      emphasis: 'banner', background: '#000', lightText: true, imagePosition: 'top', imageColSize: 6, imageHeight: 0, hasBlocks: true,
    });
    expect(out['slideshow']).toBeUndefined();
    expect(out).not.toHaveProperty('imageRow');
    expect(urls(out['images'] as PublicImage[])).toEqual(['a', 'b', 'c', 'd']);
    expect((out['images'] as PublicImage[])[0].caption).toBe('Untertitel');
    expect((out['blocks'] as PublicBlock[]).map((b) => b.type)).toEqual(['text', 'gallery', 'button', 'text', 'image', 'columns', 'callout']);
    expect((out['blocks'] as PublicBlock[])[1]).toMatchObject({ albumOffset: 0 });
  });

  it('in another language', () => {
    const out = map(doc, 'en');
    expect(out['content']).toBe('<p>a</p><p>B</p>CN');
    expect((out['blocks'] as PublicBlock[])[0]).toMatchObject({ html: '<p>a</p>' });
  });

  it('sanitizes blocks and fallback', () => {
    const out = map(free([text('A<script>x</script>'), divider], {}), 'de', sanitize);
    expect(JSON.stringify(out)).not.toContain('script');
  });

  it('without images: no image position', () => {
    expect(map(free([text('A'), divider]))).toMatchObject({ images: [], imagePosition: 'none', hasBlocks: true, blocks: [{ type: 'text' }, { type: 'divider' }] });
  });

  it('a section without a type is an article', () => {
    expect(map(free([text('A'), divider], { type: undefined }))).toMatchObject({ type: 'article', hasBlocks: true });
  });

  it('never throws on malformed blocks, free or classic', () => {
    const bad = { image: img('x', { overlay: 5 }), imageStyle: { captionPosition: 'bottom', captionSize: 3 } };
    for (const list of [[null, 3, {}], [{ id: '1', type: 'columns' }], [image('x', bad), text('T')], [image('x', bad), divider], [text(5)], [{ id: '1', type: 'video' }]]) {
      expect(map(free(list))['type']).toBe('article');
    }
  });

  it('an old article and a classic one have no blocks', () => {
    const old = map({ type: 'article', content: { htmlContent: 'A' }, properties: { images: [img('a')] } });
    const classic = map(free([image('a'), text('A')]));
    for (const out of [old, classic]) {
      expect(out).not.toHaveProperty('hasBlocks');
      expect(out).not.toHaveProperty('blocks');
    }
    expect(classic).toMatchObject({ content: 'A', imagePosition: 'top' });
  });

  it('another section type is not touched', () => {
    const hero = { type: 'hero', title: 'H', content: { htmlContent: 'A' }, properties: { blocks, hero: img('h') } };
    expect(map(hero)).toEqual(map({ ...hero, properties: { hero: img('h') } }));
    expect(map(hero)).not.toHaveProperty('hasBlocks');
  });
});

describe('mapSection: accordion', () => {
  const accordion: SectionDoc = { type: 'accordion', properties: { items: [{ key: 'n', label: 'L' }] } };
  const items = (nested: SectionDoc, lang = 'de', props: Record<string, unknown> = {}): unknown => {
    const s = { ...accordion, properties: { ...accordion.properties, ...props } };
    return (mapSection('acc', s, new Map([['n', nested]]), sanitize, lang) as { items: unknown }).items;
  };

  it('a nested classic article stays label and content', () => {
    expect(items({ type: 'article', content: { htmlContent: 'A' } })).toEqual([{ label: 'L', content: 'A' }]);
    expect(items(free([text('A', { htmlI18n: { en: 'E' } }), button()]), 'en')).toEqual([{ label: 'L', content: 'E' }]);
  });

  it('a nested free article adds its blocks', () => {
    const nested = free([text('A<script>x</script>', { htmlI18n: { en: 'E' } }), divider]);
    expect(items(nested)).toEqual([{ label: 'L', content: 'A', hasBlocks: true, blocks: [{ type: 'text', html: 'A', align: 'left' }, { type: 'divider' }] }]);
    expect(items(nested, 'en')).toMatchObject([{ content: 'E', blocks: [{ html: 'E' }, { type: 'divider' }] }]);
  });

  it('warns with the key of the nested section', () => {
    items(free([text('A'), { id: 'bad', type: 'video' }]));
    expect(String(warn.mock.calls[0][0])).toContain('"n"');
  });

  it('cards carry the blocks, too', () => {
    const s = { ...accordion, properties: { ...accordion.properties, viewType: 'cards' } };
    const out = mapSection('acc', s, new Map([['n', free([text('A'), divider])]]), sanitize) as { layouts: { columns: { items: unknown[] }[] }[] };
    expect(out.layouts[0].columns[0].items[0]).toMatchObject({ hasBlocks: true });
  });
});

describe('review findings of Task 5', () => {
  it('html with only a rule or a table is not empty', () => {
    expect(typesOf([text('<hr>'), text('<table><tr><td></td></tr></table>'), text('<p>&nbsp;</p>')])).toEqual(['text', 'text']);
  });

  it('an image whose url is no string is no image', () => {
    expect(run([{ id: 'i', type: 'image', image: { url: 5 } }]).blocks).toEqual([]);
    expect(mapSection('s', { type: 'album', properties: { images: [{ url: 5 }, img('a')] } } as SectionDoc, new Map(), keep, 'de')).toMatchObject({ images: [{ alt: 'a' }] });
  });

  it('the message of an error is quoted in the warning', () => {
    const failing = (): string => { throw new Error('x"\ny'); };
    mapBlocks(free([text('A')]), failing, 'de', 'sec1');
    expect(String(warn.mock.calls[0][0])).toContain('"x\\"\\ny"');
  });
});

describe('mapBlocksI18n', () => {
  it('a warning names the section by the given id when the name is empty', () => {
    mapBlocksI18n(free([{ id: 'x', type: 'bogus' }], { name: '' }), keep, 'okey123');
    expect(String(warn.mock.calls[0][0])).toContain('"okey123"');
  });

  const sec = (blocks: unknown, extra: Partial<SectionDoc> = {}): SectionDoc => free(blocks, { name: 'sec1', ...extra });

  it('carries German and every language a block has, each sanitized; an empty translation is German', () => {
    const out = mapBlocksI18n(sec([
      text('A<script>x</script>', { htmlI18n: { en: 'a<script>y</script>', fr: '  ' } }),
      { id: 'c', type: 'callout', html: 'N', htmlI18n: { it: 'n' } },
      button({ cta: { label: 'Los', url: '/los', labelI18n: { es: 'Ir' } } }),
    ]), sanitize);
    expect(out).toEqual([
      { type: 'text', html: { de: 'A', en: 'a', it: 'A', es: 'A' }, align: 'left' },
      { type: 'callout', html: { de: 'N', en: 'N', it: 'n', es: 'N' }, tone: 'neutral' },
      { type: 'button', cta: { label: { de: 'Los', en: 'Los', it: 'Los', es: 'Ir' }, url: '/los', style: 'primary' }, align: 'left' },
    ]);
  });

  it('sees the languages inside columns, and drops the album offsets', () => {
    const out = mapBlocksI18n(sec([columns([6, 6], [[text('A', { htmlI18n: { en: 'a' } })], [image('p')]]), gallery(['q', 'r']), image('z')]), keep);
    expect(JSON.stringify(out)).not.toContain('albumOffset');
    expect(out[0]).toMatchObject({ type: 'columns', columns: [{ blocks: [{ html: { de: 'A', en: 'a' } }] }, { blocks: [{ type: 'image' }] }] });
    expect(out.slice(1).map((b) => b.type)).toEqual(['gallery', 'image']);
  });

  it('the same blocks as mapBlocks, in German', () => {
    const blocks = [text('A'), image('p'), button(), divider, { id: 's', type: 'space', size: 'large' }, columns([4, 8], [[text('B')], [image('q')]])];
    const strip = (b: unknown): unknown => JSON.parse(JSON.stringify(b, (k, v) => (k === 'albumOffset' ? undefined : v)));
    const de = (b: unknown): unknown => JSON.parse(JSON.stringify(b, (k, v) => (k === 'html' && typeof v === 'object' ? v['de'] : k === 'label' && typeof v === 'object' ? v['de'] : v)));
    expect(de(mapBlocksI18n(sec(blocks), keep))).toEqual(strip(mapBlocks(sec(blocks), keep, 'de').blocks));
  });

  it('a block that is empty in every language is left out; a translation alone keeps it', () => {
    expect(mapBlocksI18n(sec([text('<p></p>'), text('', { htmlI18n: { en: 'only' } })]), keep)).toEqual([
      { type: 'text', html: { de: 'only', en: 'only' }, align: 'left' },
    ]);
  });
});
