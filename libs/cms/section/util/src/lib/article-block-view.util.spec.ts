import { describe, expect, it } from 'vitest';

import { ArticleBlock, IMAGE_STYLE_SHAPE } from '@okr/shared-models';

import { ArticleBlockView, articleBlockViews, articleHeaderPlace, columnsTemplate, drawnBlockImages, undrawnBlockTypes } from './article-block-view.util';

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
    it('two columns: sizes, content, which one holds the text', () => {
      expect(first(columns([{ size: 4, blocks: [image()] }, { size: 8, blocks: [text(), { id: 'b', type: 'button', cta }] }], { stackReverse: true }))).toMatchObject({
        type: 'columns', template: 'minmax(0, 4fr) minmax(0, 8fr)', stackReverse: true,
        columns: [{ holdsText: false, blocks: [{ type: 'image' }] }, { holdsText: true, blocks: [{ type: 'text' }, { type: 'button' }] }],
      });
    });

    it('an empty text still counts as the text column', () => {
      expect(first(columns([{ size: 6, blocks: [image()] }, { size: 6, blocks: [text('')] }]))).toMatchObject({ columns: [{ holdsText: false }, { holdsText: true, blocks: [] }] });
    });

    it('a column holds only texts, images and buttons', () => {
      const inner = [gallery(['a', 'b']), columns([]), { id: 'n', type: 'callout', html: 'A', tone: 'primary' }, { id: 'd', type: 'divider' }, { id: 's', type: 'space', size: 'small' }, text()];
      expect(first(columns([{ size: 12, blocks: inner }]))).toMatchObject({ columns: [{ blocks: [{ type: 'text' }] }] });
    });

    it('malformed columns', () => {
      for (const bad of [undefined, null, 'x', [], [null, 3]]) expect(views(columns(bad))).toEqual([]);
      expect(first(columns([{ size: 6 }, { size: 'x', blocks: [null, 3, {}] }, { blocks: 'x' }]))).toMatchObject({
        template: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', columns: [{ blocks: [] }, { blocks: [] }, { blocks: [] }],
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
