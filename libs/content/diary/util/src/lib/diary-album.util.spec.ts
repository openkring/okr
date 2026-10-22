import { AvatarInfo } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';
import { avatarTitle, decodeDiaryFilter, DiaryFilter, diaryAlbumId, diaryFilterLabel, diaryAlbumKeys, encodeDiaryFilter, eventSlug, inDiaryDateRange } from './diary-album.util';

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
});
