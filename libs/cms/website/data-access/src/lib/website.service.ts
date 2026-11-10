import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { UserModel, WebsiteCollection, WebsiteModel } from '@okr/shared-models';

import { PFX } from './scope';

/** Written by the Admin SDK only (publishWebsite, developer deploy, import); a client save never sends them. */
export const WEBSITE_SERVER_FIELDS = ['hostingSite', 'domain', 'templateVersion', 'lastPublishedAt', 'lastPublishedBy', 'lastPublishedVersion'] as const;

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
    // updateModel merges: leaving the server-owned fields out keeps their stored values, so a stale `site`
    // cannot overwrite a newer publish stamp (and firestore.rules refuses client changes to them anyway).
    const next = { ...site, ...patch, draftChangedAt: new Date().toISOString() } as Partial<WebsiteModel>;
    for (const key of WEBSITE_SERVER_FIELDS) delete next[key];
    await this.firestoreService.updateModel<WebsiteModel>(
      WebsiteCollection, next as WebsiteModel, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
  }
}
