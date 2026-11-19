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
