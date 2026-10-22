import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { DiaryModel, TripModel } from '@okr/shared-models';
import { buildDiaryRangeTree, diaryAlbumKeys, diaryRangeOfYear } from '@okr/content-diary-util';

import { DiaryService } from './diary.service';

describe('DiaryService.listByRange', () => {
  const searchData = vi.fn().mockReturnValue(of([] as DiaryModel[]));

  beforeEach(() => {
    searchData.mockClear();
    TestBed.configureTestingModule({
      providers: [
        DiaryService,
        { provide: FirestoreService, useValue: { searchData } },
        { provide: I18nService, useValue: { translateAll: () => ({ update_conf: () => '', update_error: () => '', create_conf: () => '', create_error: () => '', delete_conf: () => '', delete_error: () => '' }) } },
      ],
    });
  });

  it('mirrors the read rule: authorKey AND tenants, plus the year bounds', () => {
    TestBed.inject(DiaryService).listByRange('u1', 'bka', diaryRangeOfYear(1990)).subscribe();
    const [, query] = searchData.mock.calls[0];
    expect(query).toEqual(expect.arrayContaining([
      { key: 'authorKey', operator: '==', value: 'u1' },
      { key: 'tenants', operator: 'array-contains', value: 'bka' },
      { key: 'date', operator: '>=', value: '19900000' },
      { key: 'date', operator: '<=', value: '19901231' },
    ]));
  });

  it('spans a whole decade', () => {
    const decade = buildDiaryRangeTree(1930, 2026)[1].children.find(n => n.range.label === '198x')!.range;
    TestBed.inject(DiaryService).listByRange('u1', 'bka', decade).subscribe();
    const [, query] = searchData.mock.calls[0];
    expect(query).toEqual(expect.arrayContaining([
      { key: 'date', operator: '>=', value: '19800000' },
      { key: 'date', operator: '<=', value: '19891231' },
    ]));
  });

  it('without a range keeps exactly the two rule constraints', () => {
    TestBed.inject(DiaryService).listByRange('u1', 'bka').subscribe();
    const [, query] = searchData.mock.calls[0];
    expect(query).toHaveLength(2);
  });

  it('returns an empty stream for an empty uid without querying', () => {
    TestBed.inject(DiaryService).listByRange('', 'bka', diaryRangeOfYear(2026)).subscribe();
    expect(searchData).not.toHaveBeenCalled();
  });
});

