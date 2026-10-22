import { AvatarInfo } from '@okr/shared-models';
import { parseJassDiaryLine } from './diary-jass.util';
import { describe, expect, it } from 'vitest';
import { avatarTitle, canApplyDiaryDateRange, decodeDiaryFilter, diaryListUrl, DiaryFilter, diaryAlbumId, diaryFilterLabel, mergeDiaryDateRange, diaryAlbumKeys, encodeDiaryFilter, eventSlug, inDiaryDateRange, tripMapPoints } from './diary-album.util';

describe('diary album utils', () => {
  it('derives sorted, de-duplicated keys', () => {
    expect(
      diaryAlbumKeys({
        people: [{ key: 'p1' } as AvatarInfo, { key: 'p1' } as AvatarInfo, { key: '' } as AvatarInfo],
        location: { key: 'l1' } as AvatarInfo,
        events: ['anrudern'],
        tags: 'Familie, Segeln,',
      })
    ).toEqual(['event.anrudern', 'location.l1', 'person.p1', 'tag.Familie', 'tag.Segeln']);
  });

  it('survives a legacy doc without any of the fields', () => {
    expect(diaryAlbumKeys({})).toEqual([]);
  });

  it('builds the deterministic album id', () => {
    expect(diaryAlbumId('bka', 'u1', 'event', 'anrudern')).toBe('bka__u1__event__anrudern');
  });

  it('slugs a title like the archive (camelCase, umlauts transliterated)', () => {
    expect(eventSlug('Zürich Fäscht 2024!')).toBe('zuerichFaescht2024');
    expect(eventSlug('  Club-Regatta ')).toBe('clubRegatta');
    expect(eventSlug('Ostern')).toBe('ostern');
  });

  it('treats empty bounds as open and keeps aggregates inside the range', () => {
    expect(inDiaryDateRange('20041000', '20040101', '20041231')).toBe(true);
    expect(inDiaryDateRange('19900000', '19900000', '')).toBe(true);
    expect(inDiaryDateRange('20050101', '', '20041231')).toBe(false);
    expect(inDiaryDateRange('20050101', '', '')).toBe(true);
  });

  it('keeps an aggregate inside a range that starts on the first of its month or year', () => {
    expect(inDiaryDateRange('20041000', '20041001', '20041031')).toBe(true);
    expect(inDiaryDateRange('20041000', '20041001', '20041015')).toBe(true);
    expect(inDiaryDateRange('19900000', '19900101', '19901231')).toBe(true);
    expect(inDiaryDateRange('19900000', '19900101', '19900131')).toBe(true);
    // the period starts before the range: not inside
    expect(inDiaryDateRange('20041000', '20041002', '20041031')).toBe(false);
    expect(inDiaryDateRange('20041000', '20040901', '20040930')).toBe(false);
  });

  describe('diaryAlbumKeys with Jass lines', () => {
    const JASS = 'Jass Schieber: Anna & Clara 2530 : Beat & Dora 1870 · Gewonnen: Anna & Clara · Weis (mit Stöck) 340 : 120 · Match 3 : 0 · 12 Runden · 1 h 25 min';
    it('skips a Jass line but keeps the real event', () => {
      expect(parseJassDiaryLine(JASS)).toBeDefined();
      expect(diaryAlbumKeys({ events: [JASS, 'anrudern'] })).toEqual(['event.anrudern']);
    });
    it('a Jass line alone yields no key', () => {
      expect(diaryAlbumKeys({ events: [JASS] })).toEqual([]);
    });
  });

  describe('diaryListUrl', () => {
    it('leaves a plain listId readable', () =>
      expect(diaryListUrl('person.p1', 'c-diary')).toBe('/diary/person.p1/c-diary'));
    it('encodes a tag so slashes, spaces and ? stay inside the one segment', () => {
      const url = diaryListUrl('tag.Segeln/Regatta ?2024#1', 'c-diary');
      expect(url).toBe('/diary/tag.Segeln%2FRegatta%20%3F2024%231/c-diary');
      // the router hands the segment back decoded, so the listId round-trips
      expect(decodeURIComponent(url.split('/')[2])).toBe('tag.Segeln/Regatta ?2024#1');
    });
  });

  describe('canApplyDiaryDateRange', () => {
    it('needs both bounds for a plain date filter', () => {
      expect(canApplyDiaryDateRange('20150101', '20191231', false)).toBe(true);
      expect(canApplyDiaryDateRange('20150101', '', false)).toBe(false);
      expect(canApplyDiaryDateRange('', '20191231', false)).toBe(false);
      expect(canApplyDiaryDateRange('', '', false)).toBe(false);
    });
    it('allows an open end or no range while an album is active', () => {
      expect(canApplyDiaryDateRange('20150101', '', true)).toBe(true);
      expect(canApplyDiaryDateRange('', '20191231', true)).toBe(true);
      expect(canApplyDiaryDateRange('', '', true)).toBe(true);
      expect(canApplyDiaryDateRange('20150101', '20191231', true)).toBe(true);
    });
  });

  it('round-trips a filter through the listId', () => {
    const f: DiaryFilter = { kind: 'person', key: 'person.p1', title: 'x', from: '', to: '' };
    expect(decodeDiaryFilter(encodeDiaryFilter(f))).toEqual({ kind: 'person', key: 'person.p1' });
    expect(decodeDiaryFilter(encodeDiaryFilter({ ...f, kind: 'trip', key: 'bka__travel__x' }))).toEqual({ kind: 'trip', key: 'bka__travel__x' });
    expect(decodeDiaryFilter('all')).toBeUndefined();
  });
});

