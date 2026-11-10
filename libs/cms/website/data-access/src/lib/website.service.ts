import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { UserModel, WebsiteCollection, WebsiteModel } from '@okr/shared-models';

import { PFX } from './scope';

@Injectable({
  providedIn: 'root'
})
export class WebsiteService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf:  PFX + 'update.conf',
    update_error: PFX + 'update.error',
  });

  /**
   * Read a website document (`websites/{siteId}`) as a live stream.
   * @param siteId the document id, e.g. 'scs'
   */
  public read(siteId: string | undefined): Observable<WebsiteModel | undefined> {
    if (!siteId) return of(undefined);
    return this.firestoreService.readModel<WebsiteModel>(WebsiteCollection, siteId);
  }

  /**
   * Create a website document. The document id is the model's `okey` (the siteId).
   * @returns the document id, or undefined when the write failed (the error is toasted)
   */
  public async create(site: WebsiteModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<WebsiteModel>(
      WebsiteCollection, site, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
  }

  /**
   * Save an edited navigation tree. Bumps `draftChangedAt` in the same write so the site shows as
   * "changed since last publish". The caller's `site` object is not mutated.
   */
  public async saveTree(
    site: WebsiteModel,
    patch: Pick<WebsiteModel, 'nav'> & Partial<Pick<WebsiteModel, 'footer' | 'homePageKey'>>,
    currentUser?: UserModel
  ): Promise<void> {
    const next: WebsiteModel = { ...site, ...patch, draftChangedAt: new Date().toISOString() };
    await this.firestoreService.updateModel<WebsiteModel>(
      WebsiteCollection, next, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
  }
}
