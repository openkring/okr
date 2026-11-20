import { describe, expect, it } from 'vitest';

import { mapCalendarKey, mapSection, type SectionDoc, mapSlideshow } from './section-mapper';

const sanitize = (html: string) => html;
const map = (s: SectionDoc) => mapSection('sec1', s, new Map(), sanitize) as Record<string, unknown>;

describe('mapCalendarKey (events section name = calendar key, spec 1.165 EV3)', () => {
  it('keeps an explicit calendar key', () => {
    expect(mapCalendarKey('reparatur')).toBe('reparatur');
  });

  it.each(['', 'all', 'my', 'public', '  ', undefined])('maps %j to all public events', raw => {
    expect(mapCalendarKey(raw)).toBe('');
  });

  it('trims the key', () => {
    expect(mapCalendarKey('  kiss ')).toBe('kiss');
  });

  it('drops a key with characters a calendar key never has', () => {
    expect(mapCalendarKey('a"b<c')).toBe('');
  });
});

describe('mapSection events / news', () => {
  it('maps the events section name to its calendar', () => {
    const out = map({ type: 'events', name: 'reparatur', properties: { maxEvents: 5 } });
    expect(out['calendar']).toBe('reparatur');
    expect(out['maxItems']).toBe(5);
  });

  it('shows all public events for the all calendar', () => {
    expect(map({ type: 'events', name: 'all' })['calendar']).toBe('');
  });

  it('maps the news tag', () => {
    expect(map({ type: 'news', name: 'news', properties: { tag: 'kiss' } })['tag']).toBe('kiss');
  });

  it('maps a missing news tag to empty', () => {
    expect(map({ type: 'news', name: 'news' })['tag']).toBe('');
  });
});

describe('mapSection tiles, image variant (spec 1.165 §10.1)', () => {
  const tiles = (items: unknown[], variant = 'image') => map({ type: 'tiles', name: 'gruppen', properties: { variant, columns: 3, items } });

  it('keeps the image variant', () => {
    expect(tiles([{ title: 'Reparatur Café', tone: 'primary' }])['variant']).toBe('image');
  });

  it('maps an unknown variant to stat', () => {
    expect(tiles([{ value: '12', tone: 'primary' }], 'fancy')['variant']).toBe('stat');
  });

  it('builds an imgix url for a stored image path, cropped for cover', () => {
    const [t] = tiles([{ title: 'SMäRT', imageUrl: 'tenant/la21staefa/groups/smaert.jpg', tone: 'primary' }])['items'] as Record<string, unknown>[];
    expect(t['imageSrc']).toBe('https://bkaiser.imgix.net/tenant/la21staefa/groups/smaert.jpg?w=640&h=480&fit=crop&auto=format,compress');
    expect(t['imageFit']).toBe('cover');
  });

  it('keeps the whole logo for contain', () => {
    const [t] = tiles([{ title: 'KISS', imageUrl: 'tenant/la21staefa/logo/kiss.png', imageFit: 'contain', tone: 'primary' }])['items'] as Record<string, unknown>[];
    expect(t['imageSrc']).toBe('https://bkaiser.imgix.net/tenant/la21staefa/logo/kiss.png?w=640&h=480&fit=max&auto=format,compress');
    expect(t['imageFit']).toBe('contain');
  });

  it('keeps a tile without image and still shows its title', () => {
    const [t] = tiles([{ title: 'Gut Wohnen', text: 'Wohnraum für alle', tone: 'primary' }])['items'] as Record<string, unknown>[];
    expect(t['imageSrc']).toBe('');
    expect(t['title']).toBe('Gut Wohnen');
  });

  it('drops an image url that is not a storage path or https', () => {
    const [t] = tiles([{ title: 'X', imageUrl: 'javascript:alert(1)', tone: 'primary' }])['items'] as Record<string, unknown>[];
    expect(t['imageSrc']).toBe('');
  });

  it('ignores the image on a card tile', () => {
    const [t] = tiles([{ title: 'X', imageUrl: 'tenant/x.jpg', tone: 'primary' }], 'card')['items'] as Record<string, unknown>[];
    expect(t['imageSrc']).toBe('');
  });
});

