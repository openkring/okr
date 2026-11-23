import { describe, expect, it } from 'vitest';

import { ArticleBlock, IMAGE_STYLE_SHAPE } from '@okr/shared-models';

import { ArticleBlockView, ArticlePreviewDevice, BlockViewCache, ColumnsBlockView, articleBlockViews, articleColumnsForm, articleHeaderPlace, columnsTemplate, drawnBlockImages, previewViewport, undrawnBlockTypes } from './article-block-view.util';

const img = (url: string) => ({ url, label: url, type: 0, actionUrl: '', altText: '', overlay: '' });
const cta = { label: 'Mehr', url: '/public/welcome' };
const show = { effect: 'fade', autoplay: true, interval: 3, duration: 1 };
const text = (html: unknown = '<p>Text</p>', o: object = {}) => ({ id: 't', type: 'text', html, ...o });
const image = (url = 'a', o: object = {}) => ({ id: 'i', type: 'image', image: img(url), ...o });
const gallery = (urls: string[], o: object = {}) => ({ id: 'g', type: 'gallery', images: urls.map(img), ...o });
const columns = (cols: unknown, o: object = {}) => ({ id: 'c', type: 'columns', columns: cols, ...o });

/** loose on purpose: stored blocks may hold anything */
const views = (...blocks: unknown[]): ArticleBlockView[] => articleBlockViews(blocks as ArticleBlock[]);
const types = (...blocks: unknown[]): string[] => views(...blocks).map((v) => v.type);
const first = (...blocks: unknown[]): Record<string, unknown> => views(...blocks)[0] as unknown as Record<string, unknown>;

