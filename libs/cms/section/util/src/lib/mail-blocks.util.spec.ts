import { describe, expect, it } from 'vitest';

import { ARTICLE_BLOCK_TYPES, ImageActionType, ImageType, ViewPosition, type MailBlock, type SectionModel } from '@okr/shared-models';

import { createBlock } from './article-editor.util';
import { mailBlocksFromSections, mailBlocksHaveContent } from './mail-blocks.util';

const counter = () => { let n = 0; return () => `n${++n}`; };
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) Object.values(Object.freeze(value)).forEach(deepFreeze);
  return value;
}
/** All objects and arrays in a value. */
function objectsIn(value: unknown, out = new Set<unknown>()): Set<unknown> {
  if (typeof value === 'object' && value !== null && !out.has(value)) {
    out.add(value);
    Object.values(value).forEach((v) => objectsIn(v, out));
  }
  return out;
}
const sharesNothing = (a: unknown, b: unknown) => [...objectsIn(a)].every((o) => !objectsIn(b).has(o));
const convert = (sections: unknown[]) => mailBlocksFromSections(deepFreeze(sections) as SectionModel[], counter());

const image = (url: string, extra: object = {}) => ({ label: url, type: ImageType.Image, url, actionUrl: '', altText: `alt ${url}`, overlay: '', documentKey: '', credit: '', ...extra });
const old = (properties: object = {}, rest: object = {}) => ({
  okey: 's', type: 'article', state: 'draft', name: 'n', title: '', subTitle: '', index: '', isArchived: false, tenants: ['scs'],
  content: { htmlContent: '<p></p>', colSize: 4, position: ViewPosition.Top }, properties: { images: [], ...properties }, ...rest,
});
const content = (htmlContent: string, position = ViewPosition.Top) => ({ content: { htmlContent, colSize: 4, position } });

describe('mailBlocksHaveContent', () => {
  const has = (...blocks: unknown[]) => mailBlocksHaveContent(blocks as MailBlock[]);
  const text = (html: unknown) => ({ id: 't', type: 'text', html });
  const inColumn = (...inner: unknown[]) => ({ id: 'c', type: 'columns', columns: [{ size: 6, blocks: [] }, { size: 6, blocks: inner }] });

  it('a text that shows something counts, also in a column', () => {
    for (const html of ['<p>Hallo</p>', '<p><img src="https://a.ch/a.jpg"></p>', 'x']) {
      expect(has(text(html))).toBe(true);
      expect(has(inColumn(text(html)))).toBe(true);
      expect(has({ id: 'k', type: 'callout', html, tone: 'neutral' })).toBe(true);
    }
  });

  it('a text that shows nothing does not', () => {
    for (const html of ['', '<p></p>', '<p> &nbsp;&#160;&#xA0;<br></p>', '<hr>', '<!-- x --><style>p { color: red }</style>', undefined, null, 5]) {
      expect(has(text(html))).toBe(false);
      expect(has(inColumn(text(html)))).toBe(false);
      expect(has({ id: 'k', type: 'callout', html, tone: 'neutral' })).toBe(false);
    }
  });

  it('a picture counts, also one that only has an alt text', () => {
    expect(has({ id: 'i', type: 'image', image: image('a.jpg') })).toBe(true);
    expect(has({ id: 'i', type: 'image', image: { url: '', altText: 'Boot' } })).toBe(true);
    expect(has(inColumn({ id: 'i', type: 'image', image: image('a.jpg') }))).toBe(true);
    expect(has({ id: 'g', type: 'gallery', images: [{ url: '' }, image('a.jpg')] })).toBe(true);
    for (const block of [{ id: 'i', type: 'image', image: { url: ' ' } }, { id: 'i', type: 'image' }, { id: 'g', type: 'gallery', images: [{ url: '' }, null] }, { id: 'g', type: 'gallery' }]) expect(has(block)).toBe(false);
  });

  it('a button counts as soon as something is entered', () => {
    expect(has({ id: 'b', type: 'button', cta: { label: 'Los', url: '', style: 'primary' } })).toBe(true);
    expect(has({ id: 'b', type: 'button', cta: { label: '', url: '/club', style: 'primary' } })).toBe(true);
    expect(has(inColumn({ id: 'b', type: 'button', cta: { label: 'Los', url: '/club' } }))).toBe(true);
    for (const cta of [{ label: ' ', url: '' }, undefined, 'x']) expect(has({ id: 'b', type: 'button', cta })).toBe(false);
  });

  it('events, lines, spaces, columns without content and unknown blocks do not count', () => {
    expect(has({ id: 'e', type: 'events', calendarKey: 'scs', title: 'Anlässe', maxEvents: 5 }, { id: 'd', type: 'divider' }, { id: 's', type: 'space', size: 'large' },
      inColumn(), { id: 'c', type: 'columns' }, { id: 'c', type: 'columns', columns: [null, { blocks: 'x' }] }, { id: 'v', type: 'video', html: '<p>x</p>' }, null, 'x')).toBe(false);
    expect(has()).toBe(false);
  });

  it('nothing that was just added counts', () => {
    for (const type of ARTICLE_BLOCK_TYPES) expect(has(createBlock(type, counter()))).toBe(false);
    expect(has(createBlock('events', counter()))).toBe(false);
  });

  it.each([undefined, null, 'x', {}])('never throws on %j', (blocks) => expect(mailBlocksHaveContent(blocks as unknown as MailBlock[])).toBe(false));
});