describe('DiaryService album queries and writes', () => {
  const searchData = vi.fn();
  const createModel = vi.fn().mockResolvedValue('k');
  const updateModel = vi.fn().mockResolvedValue('k');

  const entry = (okey: string, date: string, extra: Partial<DiaryModel> = {}): DiaryModel =>
    ({ ...new DiaryModel('bka'), okey, date, authorKey: 'u1', ...extra }) as DiaryModel;

  beforeEach(() => {
    searchData.mockReset();
    createModel.mockClear();
    updateModel.mockClear();
    TestBed.configureTestingModule({
      providers: [
        DiaryService,
        { provide: FirestoreService, useValue: { searchData, createModel, updateModel } },
        // each key resolves to its own name, so a test can tell which wording a toast uses
        { provide: I18nService, useValue: { translateAll: (keys: Record<string, string>) => Object.fromEntries(Object.keys(keys).map(k => [k, () => k])) } },
      ],
    });
  });

  it('listByAlbum sends authorKey + albumKeys only, orders by date desc, drops other tenants and archived', async () => {
    searchData.mockReturnValue(of([
      entry('d', '20240401'),
      entry('b', '20240301', { tenants: ['other'] }),
      entry('c', '20240201', { isArchived: true }),
      entry('a', '20240101'),
    ]));
    const result = await firstValueFrom(TestBed.inject(DiaryService).listByAlbum('u1', 'bka', 'person.p1'));
    const [collectionName, query, orderBy, sort] = searchData.mock.calls[0];
    expect(collectionName).toBe('diaries');
    expect(query).toEqual([
      { key: 'authorKey', operator: '==', value: 'u1' },
      { key: 'albumKeys', operator: 'array-contains', value: 'person.p1' },
    ]);
    expect(orderBy).toBe('date');
    expect(sort).toBe('desc');
    expect(result.map(d => d.okey)).toEqual(['d', 'a']);
  });

  it('listByAlbum returns an empty stream without an author', async () => {
    expect(await firstValueFrom(TestBed.inject(DiaryService).listByAlbum('', 'bka', 'person.p1'))).toEqual([]);
    expect(searchData).not.toHaveBeenCalled();
  });

  it('create writes albumKeys derived from the entry', async () => {
    const diary = entry('k', '20240101', { tags: 'a, b', events: ['anrudern'] });
    await TestBed.inject(DiaryService).create(diary);
    const written = createModel.mock.calls[0][1] as DiaryModel;
    expect(written.albumKeys).toEqual(diaryAlbumKeys(diary));
    expect(written.albumKeys).toEqual(['event.anrudern', 'tag.a', 'tag.b']);
  });

  it('create tolerates an entry without tags', async () => {
    const diary = entry('k', '20240101');
    (diary as { tags?: string }).tags = undefined;
    await TestBed.inject(DiaryService).create(diary);
    expect((createModel.mock.calls[0][1] as DiaryModel).albumKeys).toEqual([]);
  });

  it('update writes albumKeys too', async () => {
    await TestBed.inject(DiaryService).update(entry('k', '20240101', { events: ['x'] }));
    expect((updateModel.mock.calls[0][1] as DiaryModel).albumKeys).toEqual(['event.x']);
  });

  it('listByTrip merges tripKey hits and untagged in-span entries, de-duplicated; a different tripKey is excluded', async () => {
    const trip = { ...new TripModel('bka'), okey: 't1', startDate: '20240101', endDate: '20240110' } as TripModel;
    searchData.mockImplementation((_c: string, q: { key: string; value: string }[]) => {
      const byTrip = q.some(c => c.key === 'tripKey');
      return of(byTrip
        ? [entry('x', '20240105', { tripKey: 't1' }), entry('y', '20240103', { tripKey: 't1' })]
        : [entry('x', '20240105', { tripKey: 't1' }), entry('z', '20240107'), entry('w', '20240108', { tripKey: 'other' })]);
    });
    const result = await firstValueFrom(TestBed.inject(DiaryService).listByTrip('u1', 'bka', trip));
    expect(result.map(d => d.okey)).toEqual(['z', 'x', 'y']);
    const tripQuery = searchData.mock.calls.map(c => c[1]).find((q: { key: string }[]) => q.some(c => c.key === 'tripKey'));
    expect(tripQuery).toEqual(expect.arrayContaining([
      { key: 'authorKey', operator: '==', value: 'u1' },
      { key: 'tenants', operator: 'array-contains', value: 'bka' },
      { key: 'tripKey', operator: '==', value: 't1' },
    ]));
  });

  it('listByDateRange mirrors the owner query plus open or closed bounds', () => {
    searchData.mockReturnValue(of([]));
    TestBed.inject(DiaryService).listByDateRange('u1', 'bka', '20240101', '').subscribe();
    const [, query] = searchData.mock.calls[0];
    expect(query).toEqual(expect.arrayContaining([
      { key: 'authorKey', operator: '==', value: 'u1' },
      { key: 'tenants', operator: 'array-contains', value: 'bka' },
      { key: 'date', operator: '>=', value: '20240101' },
    ]));
    expect(query.some((c: { operator: string }) => c.operator === '<=')).toBe(false);
  });

  it('listByDateRange with both bounds open does not query', async () => {
    expect(await firstValueFrom(TestBed.inject(DiaryService).listByDateRange('u1', 'bka', '', ''))).toEqual([]);
    expect(searchData).not.toHaveBeenCalled();
  });

  it('listByTrip without dates skips the span query', async () => {
    const trip = { ...new TripModel('bka'), okey: 't1', startDate: '', endDate: '' } as TripModel;
    searchData.mockReturnValue(of([entry('x', '20240105', { tripKey: 't1' })]));
    const result = await firstValueFrom(TestBed.inject(DiaryService).listByTrip('u1', 'bka', trip));
    expect(result.map(d => d.okey)).toEqual(['x']);
    expect(searchData).toHaveBeenCalledTimes(1);
    expect(searchData.mock.calls[0][1]).toEqual(expect.arrayContaining([{ key: 'tripKey', operator: '==', value: 't1' }]));
  });

  it('createTravelTrip forces type travel', async () => {
    const trip = { ...new TripModel('bka'), type: 'logbuch' } as TripModel;
    await TestBed.inject(DiaryService).createTravelTrip(trip);
    expect((createModel.mock.calls[0][1] as TripModel).type).toBe('travel');
    await TestBed.inject(DiaryService).updateTravelTrip(trip);
    expect((updateModel.mock.calls[0][1] as TripModel).type).toBe('travel');
  });

  it('toasts trip wording, not the diary entry wording', async () => {
    const trip = { ...new TripModel('bka') } as TripModel;
    await TestBed.inject(DiaryService).createTravelTrip(trip);
    expect(createModel.mock.calls[0].slice(2, 4)).toEqual(['trip_create_conf', 'trip_create_error']);
    await TestBed.inject(DiaryService).updateTravelTrip(trip);
    expect(updateModel.mock.calls[0].slice(3, 5)).toEqual(['trip_update_conf', 'trip_update_error']);
  });
});
