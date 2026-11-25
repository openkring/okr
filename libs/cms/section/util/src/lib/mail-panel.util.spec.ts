import { describe, expect, it } from 'vitest';

import { IMAGE_STYLE_SHAPE, ImageActionType, type ImageConfig, type ImageStyle, type MailBlock } from '@okr/shared-models';

import { MAIL_CAPTION_POSITIONS, MAIL_IMAGE_WIDTHS, drawnMailBlock, eventsNote, mailCaptionPosition, mailEventsDrawn, mailImageWidth, mailPictureStyle, mailToneOf, withMailLinks } from './mail-panel.util';

const image = (o: object = {}): ImageConfig => ({ label: '', type: 0, url: 'tenant/t/a.jpg', actionUrl: '', altText: '', overlay: '', ...o }) as ImageConfig;
const img = (o: object = {}, imageStyle?: object): MailBlock => ({ id: 'i', type: 'image', image: image(o), ...(imageStyle ? { imageStyle } : {}) }) as MailBlock;

describe('mailImageWidth', () => {
  // the rule of pictureWidth in render-mail-blocks.logic.ts (functions)
  it.each([
    ['50%', '50%'], [' 33.5% ', '33.5%'], ['100%', '100%'], ['120%', '100%'], ['0%', '100%'],
    ['300px', '300px'], ['300', '300px'], ['300.6px', '301px'], ['900px', '440px'], ['0.3px', '100%'],
    ['auto', '100%'], ['50vw', '100%'], ['', '100%'], [undefined, '100%'], [5, '100%'],
  ])('%j → %s', (width, expected) => {
    expect(mailImageWidth({ width } as unknown as Partial<ImageStyle>)).toBe(expected);
  });
  it('without a style it is all of it', () => {
    expect(mailImageWidth(undefined)).toBe('100%');
    expect(mailImageWidth('x' as unknown as Partial<ImageStyle>)).toBe('100%');
  });
  it('offers four widths, the widest first', () => {
    expect(MAIL_IMAGE_WIDTHS).toEqual(['100%', '75%', '50%', '25%']);
  });
});

describe('mailCaptionPosition', () => {
  // the rule of picture() in render-mail-blocks.logic.ts (functions)
  it.each([
    ['none', 'none'], [undefined, 'none'], ['', 'none'], ['top', 'top'], ['bottom', 'bottom'],
    ['top-overlay', 'bottom'], ['middle-overlay', 'bottom'], ['bottom-overlay', 'bottom'],
  ])('%j → %s', (captionPosition, expected) => {
    expect(mailCaptionPosition({ captionPosition } as Partial<ImageStyle>)).toBe(expected);
  });
  it('offers the three that a mail has', () => {
    expect(MAIL_CAPTION_POSITIONS).toEqual(['none', 'top', 'bottom']);
  });
});

describe('mailPictureStyle', () => {
  it('is the style as a mail draws it: width and caption, nothing else of what is stored', () => {
    const stored = { width: '50%', captionPosition: 'top-overlay', height: '200px', fill: true, border: '4px solid red', borderRadius: '9px', imgIxParams: 'sat=-100', isThumbnail: true, action: ImageActionType.Zoom };
    expect(mailPictureStyle(stored as Partial<ImageStyle>)).toEqual({ ...IMAGE_STYLE_SHAPE, width: '50%', captionPosition: 'bottom', border: '', borderRadius: '0', action: ImageActionType.None });
  });
  it('a gallery has no width', () => {
    expect(mailPictureStyle({ width: '50%' }, 'gallery').width).toBe('100%');
  });
});

describe('mailToneOf', () => {
  it.each([['primary', 'primary'], ['secondary', 'primary'], ['tertiary', 'primary'], ['neutral', 'neutral'], ['x', 'neutral'], [undefined, 'neutral']])('%j → %s', (tone, expected) => {
    expect(mailToneOf(tone)).toBe(expected);
  });
});

