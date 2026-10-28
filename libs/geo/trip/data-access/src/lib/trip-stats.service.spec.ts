import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of } from 'rxjs';
import { firstValueFrom } from 'rxjs';

// Mock Angular's inject before importing the service
vi.mock('@angular/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/core')>();
  return {
    ...actual,
    inject: vi.fn(),
  };
});

// Minimal mock for FirestoreService
const mockReadObject = vi.fn();
const mockSearchData = vi.fn();
vi.mock('@okr/shared-data-access', () => ({
  FirestoreService: class {
    readObject = mockReadObject;
    searchData = mockSearchData;
  },
}));

import { inject } from '@angular/core';
import { TripStatsService, YearStats } from './trip-stats.service';
import { FirestoreService } from '@okr/shared-data-access';
import { ENV } from '@okr/shared-config';

describe('TripStatsService', () => {
  let service: TripStatsService;
  const mockFirestoreService = {
    readObject: mockReadObject,
    searchData: mockSearchData,
  };

  beforeEach(() => {
    mockReadObject.mockReset();
    mockSearchData.mockReset();
    (inject as ReturnType<typeof vi.fn>).mockImplementation((token: unknown) => {
      if (token === FirestoreService) return mockFirestoreService;
      if (token === ENV) return { tenantId: 'scs' };
      return undefined;
    });
    service = new TripStatsService();
  });

  it('getStats calls readObject with the correct path', async () => {
    const expected: YearStats = { totalKm: 120, tripCount: 5 };
    mockReadObject.mockReturnValue(of(expected));
    const result = await firstValueFrom(service.getStats('boats', 'B1', 2026));
    expect(mockReadObject).toHaveBeenCalledWith('stats_boats/B1/years', '2026');
    expect(result).toEqual(expected);
  });

  it('getStats calls readObject for members with the correct path', async () => {
    mockReadObject.mockReturnValue(of(undefined));
    await firstValueFrom(service.getStats('members', 'M5', 2025));
    expect(mockReadObject).toHaveBeenCalledWith('stats_members/M5/years', '2025');
  });

  it('getHistory calls searchData with the correct collection path', async () => {
    const history: YearStats[] = [
      { okey: '2025', totalKm: 100, tripCount: 4 },
      { okey: '2026', totalKm: 150, tripCount: 6 },
    ];
    mockSearchData.mockReturnValue(of(history));
    const result = await firstValueFrom(service.getHistory('boats', 'B1'));
    expect(mockSearchData).toHaveBeenCalledWith('stats_boats/B1/years', [], '__name__', 'asc');
    expect(result).toEqual(history);
  });

  it('getQuarterRollup with quarter 0 reads the yearly rollup', async () => {
    mockReadObject.mockReturnValue(of({ entries: {} }));
    await firstValueFrom(service.getQuarterRollup('boats', 2026, 0));
    expect(mockReadObject).toHaveBeenCalledWith('stats_rollup', 'boats_2026');
    expect(mockSearchData).not.toHaveBeenCalled();
  });

  it('getQuarterRollup queries the quarter\'s trips and aggregates them', async () => {
    mockSearchData.mockReturnValue(of([
      { state: 'closed', type: 'logbuch', distance: 8, resource: { key: 'B1' }, participants: [] },
      { state: 'open',   type: 'logbuch', distance: 5, resource: { key: 'B1' }, participants: [] },
    ]));
    const result = await firstValueFrom(service.getQuarterRollup('boats', 2026, 2));
    const [collection, query] = mockSearchData.mock.calls[0];
    expect(collection).toBe('trips');
    expect(query).toEqual(expect.arrayContaining([
      { key: 'startDate', operator: '>=', value: '20260401' },
      { key: 'startDate', operator: '<=', value: '20260631' },
    ]));
    expect(result).toEqual({ okey: 'boats_2026_Q2', entries: { B1: { km: 8, count: 1 } } });
  });
});
