import { Injectable, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { DiaryAlbumCollection, DiaryAlbumModel, UserModel } from '@okr/shared-models';
import { getDeletePatch } from '@okr/shared-util-core';

import { DIARY_I18N_KEYS, albumRefOf, diaryAlbumId } from '@okr/content-diary-util';

/**
 * The author's own albums (person, location, event). Same owner-only rule as `diaries`, so
 * the list query constrains `authorKey` alone and drops other tenants in memory.
 */
@Injectable({ providedIn: 'root' })
export class DiaryAlbumService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly env = inject(ENV);
  private readonly i18n = inject(I18nService).translateAll({
    update_conf: DIARY_I18N_KEYS.update_conf,
    update_error: DIARY_I18N_KEYS.update_error,
    create_conf: DIARY_I18N_KEYS.create_conf,
    create_error: DIARY_I18N_KEYS.create_error,
  });

  /** Non-archived albums of `authorKey` in `tenantId`. */
  public list(authorKey: string, tenantId: string): Observable<DiaryAlbumModel[]> {
    if (!authorKey || !tenantId) return of([]);
    return this.firestoreService.searchData<DiaryAlbumModel>(
      DiaryAlbumCollection, [{ key: 'authorKey', operator: '==', value: authorKey }], 'none',
    ).pipe(
      map(albums => albums.filter(album => !album.isArchived && (album.tenants ?? []).includes(tenantId))),
    );
  }

  /** The id is deterministic, so adding the same album twice must fail rather than overwrite. */
  public async create(album: DiaryAlbumModel, currentUser?: UserModel): Promise<string | undefined> {
    album.okey = diaryAlbumId(album.tenants[0], album.authorKey, album.kind, albumRefOf(album));
    return await this.firestoreService.createModel<DiaryAlbumModel>(
      DiaryAlbumCollection, album, this.i18n.create_conf(), this.i18n.create_error(), currentUser, false, false);
  }

  public async update(album: DiaryAlbumModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<DiaryAlbumModel>(
      DiaryAlbumCollection, album, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
  }

  /** deleting-models skill: detach the tenant, archive when it was the last one. */
  public async archive(album: DiaryAlbumModel, currentUser?: UserModel): Promise<void> {
    await this.update({ ...album, ...getDeletePatch(album.tenants, this.env.tenantId) }, currentUser);
  }
}
