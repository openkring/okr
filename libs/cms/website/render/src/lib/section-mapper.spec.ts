import { describe, expect, it } from 'vitest';

import { isColorBand, mapArticleColors, mapCalendarKey, mapSection, type SectionDoc, mapSlideshow, toImgixUrl } from './section-mapper';

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

describe('mapSection tiles, logos layout with linked title and background (SDG goals of a project)', () => {
  const sdg = (props: Record<string, unknown>) => map({ type: 'tiles', name: 'sdg', title: 'Ziele', properties: {
    variant: 'card', columns: 6, layout: 'logos',
    items: [{ title: '4 Hochwertige Bildung', url: 'https://www.un.org/sustainabledevelopment/education/', imageUrl: 'tenant/la21staefa/sdg/sdg04.svg', tone: 'primary' }],
    ...props,
  } });

  it('shows the pictures of a logos layout whatever variant is stored', () => {
    const out = sdg({});
    expect(out['layout']).toBe('logos');
    expect(out['variant']).toBe('image');
    expect((out['items'] as Record<string, unknown>[])[0]['imageSrc']).toContain('/tenant/la21staefa/sdg/sdg04.svg?');
  });

  it('maps a safe title link and a hex background', () => {
    const out = sdg({ titleUrl: 'https://unric.org/de/17ziele', background: ' #976C8B ' });
    expect(out['titleUrl']).toBe('https://unric.org/de/17ziele');
    expect(out['background']).toBe('#976C8B');
    expect(out['lightText']).toBe(true);
  });

  it('draws aubergine text on a light background (the lilac SDG band)', () => {
    expect(sdg({ background: '#E2D6E2' })['lightText']).toBe(false);
    expect(sdg({})['lightText']).toBe(false);
  });

  it('drops an unsafe title link and a background that is no hex colour', () => {
    const out = sdg({ titleUrl: 'javascript:alert(1)', background: 'red;position:fixed' });
    expect(out['titleUrl']).toBe('');
    expect(out['background']).toBe('');
  });

  it('keeps group cards in the grid even when logos is stored', () => {
    expect(sdg({ source: 'groups' })['layout']).toBe('grid');
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

describe('isColorBand', () => {
  it('is an article with emphasis banner and its own background', () => {
    expect(isColorBand({ type: 'article', emphasis: 'banner', background: '#7B85BE' })).toBe(true);
    expect(isColorBand({ type: 'article', emphasis: 'none', background: '#7B85BE' })).toBe(false);
    expect(isColorBand({ type: 'article', emphasis: 'banner', background: '' })).toBe(false);
    expect(isColorBand({ type: 'hero', emphasis: 'banner', background: '#7B85BE' })).toBe(false);
    expect(isColorBand(undefined)).toBe(false);
  });
});

describe('mapSlideshow', () => {
  const imgs = [{ url: 'tenant/la21staefa/hero/a.jpg', altText: 'A' }, { url: 'tenant/la21staefa/hero/b.jpg' }];

  it('maps the la21staefa header with wide imgix crops', () => {
    const show = mapSlideshow({ effect: 'fade', autoplay: true, interval: 3, duration: 1 }, undefined, imgs);
    expect(show).toMatchObject({ effect: 'fade', autoplay: true, interval: 3, duration: 1 });
    expect(show?.slides[0]).toEqual({ url: 'https://bkaiser.imgix.net/tenant/la21staefa/hero/a.jpg?w=1600&h=600&fit=crop&auto=format,compress', alt: 'A' });
  });

  it('keeps the swipe slider for none, a grid layout or no image', () => {
    expect(mapSlideshow({ effect: 'none' }, undefined, imgs)).toBeUndefined();
    expect(mapSlideshow({ effect: 'fade' }, 'mosaic', imgs)).toBeUndefined();
    expect(mapSlideshow({ effect: 'fade' }, undefined, [])).toBeUndefined();
    expect(mapSlideshow(undefined, undefined, imgs)).toBeUndefined();
  });

  it('makes a single image a still header picture (one slide)', () => {
    expect(mapSlideshow({ effect: 'fade' }, 'slider', imgs.slice(0, 1))?.slides).toHaveLength(1);
  });

  it('clamps times and drops unsafe image paths', () => {
    const show = mapSlideshow({ effect: 'zoom', interval: 99, duration: 0 }, 'slider', [...imgs, { url: '../x' }]);
    expect(show).toMatchObject({ interval: 30, duration: 0.2 });
    expect(show?.slides).toHaveLength(2);
  });
});

describe('article layout side-by-side (whole images in a row, caption below)', () => {
  const qr = (n: string) => ({ url: `tenant/la21staefa/page/p/${n}.webp`, altText: n, overlay: `QR-Code ${n}`, label: '' });
  const article = (images: unknown[], position = 1, extra: Record<string, unknown> = {}): SectionDoc => ({
    type: 'article', title: 'Spende', content: { htmlContent: '', position },
    properties: { images, imageLayout: 'side-by-side', imageStyle: { captionPosition: 'none' }, ...extra },
  });

  it('renders a row with every image and its own caption below, centred, even when the style hides captions', () => {
    const out = map(article([qr('TWINT'), qr('PostFinance')]));
    expect(out['imageRow']).toBe(true);
    expect(out['imagePosition']).toBe('top');
    const imgs = out['images'] as { caption: string; captionPosition: string; captionCss: { textAlign: string } }[];
    expect(imgs.map(i => i.caption)).toEqual(['QR-Code TWINT', 'QR-Code PostFinance']);
    expect(imgs.every(i => i.captionPosition === 'bottom' && i.captionCss.textAlign === 'center')).toBe(true);
    expect(out['slideshow']).toBeUndefined();
  });

  it('keeps the natural size, or a fixed px height as a square (the 150 px QR codes)', () => {
    expect(map(article([qr('TWINT')]))['imageHeight']).toBe(0);
    const out = map(article([qr('TWINT'), qr('PostFinance')], 1, { imageStyle: { width: '150px', height: '150px' } }));
    expect(out['imageRow']).toBe(true);
    expect(out['imageHeight']).toBe(150);
  });

  it('applies to a single image and ignores left/right', () => {
    const out = map(article([qr('TWINT')], 4));
    expect(out['imageRow']).toBe(true);
    expect(out['imagePosition']).toBe('top');
  });

  it('puts the row below the text when position is bottom', () => {
    expect(map(article([qr('a'), qr('b')], 2))['imagePosition']).toBe('bottom');
  });

  it('never falls back to the section title as caption', () => {
    const out = map(article([{ url: 'x/a.webp', altText: 'a' }]));
    expect((out['images'] as { caption: string }[])[0].caption).toBe('');
  });

  it('other layouts keep the old rendering', () => {
    const out = map(article([qr('a'), qr('b')], 1, { imageLayout: 'pair' }));
    expect(out['imageRow']).toBeUndefined();
  });
});

describe('article layout stacked (Untereinander: whole images one below the other)', () => {
  const pic = (n: string) => ({ url: `tenant/scs/section/s/${n}.jpg`, altText: n, overlay: `Bild ${n}`, label: '' });
  const article = (images: unknown[], position = 1, extra: Record<string, unknown> = {}): SectionDoc => ({
    type: 'article', title: 'Regatta', content: { htmlContent: '<p>x</p>', position },
    properties: { images, imageLayout: 'stacked', ...extra },
  });

  it('renders every image in a column above the text, no slider, no slideshow', () => {
    const out = map(article([pic('a'), pic('b'), pic('c')], 1, { slideshow: { effect: 'fade' } }));
    expect(out['imageColumn']).toBe(true);
    expect(out['imageRow']).toBeUndefined();
    expect(out['imagePosition']).toBe('top');
    expect(out['imageHeight']).toBe(0);
    expect((out['images'] as unknown[]).length).toBe(3);
    expect(out['slideshow']).toBeUndefined();
    expect(out['title']).toBe('Regatta');
  });

  it('puts the column below the text when position is bottom, and top for left/right', () => {
    expect(map(article([pic('a'), pic('b')], 2))['imagePosition']).toBe('bottom');
    expect(map(article([pic('a'), pic('b')], 4))['imagePosition']).toBe('top');
  });

  it('a single image keeps its own position (stacked needs two or more)', () => {
    const out = map(article([pic('a')], 4));
    expect(out['imageColumn']).toBeUndefined();
    expect(out['imagePosition']).toBe('right');
  });
});

describe('toImgixUrl', () => {
  it('keeps transparency for png/webp/gif/avif sources', () => {
    expect(toImgixUrl('a/logo.webp')).toBe('https://bkaiser.imgix.net/a/logo.webp?auto=format,compress');
    expect(toImgixUrl('a/logo.PNG')).toBe('https://bkaiser.imgix.net/a/logo.PNG?auto=format,compress');
  });

  it('serves photos as jpg', () => {
    expect(toImgixUrl('a/photo.jpeg')).toBe('https://bkaiser.imgix.net/a/photo.jpeg?auto=compress,format=jpg');
  });

  it('passes urls through and empty stays empty', () => {
    expect(toImgixUrl('https://x.y/z.png')).toBe('https://x.y/z.png');
    expect(toImgixUrl('')).toBe('');
  });
});

describe('mapArticleColors', () => {
  it('has no background without a valid hex value', () => {
    expect(mapArticleColors({})).toEqual({ background: '', lightText: false });
    expect(mapArticleColors({ background: 'red;x:y', textColor: 'light' })).toEqual({ background: '', lightText: false });
  });

  it('chooses the text colour from the brightness when auto or absent', () => {
    expect(mapArticleColors({ background: '#3c163c' })).toEqual({ background: '#3c163c', lightText: true });
    expect(mapArticleColors({ background: '#59A4BF', textColor: 'auto' })).toEqual({ background: '#59A4BF', lightText: false });
  });

  it('lets an explicit text colour win', () => {
    expect(mapArticleColors({ background: '#59A4BF', textColor: 'light' })).toEqual({ background: '#59A4BF', lightText: true });
    expect(mapArticleColors({ background: '#3c163c', textColor: 'dark' })).toEqual({ background: '#3c163c', lightText: false });
  });

  it('reaches the public article', () => {
    const doc = { type: 'article', name: 'kiss', title: 'T', properties: { background: '#59A4BF', textColor: 'light', images: [] } } as unknown as SectionDoc;
    expect(map(doc)).toMatchObject({ type: 'article', background: '#59A4BF', lightText: true });
  });
});
