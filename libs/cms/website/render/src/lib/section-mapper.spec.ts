import { describe, expect, it } from 'vitest';

import { mapCalendarKey, mapSection, type SectionDoc } from './section-mapper';

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
