import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';

const getDocs = vi.hoisted(() => vi.fn());
const limit = vi.hoisted(() => vi.fn((n: number) => ({ limit: n })));

vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  collection: vi.fn(() => ({})),
  query: vi.fn((_c: unknown, ...constraints: unknown[]) => ({ constraints })),
  getDocs,
  limit,
}));

import { DiaryService } from './diary.service';

const snap = (...docs: { id: string; data: Record<string, unknown> }[]) => ({
  docs: docs.map(d => ({ id: d.id, data: () => d.data })),
});

describe('DiaryService.newestAlbumDate', () => {
  beforeEach(() => {
    getDocs.mockReset();
    limit.mockClear();
    TestBed.configureTestingModule({
      providers: [
        DiaryService,
        { provide: FirestoreService, useValue: { firestore: {} } },
        { provide: I18nService, useValue: { translateAll: () => ({}) } },
      ],
    });
  });

  it('returns the date of the first entry of the own tenant, skipping archived ones', async () => {
    getDocs.mockResolvedValue(snap(
      { id: 'a', data: { date: '20240901', tenants: ['bka'], isArchived: true } },
      { id: 'b', data: { date: '20240801', tenants: ['bka'] } },
    ));
    expect(await TestBed.inject(DiaryService).newestAlbumDate('u1', 'bka', 'event.x')).toBe('20240801');
    expect(limit).toHaveBeenCalledWith(5);
  });

  it('returns an empty string when only another tenant matches', async () => {
    getDocs.mockResolvedValue(snap({ id: 'a', data: { date: '20240901', tenants: ['other'] } }));
    expect(await TestBed.inject(DiaryService).newestAlbumDate('u1', 'bka', 'event.x')).toBe('');
  });

  it('returns an empty string without matches or without an author', async () => {
    getDocs.mockResolvedValue(snap());
    expect(await TestBed.inject(DiaryService).newestAlbumDate('u1', 'bka', 'event.x')).toBe('');
    expect(await TestBed.inject(DiaryService).newestAlbumDate('', 'bka', 'event.x')).toBe('');
  });
});