describe('articleBlockViews', () => {
  it('text and callout: the html through the given replacement', () => {
    const result = articleBlockViews([text('@APP@'), { id: 'n', type: 'callout', html: '@APP@', tone: 'primary' }] as ArticleBlock[], (h) => h.replace('@APP@', 'Kring'));
    expect(result).toMatchObject([{ type: 'text', html: 'Kring', align: 'left' }, { type: 'callout', html: 'Kring', tone: 'primary' }]);
  });

  it('the replacement does not decide what is drawn (the header place is decided without it)', () => {
    expect(articleBlockViews([text('@APP@')] as ArticleBlock[], () => '')).toMatchObject([{ type: 'text', html: '' }]);
  });

  it.each(['', ' ', '<p></p>', '<p> &nbsp;<br></p>', '<p> </p>', undefined, null, 7, {}])('an empty text draws nothing: %j', (html) => {
    expect(views({ ...text(), html }, { id: 'n', type: 'callout', html, tone: 'primary' })).toEqual([]);
  });

  it('a text of only a picture is not empty', () => {
    expect(types(text('<p><img src="https://example.org/a.png"></p>'))).toEqual(['text']);
  });

  it('a short text is drawn (the 7 characters are a rule of the old article)', () => {
    expect(types(text('x'))).toEqual(['text']);
  });

  it.each(['left', 'center', 'right'])('align %s', (align) => {
    expect(first(text('A', { align }))['align']).toBe(align);
    expect(first({ id: 'b', type: 'button', cta, align })['align']).toBe(align);
  });

  it('an unknown align, tone or size falls back', () => {
    expect(first(text('A', { align: 'x' }))['align']).toBe('left');
    expect(first({ id: 'n', type: 'callout', html: 'A', tone: 'x' })['tone']).toBe('neutral');
    expect(first({ id: 's', type: 'space', size: 'x' })['size']).toBe('medium');
    expect(first({ id: 's', type: 'space', size: 'large' })['size']).toBe('large');
  });

  it('image: its style over the defaults', () => {
    expect(views(image('a', { imageStyle: { width: '50%' } }))).toEqual([
      { key: 'i', type: 'image', image: img('a'), imageStyle: { ...IMAGE_STYLE_SHAPE, width: '50%' } },
    ]);
  });

  it('an image without a path is not drawn', () => {
    for (const value of [undefined, null, 'x', {}, { url: '' }, { url: ' ' }, { url: 7 }]) expect(views({ ...image(), image: value })).toEqual([]);
  });

  it('malformed fields of an image and of a style never reach the image component', () => {
    const view = first({ ...image(), image: { url: 'a', overlay: 7, credit: {}, label: null }, imageStyle: { height: 5, border: null, width: '40%' } });
    expect(view['image']).toEqual({ url: 'a', overlay: '', credit: '', label: '' });
    expect(view['imageStyle']).toEqual({ ...IMAGE_STYLE_SHAPE, width: '40%' });
    for (const imageStyle of ['x', 3, null, ['x']]) expect(first(image('a', { imageStyle }))['imageStyle']).toEqual(IMAGE_STYLE_SHAPE);
  });

  describe('gallery', () => {
    it.each<[string, unknown, string]>([
      ['several images: the carousel', gallery(['a', 'b']), 'carousel'],
      ['slider: the carousel', gallery(['a', 'b'], { layout: 'slider' }), 'carousel'],
      ['a layout: the grid', gallery(['a', 'b'], { layout: 'pair' }), 'grid'],
      ['an unknown layout: the grid of the count', gallery(['a', 'b'], { layout: 4 }), 'grid'],
      ['a slideshow', gallery(['a', 'b'], { slideshow: show }), 'slideshow'],
      ['a slideshow with slider', gallery(['a', 'b'], { slideshow: show, layout: 'slider' }), 'slideshow'],
      ['a layout wins over a slideshow', gallery(['a', 'b'], { slideshow: show, layout: 'pair' }), 'grid'],
      ['effect none: the carousel', gallery(['a', 'b'], { slideshow: { ...show, effect: 'none' } }), 'carousel'],
      ['a malformed slideshow: the carousel', gallery(['a', 'b'], { slideshow: 'x' }), 'carousel'],
      ['one image: the image', gallery(['a']), 'image'],
      ['one image, side by side', gallery(['a'], { layout: 'side-by-side' }), 'grid'],
      ['one image with a slideshow: the image', gallery(['a'], { slideshow: show }), 'image'],
      ['only images with a path count', gallery(['a', '']), 'image'],
    ])('%s', (_name, block, type) => {
      expect(types(block)).toEqual([type]);
    });

    it('resolves the layout for the images that are drawn', () => {
      expect(first(gallery(['a', '', 'b'], { layout: 'big-left' }))).toMatchObject({ type: 'grid', layout: 'pair', images: [img('a'), img('b')] });
    });

    it('without images: nothing', () => {
      for (const images of [undefined, null, 'x', [], [null, 3, {}, { url: '' }]]) expect(views({ id: 'g', type: 'gallery', images })).toEqual([]);
    });
  });

  it('button: only a valid one, trimmed', () => {
    expect(first({ id: 'b', type: 'button', cta: { label: ' Mehr ', url: ' /a ' } })).toMatchObject({ type: 'button', cta: { label: 'Mehr', url: '/a' } });
    for (const bad of [undefined, null, 'x', 7, {}, { label: '', url: '/a' }, { label: 'x', url: 'javascript:alert(1)' }, { label: 7, url: 7 }]) {
      expect(views({ id: 'b', type: 'button', cta: bad })).toEqual([]);
    }
  });

  it('divider', () => {
    expect(types({ id: 'd', type: 'divider' })).toEqual(['divider']);
  });

  describe('columns', () => {
    it('two columns: sizes, content, which one carries the header', () => {
      expect(first(columns([{ size: 4, blocks: [image()] }, { size: 8, blocks: [text(), { id: 'b', type: 'button', cta }] }], { stackReverse: true }))).toMatchObject({
        type: 'columns', template: 'minmax(0, 4fr) minmax(0, 8fr)', stackReverse: true, headerColumn: undefined,
        columns: [{ blocks: [{ type: 'image' }] }, { blocks: [{ type: 'text' }, { type: 'button' }] }],
      });
      expect(first(columns([{ size: 4, blocks: [image()] }, { size: 8, blocks: [text()] }]))).toMatchObject({ headerColumn: 1 });
      expect(first(columns([{ size: 4, blocks: [text()] }, { size: 8, blocks: [image()] }]))).toMatchObject({ headerColumn: 0 });
    });

    it('an empty text still counts as the text column', () => {
      expect(first(columns([{ size: 6, blocks: [image()] }, { size: 6, blocks: [text('')] }]))).toMatchObject({ headerColumn: 1, columns: [{ blocks: [{ type: 'image' }] }, { blocks: [] }] });
    });

    it('columns that draw nothing are no view, as on the websites', () => {
      expect(views(columns([{ size: 6, blocks: [text('')] }, { size: 6, blocks: [image('')] }]))).toEqual([]);
      expect(views(columns([{ size: 6 }, { size: 6, blocks: [{ type: 'video' }] }]))).toEqual([]);
    });

    it('a column holds only texts, images and buttons', () => {
      const inner = [gallery(['a', 'b']), columns([]), { id: 'n', type: 'callout', html: 'A', tone: 'primary' }, { id: 'd', type: 'divider' }, { id: 's', type: 'space', size: 'small' }, text()];
      expect(first(columns([{ size: 12, blocks: inner }]))).toMatchObject({ columns: [{ blocks: [{ type: 'text' }] }] });
    });

    it('malformed columns', () => {
      for (const bad of [undefined, null, 'x', [], [null, 3]]) expect(views(columns(bad))).toEqual([]);
      expect(first(columns([{ size: 6 }, { size: 'x', blocks: [null, 3, {}] }, { blocks: 'x' }, { blocks: [text()] }]))).toMatchObject({
        template: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', columns: [{ blocks: [] }, { blocks: [] }, { blocks: [] }, { blocks: [{ type: 'text' }] }],
      });
    });
  });

  it('blocks that are no blocks, and unknown types, draw nothing', () => {
    expect(views(null, 3, 'x', {}, { type: 7 }, { id: 'v', type: 'video' }, { type: 'toString' }, { type: 'constructor' })).toEqual([]);
    for (const bad of [undefined, null, 'x', 3, {}]) expect(articleBlockViews(bad as unknown as ArticleBlock[])).toEqual([]);
  });

  it('keys are unique even when ids are missing or repeated', () => {
    const keys = views(text(), text(), { type: 'text', html: 'A' }, { id: 7, type: 'text', html: 'A' }, { id: 'x', type: 'text', html: 'A' }).map((v) => v.key);
    expect(new Set(keys).size).toBe(5);
    expect(keys[0]).toBe('t');
    expect(keys[4]).toBe('x');
  });
});

