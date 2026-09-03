import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { DiaryModel } from '@okr/shared-models';

import { DiaryService } from './diary.service';

describe('DiaryService.listByYear', () => {
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
    TestBed.inject(DiaryService).listByYear('u1', 'bka', 1990).subscribe();
    const [, query] = searchData.mock.calls[0];
    expect(query).toEqual(expect.arrayContaining([
      { key: 'authorKey', operator: '==', value: 'u1' },
      { key: 'tenants', operator: 'array-contains', value: 'bka' },
      { key: 'date', operator: '>=', value: '19900000' },
      { key: 'date', operator: '<=', value: '19901231' },
    ]));
  });

  it('without a year keeps exactly the two rule constraints', () => {
    TestBed.inject(DiaryService).listByYear('u1', 'bka').subscribe();
    const [, query] = searchData.mock.calls[0];
    expect(query).toHaveLength(2);
  });

  it('returns an empty stream for an empty uid without querying', () => {
    TestBed.inject(DiaryService).listByYear('', 'bka', 2026).subscribe();
    expect(searchData).not.toHaveBeenCalled();
  });
});