describe('avatarTitle', () => {
  it('joins first and last name', () =>
    expect(avatarTitle({ name1: 'Anna', name2: 'Muster', label: 'x' } as AvatarInfo)).toBe('Anna Muster'));
  it('falls back to the label', () =>
    expect(avatarTitle({ name1: '', name2: '', label: 'Luzern' } as AvatarInfo)).toBe('Luzern'));

  describe('diaryFilterLabel', () => {
    const fmt = (d: string) => `${d.slice(6, 8)}.${d.slice(4, 6)}.${d.slice(0, 4)}`;
    const words = { from: 'ab', to: 'bis' };
    const filter = (f: Partial<DiaryFilter>): DiaryFilter => ({ kind: 'person', key: 'person.p1', title: '', from: '', to: '', ...f });

    it('joins title and closed range', () =>
      expect(diaryFilterLabel(filter({ title: 'Anna', from: '20150101', to: '20191231' }), fmt, words))
        .toBe('Anna · 01.01.2015–31.12.2019'));
    it('shows only the title without a range', () =>
      expect(diaryFilterLabel(filter({ title: 'Anna' }), fmt, words)).toBe('Anna'));
    it('shows just the range for a date filter', () =>
      expect(diaryFilterLabel(filter({ kind: 'date', key: '', from: '20150101', to: '20191231' }), fmt, words))
        .toBe('01.01.2015–31.12.2019'));
    it('uses «ab» for an open end', () =>
      expect(diaryFilterLabel(filter({ kind: 'date', key: '', from: '20150101' }), fmt, words)).toBe('ab 01.01.2015'));
    it('uses «bis» for an open start', () =>
      expect(diaryFilterLabel(filter({ kind: 'date', key: '', to: '20191231' }), fmt, words)).toBe('bis 31.12.2019'));
    it('appends an open-ended range to the title', () =>
      expect(diaryFilterLabel(filter({ title: 'Anna', from: '20150101' }), fmt, words)).toBe('Anna · ab 01.01.2015'));
  });

  describe('mergeDiaryDateRange', () => {
    const anna: DiaryFilter = { kind: 'person', key: 'person.p1', title: 'Anna', from: '', to: '' };

    it('is a pure date filter without a current filter', () =>
      expect(mergeDiaryDateRange(undefined, '20150101', '20191231'))
        .toEqual({ kind: 'date', key: '', title: '', from: '20150101', to: '20191231' }));
    it('replaces a current date filter', () =>
      expect(mergeDiaryDateRange({ kind: 'date', key: '', title: '', from: '2000', to: '' }, '20150101', ''))
        .toEqual({ kind: 'date', key: '', title: '', from: '20150101', to: '' }));
    it('narrows the current album', () =>
      expect(mergeDiaryDateRange(anna, '20150101', '20191231'))
        .toEqual({ ...anna, from: '20150101', to: '20191231' }));
    it('drops the range but keeps the album on an empty range', () =>
      expect(mergeDiaryDateRange({ ...anna, from: '20150101', to: '20191231' }, '', '')).toEqual(anna));
  });
});

describe('tripMapPoints', () => {
  it('sorts the dated points by date ascending', () => {
    const points = tripMapPoints([
      { date: '20240503', okey: 'd3', title: 'Drei', lat: 3, lng: 30 },
      { date: '20240501', okey: 'd1', title: 'Eins', lat: 1, lng: 10 },
      { date: '20240502', okey: 'd2', title: 'Zwei', lat: 2, lng: 20 },
    ], []);
    expect(points.map(p => p.diaryKey)).toEqual(['d1', 'd2', 'd3']);
    expect(points[0]).toEqual({ lat: 1, lng: 10, title: 'Eins', date: '20240501', diaryKey: 'd1' });
  });

  it('drops entries without coordinates', () => {
    const points = tripMapPoints([
      { date: '20240501', okey: 'd1', title: 'Eins' },
      { date: '20240502', okey: 'd2', title: 'Zwei', lat: 2 },
      { date: '20240503', okey: 'd3', title: 'Drei', lat: 3, lng: 30 },
      { date: '20240504', okey: 'd4', title: 'Vier', lat: Number.NaN, lng: 40 },
    ], []);
    expect(points.map(p => p.diaryKey)).toEqual(['d3']);
  });

  it('appends the trip-own locations after the dated points, with an empty date and key', () => {
    const points = tripMapPoints(
      [{ date: '20240501', okey: 'd1', title: 'Eins', lat: 1, lng: 10 }],
      [{ lat: 9, lng: 90, title: 'Hafen' }],
    );
    expect(points).toEqual([
      { lat: 1, lng: 10, title: 'Eins', date: '20240501', diaryKey: 'd1' },
      { lat: 9, lng: 90, title: 'Hafen', date: '', diaryKey: '', inRoute: false },
    ]);
  });

  it('keeps the trip-own locations out of the route line', () => {
    const points = tripMapPoints(
      [{ date: '20240501', okey: 'd1', title: 'Eins', lat: 1, lng: 10 }],
      [{ lat: 9, lng: 90, title: 'Hafen' }],
    );
    expect(points.map(p => p.inRoute !== false)).toEqual([true, false]);
  });

  it('returns [] without entries and own locations', () => {
    expect(tripMapPoints([], [])).toEqual([]);
  });
});