describe('drawnBlockImages', () => {
  const images = (...blocks: unknown[]): unknown[] => drawnBlockImages(blocks as ArticleBlock[]);

  it('the images in reading order, columns flattened', () => {
    expect(images(gallery(['a', 'b']), text(), columns([{ size: 6, blocks: [image('c')] }, { size: 6, blocks: [text(), image('d')] }]), image('e')))
      .toEqual(['a', 'b', 'c', 'd', 'e'].map(img));
  });

  it('leaves out images without a path and empties malformed texts', () => {
    expect(images(gallery(['a', '']), { ...image(), image: { url: 'b', overlay: 7 } }, { ...image(), image: 'x' }, { id: 'g', type: 'gallery', images: 'x' }, null, 3, {}, columns('x')))
      .toEqual([img('a'), { url: 'b', overlay: '' }]);
    for (const bad of [undefined, null, 'x', {}]) expect(drawnBlockImages(bad as unknown as ArticleBlock[])).toEqual([]);
  });
});

describe('undrawnBlockTypes', () => {
  it('unknown types, and types a column must not hold', () => {
    const blocks = [text(), { id: 'v', type: 'video' }, null, columns([{ size: 6, blocks: [text(), gallery(['a']), { type: 'audio' }] }, null])];
    expect(undrawnBlockTypes(blocks as unknown as ArticleBlock[])).toEqual(['video', 'gallery', 'audio']);
  });

  it('none', () => {
    expect(undrawnBlockTypes([text(), { id: 'd', type: 'divider' }] as ArticleBlock[])).toEqual([]);
    expect(undrawnBlockTypes('x' as unknown as ArticleBlock[])).toEqual([]);
  });
});

