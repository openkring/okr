import { Injectable, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { DiaryAlbumCollection, DiaryAlbumModel, UserModel } from '@okr/shared-models';
import { AlertService } from '@okr/shared-util-angular';
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
  private readonly alertService = inject(AlertService);
  private readonly i18n = inject(I18nService).translateAll({
    // album wording, not the diary entry's «Der Eintrag wurde …»
    update_conf: DIARY_I18N_KEYS.albums_update_conf,
    update_error: DIARY_I18N_KEYS.albums_update_error,
    create_conf: DIARY_I18N_KEYS.albums_create_conf,
    create_error: DIARY_I18N_KEYS.albums_create_error,
    exists: DIARY_I18N_KEYS.albums_exists,
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

  /**
   * The id is deterministic, so adding the same album twice must not overwrite it. An album the
   * author archived earlier comes back to life instead (with the new title, notes, ref and slug);
   * a live one is refused with «Dieses Album gibt es schon.». createModel's own existence guard
   * still catches a race, or a read that failed and returned nothing.
   */
  public async create(album: DiaryAlbumModel, currentUser?: UserModel): Promise<string | undefined> {
    const ref = albumRefOf(album);
    if (!ref) return undefined;
    const okey = diaryAlbumId(this.env.tenantId, album.authorKey, album.kind, ref);
    const existing = await this.firestoreService.readModelOnce<DiaryAlbumModel>(DiaryAlbumCollection, okey);
    if (existing && !existing.isArchived) {
      await this.alertService.showToast(this.i18n.exists());
      return undefined;
    }
    if (existing) {
      const restored: DiaryAlbumModel = {
        ...existing, okey, isArchived: false,
        title: album.title, notes: album.notes, ref: album.ref, slug: album.slug, index: album.index,
      };
      return await this.firestoreService.updateModel<DiaryAlbumModel>(
        DiaryAlbumCollection, restored, false, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
    }
    album.okey = okey;
    return await this.firestoreService.createModel<DiaryAlbumModel>(
      DiaryAlbumCollection, album, this.i18n.create_conf(), this.i18n.create_error(), currentUser, false, false);
  }

  public async update(album: DiaryAlbumModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<DiaryAlbumModel>(
      DiaryAlbumCollection, album, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
  }

  /** deleting-models skill: detach the tenant, archive when it was the last one. */
  /** true when the write went through (updateModel resolves undefined on failure). */
  public async archive(album: DiaryAlbumModel, currentUser?: UserModel): Promise<boolean> {
    return !!(await this.update({ ...album, ...getDeletePatch(album.tenants, this.env.tenantId) }, currentUser));
  }
}
