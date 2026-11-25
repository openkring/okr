import { staticSuite } from 'vest';
import { describe, expect, it } from 'vitest';

import { ImageActionType, type MailBlock } from '@okr/shared-models';

import { mailBlocksValidations } from './mail-blocks.validations';

const suite = staticSuite((blocks: unknown) => mailBlocksValidations(blocks as MailBlock[]));
const errors = (blocks: unknown) => suite(blocks).getErrors();
const fields = (blocks: unknown): string[] => Object.keys(errors(blocks));

const image = { label: 'a', type: 1, url: 'tenant/scs/a.jpg', altText: 'a', actionUrl: '', overlay: '', documentKey: '', credit: '' };
const cta = { label: 'Los', url: 'https://example.org', style: 'primary' };
const events = { id: 'e', type: 'events', calendarKey: 'scs', maxEvents: 5 };
const text = (id: string, extra: object = {}) => ({ id, type: 'text', html: '<p>x</p>', ...extra });
const button = (url: unknown) => ({ id: 'b', type: 'button', cta: { ...cta, url } });
const columns = (...inner: unknown[]) => ({ id: 'c', type: 'columns', columns: [{ size: 6, blocks: inner }, { size: 6, blocks: [] }] });

describe('mailBlocksValidations', () => {
  it('accepts a valid mail with all nine types', () => {
    expect(errors([
      text('t', { align: 'center' }),
      { id: 'i', type: 'image', image: { ...image, actionUrl: 'https://example.org' }, imageStyle: { width: '50%', captionPosition: 'bottom' } },
      { id: 'g', type: 'gallery', images: [image, image] },
      { id: 'b', type: 'button', cta, align: 'right' },
      { id: 'c', type: 'columns', columns: [{ size: 4, blocks: [text('ct')] }, { size: 8, blocks: [{ id: 'ci', type: 'image', image }, { id: 'cb', type: 'button', cta }] }] },
      { id: 'k', type: 'callout', html: '<p>x</p>', tone: 'neutral' },
      { id: 'd', type: 'divider' },
      { id: 's', type: 'space', size: 'small' },
      { ...events, title: 'Anlässe', maxEvents: 10 },
    ])).toEqual({});
    expect(errors([])).toEqual({});
    expect(errors([text('t', { html: '' })])).toEqual({});
  });

  it.each([undefined, null, 'x', {}, { 0: text('t') }])('flags %j, which is no list', (blocks) => expect(fields(blocks)).toEqual(['blocks']));

  it('flags more than 50 blocks, a missing, an empty and a repeated id', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => text(`t${i}`));
    expect(fields(many(50))).toEqual([]);
    expect(fields(many(51))).toEqual(['blocks']);
    expect(fields([text('')])).toEqual(['blocks']);
    expect(fields([{ type: 'divider' }])).toEqual(['blocks']);
    expect(fields([{ id: 5, type: 'divider' }])).toEqual(['blocks']);
    expect(fields([text('a'), columns(text('a'))])).toEqual(['blocks']);
  });

  it.each([null, undefined, 'x', 5, []])('flags the entry %j, also in a column', (entry) => {
    expect(fields([entry])).toEqual(['blocks']);
    expect(fields([columns(entry)])).toEqual(['blocks']);
  });

  it.each(['video', '', 'constructor', undefined, null, 5])('flags the type %j: a mail with it would be refused', (type) => {
    expect(fields([{ id: 'x', type }])).toEqual(['blocks.x.type']);
    expect(fields([columns({ id: 'x', type })])).toEqual(['blocks.x.type']);
  });

  it('flags what may not stand in a column', () => {
    for (const inner of [{ id: 'x', type: 'divider' }, { ...events, id: 'x' }, { id: 'x', type: 'gallery', images: [image] }, { id: 'x', type: 'callout', html: '', tone: 'primary' }, { id: 'x', type: 'space', size: 'small' }]) {
      expect(fields([columns(inner)])).toEqual(['blocks.x.type']);
    }
    expect(fields([columns({ ...columns(), id: 'x' })])).toContain('blocks.x.type');
  });

  it.each([undefined, null, 5, {}])('flags a text and a callout with the html %j', (html) => {
    expect(fields([{ id: 't', type: 'text', html }])).toEqual(['blocks.t.html']);
    expect(fields([{ id: 't', type: 'callout', html, tone: 'primary' }])).toEqual(['blocks.t.html']);
  });

  it('a mail has no translations: stored ones are no error', () => {
    expect(fields([text('t', { html: '', htmlI18n: { en: '<p>x</p>' } })])).toEqual([]);
  });

  it.each([
    '', '   ', undefined, null, 5, '/a.jpg', 'http://a.ch/a.jpg', 'data:image/png;base64,x', 'javascript:alert(1)', 'https://', 'https:///a.jpg', 'https:// a.jpg', 'https://a.ch/\\a.jpg',
    'tenant/a\u0001.jpg', 'tenant\\a.jpg', 'tenant/\ud800.jpg', 'tenant:x',
  ])('flags the picture address %j, in an image, a gallery and a column', (url) => {
    const bad = { ...image, url };
    expect(fields([{ id: 'i', type: 'image', image: bad }])).toEqual(['blocks.i.image.url']);
    expect(fields([columns({ id: 'i', type: 'image', image: bad })])).toEqual(['blocks.i.image.url']);
    expect(fields([{ id: 'g', type: 'gallery', images: [bad] }])).not.toEqual([]);
  });

  it.each(['tenant/scs/a.jpg', 'tenant/scs/ä b?#%.jpg', 'https://a.ch/a.jpg', 'https://a.ch/a b.jpg', 'assets/a.jpg'])('accepts the picture address %s', (url) =>
    expect(fields([{ id: 'i', type: 'image', image: { ...image, url } }, { id: 'g', type: 'gallery', images: [{ ...image, url }] }])).toEqual([]));

  it('an image needs a picture: an alt text alone is not enough', () => {
    expect(errors([{ id: 'i', type: 'image', image: { ...image, url: '' } }])).toEqual({ 'blocks.i.image.url': ['required'] });
    expect(fields([{ id: 'i', type: 'image' }])).toEqual(['blocks.i.image.url']);
    expect(fields([{ id: 'i', type: 'image', image: 'x' }])).toEqual(['blocks.i.image.url']);
  });

  it('flags a gallery without a picture and one with an entry that is none', () => {
    for (const images of [undefined, null, 'x', [], [{ ...image, url: '' }]]) expect(fields([{ id: 'g', type: 'gallery', images }])).toEqual(['blocks.g.images']);
    for (const entry of [null, 'x', 5]) expect(fields([{ id: 'g', type: 'gallery', images: [image, entry] }])).toEqual(['blocks.g.images[1].url']);
    expect(fields([{ id: 'g', type: 'gallery', images: [image, { ...image, url: '' }] }])).toEqual([]);
  });

  it('flags a picture link that is not safe', () => {
    expect(fields([{ id: 'i', type: 'image', image: { ...image, actionUrl: 'javascript:alert(1)' } }])).toEqual(['blocks.i.image.actionUrl']);
    expect(fields([{ id: 'g', type: 'gallery', images: [{ ...image, actionUrl: 'data:x' }] }])).toEqual(['blocks.g.images[0].actionUrl']);
  });

  it('ignores the settings a mail does not have: layout, slideshow, zoom, action, stack order', () => {
    const style = { action: 99, zoomFactor: 99 };
    expect(fields([
      { id: 'i', type: 'image', image, imageStyle: style },
      { id: 'g', type: 'gallery', images: [image], imageStyle: { ...style, action: ImageActionType.Zoom }, layout: 'nope', slideshow: 'x' },
      { ...columns(text('t')), stackReverse: 'x' },
    ])).toEqual([]);
    expect(fields([{ id: 'i', type: 'image', image, imageStyle: 'x' }])).toEqual(['blocks.i.imageStyle']);
    expect(fields([{ id: 'i', type: 'image', image, imageStyle: { width: 5 } }])).toContain('blocks.i.imageStyle.width');
  });

  // the vectors of mailTargetUrl (shared-util-core), which the server's renderer uses, too
  it.each([
    'https://a.ch/x', '  https://a.ch/x?a=1&b=2#c  ', 'mailto:a@b.ch', 'tel:+41 44 000 00 00', '/club', ' /private/events ', '/', 'Https://a.ch/X', 'HTTPS://a.ch', 'MailTo:A@b.ch', 'TEL:+41',
  ])('accepts a button to %s', (url) => expect(fields([button(url)])).toEqual([]));

  it.each([
    'https://', 'https:///a', 'https://?x=1', 'https://#a', 'mailto:', 'mailto:?subject=x', 'mailto: ', 'tel:', 'tel:+', 'tel:?x',
    '', '   ', '#top', '#', 'club.html', 'club.html#a', 'club', 'www.a.ch', '//evil.org', '/\\evil.org', '/a\\b', 'http://a.ch', 'HTTP://a.ch',
    'javascript:alert(1)', 'JavaScript:alert(1)', 'java\tscript:alert(1)', 'data:text/html,x', 'vbscript:x', 'file:///etc/passwd', 'ftp://a.ch',
    'https://a.ch/\u0001', 'https://a.ch/a\nb', 'https://a.ch\\@evil.org', '/club\u007f', undefined, null, 42, {}, ['https://a.ch'],
  ])('flags a button to %j, also in a column', (url) => {
    expect(fields([button(url)])).toEqual(['blocks.b.cta.url']);
    expect(fields([columns(button(url))])).toEqual(['blocks.b.cta.url']);
  });

  it('flags a button without label, without cta, and of an unknown style', () => {
    for (const label of ['', '  ', undefined, 5]) expect(fields([{ id: 'b', type: 'button', cta: { ...cta, label } }])).toEqual(['blocks.b.cta.label']);
    for (const bad of [undefined, null, 'x']) expect(fields([{ id: 'b', type: 'button', cta: bad }])).toEqual(['blocks.b.cta.label', 'blocks.b.cta.url']);
    expect(fields([{ id: 'b', type: 'button', cta: { ...cta, style: 'x' } }])).toEqual(['blocks.b.cta.style']);
  });

  it.each(['', '  ', undefined, null, 5])('flags an events block with the calendar %j', (calendarKey) =>
    expect(errors([{ ...events, calendarKey }])).toEqual({ 'blocks.e.calendarKey': ['required'] }));

  it('flags the title and the number of an events block', () => {
    expect(fields([{ ...events, title: 5 }])).toEqual(['blocks.e.title']);
    expect(fields([{ ...events, title: '' }])).toEqual([]);
    for (const maxEvents of [0, 11, 1.5, '5', undefined, NaN]) expect(fields([{ ...events, maxEvents }])).toEqual(['blocks.e.maxEvents']);
    for (const maxEvents of [1, 10]) expect(fields([{ ...events, maxEvents }])).toEqual([]);
  });

  it('flags columns that are no two or three columns of 12', () => {
    const col = (size: unknown, blocks: unknown = []) => ({ size, blocks });
    for (const bad of [undefined, 'x', [], [col(12)], [col(3), col(3), col(3), col(3)], [null, col(6)], [col(6, 'x'), col(6)], [col(6), col(5)], [col('6'), col(6)], [col(0), col(12)]]) {
      expect(fields([{ id: 'c', type: 'columns', columns: bad }])).toEqual(['blocks.c.columns']);
    }
    expect(fields([{ id: 'c', type: 'columns', columns: [col(4), col(4), col(4)] }])).toEqual([]);
  });

  it('flags an unknown alignment, tone and size', () => {
    expect(fields([text('t', { align: 'justify' })])).toEqual(['blocks.t.align']);
    expect(fields([{ id: 'k', type: 'callout', html: '', tone: 'x' }])).toEqual(['blocks.k.tone']);
    expect(fields([{ id: 's', type: 'space', size: 'x' }])).toEqual(['blocks.s.size']);
    for (const tone of ['primary', 'secondary', 'tertiary', 'neutral']) expect(fields([{ id: 'k', type: 'callout', html: '', tone }])).toEqual([]);
  });
});