describe('articleHeaderPlace', () => {
  const place = (background: boolean, ...blocks: unknown[]) => articleHeaderPlace(blocks as ArticleBlock[], background);
  const beside = columns([{ size: 6, blocks: [image()] }, { size: 6, blocks: [text()] }]);
  const besideRight = columns([{ size: 6, blocks: [text()] }, { size: 6, blocks: [image()] }]);

  it('above the blocks', () => {
    expect(place(false, text())).toBe('card');
    expect(place(true, text())).toBe('card');
    expect(place(true)).toBe('card');
  });

  it('in the text column: own background and a first block of one image beside one text', () => {
    expect(place(true, beside, text())).toBe('column');
    expect(place(true, besideRight)).toBe('column');
    expect(place(true, null, besideRight)).toBe('column');
    expect(place(false, beside)).toBe('card');
    expect(place(true, text(), beside)).toBe('card');
  });

  it('not with other columns', () => {
    const col = (...blocks: unknown[]) => ({ size: 4, blocks });
    for (const cols of [
      [col(image()), col(text()), col(text())], [col(text()), col(text())], [col(image()), col(image())], [col(image(), text()), col()],
      [col(image()), col(text(), { id: 'b', type: 'button', cta })], [col(image()), { size: 4 }], 'x', undefined,
    ]) expect(place(true, columns(cols))).toBe('card');
  });

  it('on the images: a first block that is drawn as a slideshow', () => {
    expect(place(false, gallery(['a', 'b'], { slideshow: show }), text())).toBe('slideshow');
    expect(place(true, gallery(['a', 'b'], { slideshow: show }))).toBe('slideshow');
    expect(place(false, gallery(['a'], { slideshow: show }))).toBe('card');
    expect(place(false, gallery(['a', ''], { slideshow: show }))).toBe('card');
    expect(place(false, gallery(['a', 'b']))).toBe('card');
    expect(place(false, text(), gallery(['a', 'b'], { slideshow: show }))).toBe('card');
  });
});