describe('mapSection map (spec 1.165 §10.2)', () => {
  it('maps the centre, zoom and the subtitle as label', () => {
    const out = map({ type: 'map', name: 'ort', title: 'So findest du uns', subTitle: 'Goethestrasse 14, 8712 Stäfa',
      properties: { centerLatitude: 47.2412, centerLongitude: 8.7236, zoom: 17, useCurrentLocationAsCenter: false } });
    expect(out).toMatchObject({ type: 'map', title: 'So findest du uns', lat: 47.2412, lng: 8.7236, zoom: 17, label: 'Goethestrasse 14, 8712 Stäfa' });
  });

  it('clamps the zoom to 1–19 and defaults it to 16', () => {
    const base = { type: 'map', name: 'ort', properties: { centerLatitude: 47, centerLongitude: 8 } };
    expect(map({ ...base, properties: { ...base.properties, zoom: 25 } })['zoom']).toBe(19);
    expect(map(base)['zoom']).toBe(16);
  });

  it('marks a map without usable coordinates, so the template draws nothing', () => {
    expect(map({ type: 'map', name: 'x', properties: { centerLatitude: 'abc', centerLongitude: 8 } })['hasPosition']).toBe(false);
    expect(map({ type: 'map', name: 'x', properties: { centerLatitude: 95, centerLongitude: 8 } })['hasPosition']).toBe(false);
  });

  it('marks a usable map', () => {
    expect(map({ type: 'map', name: 'x', properties: { centerLatitude: 47.2, centerLongitude: 8.7 } })['hasPosition']).toBe(true);
  });
});

describe('mapSection video embeds without cookies (spec 1.165 §12)', () => {
  it('serves a youtube id from youtube-nocookie', () => {
    expect(map({ type: 'video', name: 'v', properties: { url: 'XSu0f8rh2w4' } })['url']).toBe('https://www.youtube-nocookie.com/embed/XSu0f8rh2w4');
  });

  it('rewrites a full youtube embed url to youtube-nocookie', () => {
    expect(map({ type: 'video', name: 'v', properties: { url: 'https://www.youtube.com/embed/XSu0f8rh2w4?feature=oembed' } })['url'])
      .toBe('https://www.youtube-nocookie.com/embed/XSu0f8rh2w4?feature=oembed');
  });

  it('leaves another provider alone', () => {
    expect(map({ type: 'video', name: 'v', properties: { url: 'https://player.vimeo.com/video/1' } })['url']).toBe('https://player.vimeo.com/video/1');
  });
});

describe('mapSlideshow', () => {
  const imgs = [{ url: 'tenant/la21staefa/hero/a.jpg', altText: 'A' }, { url: 'tenant/la21staefa/hero/b.jpg' }];

  it('maps the la21staefa header with wide imgix crops', () => {
    const show = mapSlideshow({ effect: 'fade', autoplay: true, interval: 3, duration: 1 }, undefined, imgs);
    expect(show).toMatchObject({ effect: 'fade', autoplay: true, interval: 3, duration: 1 });
    expect(show?.slides[0]).toEqual({ url: 'https://bkaiser.imgix.net/tenant/la21staefa/hero/a.jpg?w=1600&h=600&fit=crop&auto=format,compress', alt: 'A' });
  });

  it('keeps the swipe slider for none, a grid layout or a single image', () => {
    expect(mapSlideshow({ effect: 'none' }, undefined, imgs)).toBeUndefined();
    expect(mapSlideshow({ effect: 'fade' }, 'mosaic', imgs)).toBeUndefined();
    expect(mapSlideshow({ effect: 'fade' }, undefined, imgs.slice(0, 1))).toBeUndefined();
    expect(mapSlideshow(undefined, undefined, imgs)).toBeUndefined();
  });

  it('clamps times and drops unsafe image paths', () => {
    const show = mapSlideshow({ effect: 'zoom', interval: 99, duration: 0 }, 'slider', [...imgs, { url: '../x' }]);
    expect(show).toMatchObject({ interval: 30, duration: 0.2 });
    expect(show?.slides).toHaveLength(2);
  });
});
