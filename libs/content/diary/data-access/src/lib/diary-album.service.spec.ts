import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { AlertService } from '@okr/shared-util-angular';
import { DiaryAlbumModel } from '@okr/shared-models';
import { DIARY_I18N_KEYS } from '@okr/content-diary-util';

import { DiaryAlbumService } from './diary-album.service';

describe('DiaryAlbumService', () => {
  const searchData = vi.fn();
  const createModel = vi.fn().mockResolvedValue('k');
  const updateModel = vi.fn().mockResolvedValue('k');
  const readModelOnce = vi.fn().mockResolvedValue(undefined);
  const showToast = vi.fn().mockResolvedValue(undefined);

  const album = (extra: Partial<DiaryAlbumModel> = {}): DiaryAlbumModel =>
    Object.assign(new DiaryAlbumModel('bka'), { authorKey: 'u1', kind: 'event', slug: 'anrudern', title: 'Anrudern' }, extra);

  const translateAll = vi.fn(() => ({ update_conf: () => '', update_error: () => '', create_conf: () => '', create_error: () => '', exists: () => 'exists' }));

  beforeEach(() => {
    searchData.mockReset();
    createModel.mockClear();
    updateModel.mockClear();
    readModelOnce.mockReset().mockResolvedValue(undefined);
    showToast.mockClear();
    TestBed.configureTestingModule({
      providers: [
        DiaryAlbumService,
        { provide: ENV, useValue: { tenantId: 'bka' } },
        { provide: FirestoreService, useValue: { searchData, createModel, updateModel, readModelOnce } },
        { provide: AlertService, useValue: { showToast } },
        { provide: I18nService, useValue: { translateAll } },
      ],
    });
  });

  it('toasts album wording, not the diary entry wording', () => {
    TestBed.inject(DiaryAlbumService);
    expect(translateAll).toHaveBeenCalledWith({
      update_conf: DIARY_I18N_KEYS.albums_update_conf, update_error: DIARY_I18N_KEYS.albums_update_error,
      create_conf: DIARY_I18N_KEYS.albums_create_conf, create_error: DIARY_I18N_KEYS.albums_create_error,
      exists: DIARY_I18N_KEYS.albums_exists,
    });
  });

  it('list queries authorKey only and filters tenant and archived in memory', async () => {
    searchData.mockReturnValue(of([
      album({ okey: 'a' }),
      album({ okey: 'b', tenants: ['other'] }),
      album({ okey: 'c', isArchived: true }),
    ]));
    const result = await firstValueFrom(TestBed.inject(DiaryAlbumService).list('u1', 'bka'));
    expect(searchData.mock.calls[0][1]).toEqual([{ key: 'authorKey', operator: '==', value: 'u1' }]);
    expect(result.map(a => a.okey)).toEqual(['a']);
  });

  it('list is empty without an author', async () => {
    expect(await firstValueFrom(TestBed.inject(DiaryAlbumService).list('', 'bka'))).toEqual([]);
    expect(searchData).not.toHaveBeenCalled();
  });

  it('create uses the deterministic id and never overwrites', async () => {
    await TestBed.inject(DiaryAlbumService).create(album());
    const [collectionName, model, , , , , allowOverwrite] = createModel.mock.calls[0];
    expect(collectionName).toBe('diaryAlbums');
    expect((model as DiaryAlbumModel).okey).toBe('bka__u1__event__anrudern');
    expect(allowOverwrite).toBe(false);
  });

  it('create refuses an album that already exists live, toasts and writes nothing', async () => {
    readModelOnce.mockResolvedValueOnce(album({ okey: 'bka__u1__event__anrudern', tenants: ['bka'] }));
    expect(await TestBed.inject(DiaryAlbumService).create(album())).toBeUndefined();
    expect(readModelOnce).toHaveBeenCalledWith('diaryAlbums', 'bka__u1__event__anrudern');
    expect(showToast).toHaveBeenCalledWith('exists');
    expect(createModel).not.toHaveBeenCalled();
    expect(updateModel).not.toHaveBeenCalled();
  });

  it('create brings an archived album back with the new title and notes', async () => {
    readModelOnce.mockResolvedValueOnce(album({
      okey: 'bka__u1__event__anrudern', tenants: ['bka'], isArchived: true, title: 'Alt', notes: 'alt',
    }));
    const key = await TestBed.inject(DiaryAlbumService).create(album({ title: 'Anrudern 2', notes: 'neu', index: 'n:anrudern 2' }));
    expect(key).toBe('k');
    expect(createModel).not.toHaveBeenCalled();
    const restored = updateModel.mock.calls[0][1] as DiaryAlbumModel;
    expect(restored).toMatchObject({
      okey: 'bka__u1__event__anrudern', isArchived: false, title: 'Anrudern 2', notes: 'neu', slug: 'anrudern',
      index: 'n:anrudern 2', tenants: ['bka'], authorKey: 'u1',
    });
    expect(updateModel.mock.calls[0][2]).toBe(false);
  });

  it('create refuses an album without a ref and writes nothing', async () => {
    expect(await TestBed.inject(DiaryAlbumService).create(album({ slug: '' }))).toBeUndefined();
    expect(await TestBed.inject(DiaryAlbumService).create(album({ kind: 'person', slug: '', ref: undefined }))).toBeUndefined();
    expect(createModel).not.toHaveBeenCalled();
  });

  it('create derives the id from the person ref', async () => {
    await TestBed.inject(DiaryAlbumService).create(album({ kind: 'person', slug: '', ref: { key: 'p1' } as DiaryAlbumModel['ref'] }));
    expect((createModel.mock.calls[0][1] as DiaryAlbumModel).okey).toBe('bka__u1__person__p1');
  });

  it('archive sets isArchived for a single-tenant album and reports success', async () => {
    expect(await TestBed.inject(DiaryAlbumService).archive(album({ okey: 'a' }))).toBe(true);
    expect((updateModel.mock.calls[0][1] as DiaryAlbumModel).isArchived).toBe(true);
  });

  it('archive reports a failed write', async () => {
    updateModel.mockResolvedValueOnce(undefined);
    expect(await TestBed.inject(DiaryAlbumService).archive(album({ okey: 'a' }))).toBe(false);
  });
});