describe('articleHeaderPlace: the first block that is drawn decides, as on the websites', () => {
  const place = (background: boolean, ...blocks: unknown[]) => articleHeaderPlace(blocks as ArticleBlock[], background);
  const show1 = gallery(['a', 'b'], { slideshow: show });
  const beside = columns([{ size: 6, blocks: [image()] }, { size: 6, blocks: [text()] }]);
  /** stored blocks that draw nothing */
  const undrawn: [string, unknown][] = [
    ['an empty text', text('')], ['an unknown type', { id: 'v', type: 'video' }], ['an image without a path', image('')],
    ['a gallery without images', gallery([''], { slideshow: show })], ['a half button', { id: 'b', type: 'button', cta: { label: 'x', url: '' } }],
    ['an empty callout', { id: 'n', type: 'callout', html: '<p></p>' }], ['empty columns', columns([{ size: 6, blocks: [text('')] }, { size: 6, blocks: [image('')] }])], ['null', null],
  ];

  it.each(undrawn)('%s before a slideshow', (_name, block) => {
    expect(place(false, block, show1, text())).toBe('slideshow');
    expect(place(true, block, show1)).toBe('slideshow');
    expect(place(false, block, block, show1)).toBe('slideshow');
  });

  it.each(undrawn)('%s before coloured columns', (_name, block) => {
    expect(place(true, block, beside)).toBe('column');
    expect(place(false, block, beside)).toBe('card');
  });

  it.each(undrawn)('%s before a text', (_name, block) => {
    expect(place(true, block, text(), show1)).toBe('card');
    expect(place(true, block, text(), beside)).toBe('card');
    expect(place(true, block)).toBe('card');
  });

  it('a divider and a space are drawn', () => {
    for (const block of [{ id: 'd', type: 'divider' }, { id: 's', type: 'space', size: 'small' }]) {
      expect(place(true, block, show1)).toBe('card');
      expect(place(true, block, beside)).toBe('card');
    }
  });

  it('a column counts what it draws', () => {
    const col = (...blocks: unknown[]) => ({ size: 6, blocks });
    expect(place(true, columns([col(image(), { type: 'video' }), col(text(''), text())]))).toBe('column');
    expect(place(true, columns([col(image(), text('')), col(text())]))).toBe('column');
    expect(place(true, columns([col(image()), col(text(''))]))).toBe('column');
    expect(place(true, columns([col(image('')), col(text())]))).toBe('card');
    expect(place(true, columns([col(image()), col(text(''), { id: 'b', type: 'button' })]))).toBe('card');
  });

  it('the title is drawn exactly once, whatever the blocks are', () => {
    const col = (...blocks: unknown[]) => ({ size: 6, blocks });
    const pool = [
      ...undrawn.map(([, block]) => block), text(), image(), gallery(['a', 'b']), gallery(['a'], { slideshow: show }), show1, { id: 'd', type: 'divider' }, beside,
      columns([col(text()), col(image(), text(''))]), columns([col(text('')), col(image())]), columns([col(text()), col(text())]), columns([col(image()), col(text(), text())]),
      columns([col(image('')), col(text())]), columns([col(image()), col(text()), col(text())]),
    ];
    for (const background of [true, false]) {
      for (const a of pool) for (const b of pool) for (const c of [undefined, show1, beside]) {
        const blocks = [a, b, c] as ArticleBlock[];
        const header = articleHeaderPlace(blocks, background);
        // what okr-article-blocks does with it
        const inBlocks = articleBlockViews(blocks).filter((view, i) => i === 0
          && ((header === 'slideshow' && view.type === 'slideshow') || (header === 'column' && view.type === 'columns' && view.columns.some((_c, j) => j === view.headerColumn))));
        expect(inBlocks.length + (header === 'card' ? 1 : 0), JSON.stringify(blocks)).toBe(1);
      }
    }
  });
});

describe('columnsTemplate', () => {
  it.each<[unknown[], string]>([
    [[4, 8], 'minmax(0, 4fr) minmax(0, 8fr)'],
    [[4, 4, 4], 'minmax(0, 4fr) minmax(0, 4fr) minmax(0, 4fr)'],
    [[6, 0], 'minmax(0, 1fr) minmax(0, 1fr)'],
    [[6, -1], 'minmax(0, 1fr) minmax(0, 1fr)'],
    [['6', 6], 'minmax(0, 1fr) minmax(0, 1fr)'],
    [[NaN, Infinity, undefined], 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)'],
  ])('%j', (sizes, template) => {
    expect(columnsTemplate(sizes)).toBe(template);
  });
});