describe('withMailLinks', () => {
  it('a picture with a link follows it in the Mitteilung', () => {
    expect(withMailLinks(img({ actionUrl: 'https://x.ch' }))).toMatchObject({ imageStyle: { action: ImageActionType.FollowLink } });
    expect(withMailLinks(img({ actionUrl: 'https://x.ch' }, { width: '50%', action: ImageActionType.Zoom }))).toMatchObject({ imageStyle: { width: '50%', action: ImageActionType.FollowLink } });
  });
  it('also a picture of a gallery', () => {
    const gallery = { id: 'g', type: 'gallery', images: [image(), image({ actionUrl: '/club' })] } as MailBlock;
    expect(withMailLinks(gallery)).toMatchObject({ imageStyle: { action: ImageActionType.FollowLink } });
  });
  it('without a link there is no action; an empty style goes', () => {
    expect(withMailLinks(img({}, { action: ImageActionType.FollowLink }))).toEqual(img());
    expect(withMailLinks(img({ actionUrl: '  ' }, { width: '50%', action: ImageActionType.Zoom }))).toEqual(img({ actionUrl: '  ' }, { width: '50%' }));
  });
  it('the same block when nothing changes, and for every other type', () => {
    for (const block of [img(), img({ actionUrl: '/x' }, { action: ImageActionType.FollowLink }), { id: 't', type: 'text', html: '' }, { id: 'e', type: 'events', calendarKey: '', maxEvents: 5 }] as MailBlock[]) expect(withMailLinks(block)).toBe(block);
  });
  it('does not throw on malformed blocks', () => {
    for (const block of [{ id: 'i', type: 'image' }, { id: 'i', type: 'image', image: 3, imageStyle: 'x' }, { id: 'g', type: 'gallery', images: [null, 3] }, { id: 'g', type: 'gallery', images: 'x' }]) expect(() => withMailLinks(block as unknown as MailBlock)).not.toThrow();
  });
});

describe('drawnMailBlock', () => {
  it('a hint has one of the two tones', () => {
    expect(drawnMailBlock({ id: 'c', type: 'callout', html: 'x', tone: 'tertiary' })).toEqual({ id: 'c', type: 'callout', html: 'x', tone: 'primary' });
  });
  it('a picture has the style of a mail', () => {
    expect(drawnMailBlock(img({}, { width: '50%', height: '9px' }))).toMatchObject({ imageStyle: { width: '50%', height: 'auto' } });
  });
  it('the same object for everything else, and each time for the same block', () => {
    const text: MailBlock = { id: 't', type: 'text', html: 'x' };
    expect(drawnMailBlock(text)).toBe(text);
    const picture = img({}, { width: '50%' });
    expect(drawnMailBlock(picture)).toBe(drawnMailBlock(picture));
  });
  it('does not throw on malformed blocks', () => {
    for (const block of [{ id: 'i', type: 'image', imageStyle: 3 }, { id: 'c', type: 'callout' }]) expect(() => drawnMailBlock(block as unknown as MailBlock)).not.toThrow();
  });
});

describe('mailEventsDrawn and eventsNote', () => {
  const line = (n: number) => ({ date: `0${n}.01.2026`, time: '', title: `T${n}`, place: '' });
  const block = (o: object = {}): MailBlock => ({ id: 'e', type: 'events', calendarKey: 'k', maxEvents: 2, ...o }) as MailBlock;

  it('as many lines as the block lists, of its calendar', () => {
    expect(mailEventsDrawn(block(), { k: [line(1), line(2), line(3)], o: [line(4)] }).map((l) => l.title)).toEqual(['T1', 'T2']);
    expect(mailEventsDrawn(block({ maxEvents: null }), { k: [line(1)] })).toHaveLength(1);
    expect(mailEventsDrawn(block({ calendarKey: 'x' }), { k: [line(1)] })).toEqual([]);
    expect(mailEventsDrawn(block({ calendarKey: ' k ' }), { k: [line(1)] })).toHaveLength(1);
    expect(mailEventsDrawn(block({ calendarKey: 'constructor' }), {})).toEqual([]);
  });
  it('what stands there instead', () => {
    expect(eventsNote(block({ calendarKey: '' }), {})).toBe('choose');
    expect(eventsNote(block({ calendarKey: undefined }), {})).toBe('choose');
    expect(eventsNote(block(), {})).toBe('later');
    expect(eventsNote(block(), { k: [] })).toBe('none');
    expect(eventsNote(block(), { k: [line(1)] })).toBeUndefined();
  });
});