describe('mailBlocksFromSections', () => {
  it('turns an article with every old field into blocks, in the order of the old mail', () => {
    const cta = { label: ' Mehr ', labelI18n: { en: 'More' }, url: ' /club ', style: 'secondary' };
    expect(convert([old({
      images: [image('a.jpg', { actionUrl: 'https://a.ch', overlay: 'Legende', credit: 'Foto: A', pending: true })],
      imageStyle: { width: '50%', action: ImageActionType.Zoom, zoomFactor: 4, captionPosition: 'top-overlay', border: '', showTitle: true },
      imageLayout: 'side-by-side', slideshow: { effect: 'fade', autoplay: true, interval: 3, duration: 1 }, cta, contentI18n: { en: '<p>Hi</p>' }, titleI18n: { en: 'T' },
      datePublished: '20261101', background: '#fff', emphasis: 'banner',
    }, { title: ' A < B ', subTitle: 'Sub & Co', intro: 'eins\nzwei', introPosition: 'above', ...content('<p>Text</p>', ViewPosition.Left) })])).toEqual([
      {
        id: 'n1', type: 'image', image: image('a.jpg', { overlay: 'Legende', credit: 'Foto: A' }),
        imageStyle: { width: '50%', captionPosition: 'bottom', border: '' },
      },
      { id: 'n2', type: 'text', html: '<p>eins<br>zwei</p><h2>A &lt; B</h2><p>Sub &amp; Co</p>' },
      { id: 'n3', type: 'text', html: '<p>Text</p>' },
      { id: 'n4', type: 'button', cta: { label: 'Mehr', url: '/club', style: 'secondary' } },
    ]);
  });

  it('puts the intro below by default, and leaves out what the old mail did not show', () => {
    expect(convert([old({}, { title: 'T', intro: 'I' })])).toEqual([{ id: 'n1', type: 'text', html: '<h2>T</h2><p>I</p>' }]);
    expect(convert([old({ images: [{ url: '', altText: ' ' }], cta: { label: '', url: '', style: 'primary' } }, content('<p>&nbsp;</p>'))])).toEqual([]);
    expect(convert([old({}, { ...content('<p>x</p>'), isArchived: true })])).toEqual([]);
  });

  it.each([['', '/club'], [' ', '/club'], [5, '/club'], ['Los', ''], ['Los', 'club.html'], ['Los', '#top'], ['Los', 'http://a.ch'], ['Los', 'javascript:x'], ['Los', undefined]])(
    'leaves out the button %j to %j of an article, which the old mail did not draw', (label, url) => expect(convert([old({ cta: { label, url, style: 'primary' } }, content('<p>x</p>'))])).toEqual([{ id: 'n1', type: 'text', html: '<p>x</p>' }]));

  it.each(['https://a.ch', 'mailto:a@b.ch', 'tel:1', '/club'])('keeps the button to %s of an article', (url) =>
    expect(convert([old({ cta: { label: 'Los', url, style: 'primary' } })])).toEqual([{ id: 'n1', type: 'button', cta: { label: 'Los', url, style: 'primary' } }]));

  it('keeps several pictures as a gallery, a hidden one as an image, one without address to be fixed', () => {
    expect(convert([old({ images: [image('a.jpg'), { url: '' }, image('b.jpg')], imageLayout: 'mosaic' }, content('', ViewPosition.None))]))
      .toEqual([{ id: 'n1', type: 'gallery', images: [image('a.jpg'), image('b.jpg')] }]);
    expect(convert([old({ images: [image('a.jpg')] }, content('', ViewPosition.None))])).toEqual([{ id: 'n1', type: 'image', image: image('a.jpg') }]);
    expect(convert([old({ images: [{ altText: 'Boot' }] })])).toEqual([{ id: 'n1', type: 'image', image: { ...image(''), label: '', altText: 'Boot' } }]);
  });

  it('keeps the link of a picture that has one', () => {
    expect(convert([old({ images: [image('a.jpg', { actionUrl: 'https://a.ch' })], imageStyle: { action: ImageActionType.FollowLink, zoomFactor: 3 } })]))
      .toEqual([{ id: 'n1', type: 'image', image: image('a.jpg', { actionUrl: 'https://a.ch' }), imageStyle: { action: ImageActionType.FollowLink } }]);
  });

  it('converts buttons', () => {
    const button = (label: unknown, url: unknown, altText: unknown = '') => ({ okey: 'b', type: 'button', properties: { style: { label }, action: { url, altText } } });
    expect(convert([button('Los', '/club'), button('', 'https://a.ch', 'Alt'), button('Halb', ''), button('', '')])).toEqual([
      { id: 'n1', type: 'button', cta: { label: 'Los', url: '/club', style: 'primary' }, align: 'center' },
      { id: 'n2', type: 'button', cta: { label: 'Alt', url: 'https://a.ch', style: 'primary' }, align: 'center' },
      { id: 'n3', type: 'button', cta: { label: 'Halb', url: '', style: 'primary' }, align: 'center' },
    ]);
  });

  it('converts events with the number the old mail listed', () => {
    const events = (maxEvents: unknown, title = '') => ({ okey: 'e', type: 'events', name: ' scs ', title, properties: { maxEvents } });
    expect(convert([events(7.9, ' Termine ')])).toEqual([{ id: 'n1', type: 'events', calendarKey: 'scs', title: 'Termine', maxEvents: 7 }]);
    for (const [stored, shown] of [[0, 5], [99, 10], [undefined, 5], ['3', 5], [NaN, 5], [Infinity, 5], [1, 1]]) {
      expect(convert([events(stored)])).toEqual([{ id: 'n1', type: 'events', calendarKey: 'scs', maxEvents: shown }]);
    }
    expect(convert([{ type: 'events' }])).toEqual([{ id: 'n1', type: 'events', calendarKey: '', maxEvents: 5 }]);
  });

  it('keeps the order of the sections', () => {
    expect(convert([old({}, content('<p>1</p>')), { type: 'events', name: 'scs' }, old({}, content('<p>2</p>'))]).map((b) => b.type)).toEqual(['text', 'events', 'text']);
  });

  it('a section of another type becomes an unknown block, which is an error to fix', () => {
    expect(convert([{ okey: 'm', type: 'map', properties: {} }])).toEqual([{ id: 'n1', type: 'map' }]);
  });

  it('copies the blocks of an article with blocks: new ids, nothing shared, nothing left out', () => {
    const blocks = [
      { id: 'a', type: 'text', html: '<p>x</p>', align: 'center' },
      { id: 'c', type: 'columns', columns: [{ size: 6, blocks: [{ id: 'ca', type: 'text', html: '' }, { id: 'cb', type: 'image', image: image('a.jpg'), imageStyle: { width: '50%' } }] }, { size: 6, blocks: [] }] },
      { id: 'g', type: 'gallery', images: [image('a.jpg'), image('b.jpg')] },
      { id: 'e', type: 'events', calendarKey: 'scs', title: 'T', maxEvents: 3 },
      { id: 'v', type: 'video', deep: { list: [{ x: 1 }] } },
    ];
    const section = old({ blocks, images: [image('old.jpg')] }, { title: 'alt', ...content('<p>alt</p>') });
    const result = convert([section]);
    expect(result).toEqual([
      { ...blocks[0], id: 'n1' },
      { ...blocks[1], id: 'n2', columns: [{ size: 6, blocks: [{ id: 'n3', type: 'text', html: '' }, { id: 'n4', type: 'image', image: image('a.jpg'), imageStyle: { width: '50%' } }] }, { size: 6, blocks: [] }] },
      { ...blocks[2], id: 'n5' },
      { ...blocks[3], id: 'n6' },
      { ...blocks[4], id: 'n7' },
    ]);
    expect(sharesNothing(result, section)).toBe(true);
  });

  it('two copies of the same mail share nothing', () => {
    const sections = deepFreeze([old({ blocks: [{ id: 'g', type: 'gallery', images: [image('a.jpg')] }] })]) as unknown as SectionModel[];
    expect(sharesNothing(mailBlocksFromSections(sections, counter()), mailBlocksFromSections(sections, counter()))).toBe(true);
  });

  it('the result of old sections shares nothing with them', () => {
    const section = old({ images: [image('a.jpg'), image('b.jpg')], imageStyle: { width: '50%' }, cta: { label: 'x', url: '/', style: 'primary' } }, content('<p>x</p>'));
    expect(sharesNothing(convert([section]), section)).toBe(true);
  });

  it('never throws on malformed sections', () => {
    const malformed = [
      null, undefined, 'x', 5, [], {}, { type: 5 }, { type: 'article' }, { type: 'article', content: 'x', properties: 'x', title: 5, intro: {} },
      { type: 'article', content: { htmlContent: 5 }, properties: { images: 'x', imageStyle: 5, cta: 'x' } }, { type: 'article', properties: { images: [null, 'x', { url: 5 }], imageStyle: { constructor: 'x', width: 5 } } },
      { type: 'button' }, { type: 'button', properties: { style: 'x', action: null } }, { type: 'events', name: 5, title: {}, properties: 5 },
      { type: 'article', properties: { blocks: [null, 'x', {}, { type: 'columns' }, { type: 'columns', columns: [null, 'x', { blocks: 'x' }, { blocks: [null, { type: 'text' }] }] }] } },
    ];
    expect(() => convert(malformed)).not.toThrow();
    for (const sections of [undefined, null, 'x', {}]) expect(mailBlocksFromSections(sections as unknown as SectionModel[], counter())).toEqual([]);
  });
});