describe('BlockViewCache', () => {
  const blocks = (...b: unknown[]): ArticleBlock[] => b as ArticleBlock[];
  const a = text('<p>A</p>', { id: 'a' });
  const b = image('b', { id: 'b' });
  const g = gallery(['a', 'b'], { id: 'g', slideshow: show });
  const c = columns([{ size: 6, blocks: [text('<p>C</p>', { id: 'c1' }), text('<p>@APP@</p>', { id: 'c2' })] }, { size: 6, blocks: [image('c', { id: 'c3' })] }]);
  const n = { id: 'n', type: 'callout', html: '<p>@APP@</p>', tone: 'primary' };
  const all = blocks(a, b, g, c, n, { id: 'd', type: 'divider' }, { id: 's', type: 'space', size: 'small' }, { id: 'u', type: 'button', cta });

  /** the same views, object by object */
  function expectSame(before: unknown[], after: unknown[], except: number[] = []): void {
    expect(after).toHaveLength(before.length);
    after.forEach((view, i) => (except.includes(i) ? expect(view).not.toBe(before[i]) : expect(view).toBe(before[i])));
  }
  const columnsOf = (view: ArticleBlockView): ColumnsBlockView => view as ColumnsBlockView;

  it('the same blocks: the same views, also in another array and another order', () => {
    const cache = new BlockViewCache();
    const before = cache.views(all);
    expectSame(before, cache.views(all));
    expectSame(before, cache.views([...all]));
    expectSame([...before].reverse(), cache.views([...all].reverse()));
    expectSame(before.slice(2), cache.views(all.slice(2)));
  });

  it('one changed block: only its view is new', () => {
    const cache = new BlockViewCache();
    const before = cache.views(all);
    const after = cache.views(blocks({ ...a, html: '<p>A!</p>' }, ...all.slice(1)));
    expectSame(before, after, [0]);
    expect(after[0]).toMatchObject({ key: 'a', html: '<p>A!</p>' });
  });

  it('a new object with the same content is a new view', () => {
    const cache = new BlockViewCache();
    expect(cache.views(blocks({ ...a }))[0]).not.toBe(cache.views(blocks({ ...a }))[0]);
  });

  it('a changed replacement: a new view of every text that shows it, in columns too', () => {
    let name = 'Kring';
    const cache = new BlockViewCache((html) => html.replace('@APP@', name));
    const before = cache.views(all);
    expectSame(before, cache.views(all));
    name = 'SCS';
    const after = cache.views(all);
    expectSame(before, after, [3, 4]);
    expect(after[4]).toMatchObject({ html: '<p>SCS</p>' });
    expect(columnsOf(after[3]).columns[0].blocks[0]).toBe(columnsOf(before[3]).columns[0].blocks[0]);
    expect(columnsOf(after[3]).columns[0].blocks[1]).toMatchObject({ html: '<p>SCS</p>' });
    expect(columnsOf(after[3]).columns[1].blocks[0]).toBe(columnsOf(before[3]).columns[1].blocks[0]);
  });

  it('the replacement runs on every call, for every text', () => {
    let calls = 0;
    const cache = new BlockViewCache((html) => { calls++; return html; });
    cache.views(all);
    expect(calls).toBe(4);
    cache.views(all);
    expect(calls).toBe(8);
  });

  it('an inner block changed: the view of the columns is new, the other inner views are the same', () => {
    const cache = new BlockViewCache();
    const [before] = cache.views(blocks(c));
    const [left, right] = c['columns'] as { size: number; blocks: object[] }[];
    const changed = { ...c, columns: [{ ...left, blocks: [{ ...left.blocks[0], html: '<p>neu</p>' }, left.blocks[1]] }, right] };
    const [after] = cache.views(blocks(changed));
    expect(after).not.toBe(before);
    expect(columnsOf(after).columns[0].blocks[0]).toMatchObject({ key: 'c1', html: '<p>neu</p>' });
    expect(columnsOf(after).columns[0].blocks[1]).toBe(columnsOf(before).columns[0].blocks[1]);
    expect(columnsOf(after).columns[1].blocks[0]).toBe(columnsOf(before).columns[1].blocks[0]);
  });

  it('duplicate ids: unique keys, and stable views', () => {
    const cache = new BlockViewCache();
    const twice = blocks(a, { ...a }, { type: 'divider' }, { type: 'divider' });
    const before = cache.views(twice);
    expect(new Set(before.map((v) => v.key)).size).toBe(4);
    expectSame(before, cache.views(twice));
    // without the first one the second gets its key: a new view, never two with one key
    const after = cache.views(twice.slice(1));
    expect(after[0].key).toBe('a');
    expect(new Set(after.map((v) => v.key)).size).toBe(3);
  });

  it('the same object twice: two keys', () => {
    const cache = new BlockViewCache();
    expect(cache.views(blocks(a, a)).map((v) => v.key)).toEqual(['a', 'a#1']);
    expect(cache.views(blocks(a, a)).map((v) => v.key)).toEqual(['a', 'a#1']);
  });

  it('a block that becomes empty, and back', () => {
    const cache = new BlockViewCache();
    const [before] = cache.views(blocks(a));
    expect(cache.views(blocks({ ...a, html: '' }))).toEqual([]);
    expect(cache.views(blocks(a))[0]).toBe(before);
  });

  it('view: one block, the same object as in views', () => {
    const cache = new BlockViewCache((html) => html.replace('@APP@', 'Kring'));
    const before = cache.views(all);
    expectSame(before, all.map((block) => cache.view(block)));
    const inner = (c['columns'] as { blocks: ArticleBlock[] }[])[0].blocks[1];
    expect(cache.view(inner)).toBe(columnsOf(before[3]).columns[0].blocks[1]);
    expect(cache.view(inner)).toMatchObject({ html: '<p>Kring</p>' });
  });

  it('view: nothing for what is not drawn', () => {
    const cache = new BlockViewCache();
    for (const bad of [undefined, null, 'x', 3, {}, { id: 'v', type: 'video' }, text(''), gallery([]), columns([])]) expect(cache.view(bad as unknown as ArticleBlock)).toBeUndefined();
  });

  it('what views returns equals articleBlockViews, whatever the blocks are and however often', () => {
    const replace = (html: string) => html.replace('@APP@', 'Kring');
    const cache = new BlockViewCache(replace);
    const inputs: unknown[] = [
      undefined, null, 'x', 3, {}, [], all, [null, 3, 'x', {}, { type: 7 }, { id: 'v', type: 'video' }, { type: 'toString' }, { type: 'constructor' }],
      [text(), text(), { type: 'text', html: 'A' }, { id: 7, type: 'text', html: 'A' }, { id: 'x', type: 'text', html: 'A' }],
      [text(''), text('x'), text('<p><img src="https://example.org/a.png"></p>'), text('A', { align: 'x' }), text('A', { align: 'center' }), { id: 'b', type: 'button', cta, align: 'right' }, { id: 'b', type: 'button', cta: { label: 'x', url: 'javascript:alert(1)' } }],
      [image('a', { imageStyle: { width: '50%' } }), image(''), { ...image(), image: { url: 'a', overlay: 7, credit: {}, label: null }, imageStyle: { height: 5, border: null, width: '40%' } }, image('a', { imageStyle: 'x' })],
      [gallery(['a', 'b']), gallery(['a', 'b'], { layout: 'slider' }), gallery(['a', 'b'], { layout: 'pair' }), gallery(['a', 'b'], { layout: 4 }), gallery(['a', 'b'], { slideshow: show, layout: 'pair' }), gallery(['a', 'b'], { slideshow: 'x' }), gallery(['a']), gallery(['a'], { layout: 'side-by-side' }), gallery(['a', ''])],
      [columns([{ size: 4, blocks: [image()] }, { size: 8, blocks: [text(), { id: 'b', type: 'button', cta }] }], { stackReverse: true }), columns([{ size: 6, blocks: [image()] }, { size: 6, blocks: [text('')] }]), columns([{ size: 12, blocks: [gallery(['a', 'b']), columns([]), n, text()] }]), columns('x'), columns([{ size: 6 }, { size: 'x', blocks: [null, 3, {}] }, { blocks: 'x' }, { blocks: [text()] }])],
    ];
    for (const input of [...inputs, ...inputs]) {
      expect(cache.views(input as ArticleBlock[])).toEqual(articleBlockViews(input as ArticleBlock[], replace));
    }
  });
});

describe('previewDevice', () => {
  it.each<[ArticlePreviewDevice, string, object | undefined]>([
    ['auto', 'auto', undefined],
    ['mobile', 'stacked', { width: 390, height: 844 }],
    ['tablet', 'wide', { width: 768, height: 1024 }],
    ['desktop', 'wide', { width: 1100, height: 800 }],
  ])('%s', (device, form, viewport) => {
    expect(articleColumnsForm(device)).toBe(form);
    expect(previewViewport(device)).toEqual(viewport);
  });
});
