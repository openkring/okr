import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { UserModel, WhiteboardCollection, WhiteboardModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

import { getWhiteboardIndex } from '@okr/instruments-whiteboard-util';
import { ActivityService } from '@okr/activity-data-access';
import { PFX } from './scope';

/**
 * Firestore gateway for the `whiteboards` collection. CRUD + a tenant-scoped list, exactly like
 * every other feature service (`FolderService` is the template). The board — including its embedded
 * `items[]` — is one document, so a move/edit is a single `update` of the whole model.
 */
@Injectable({
  providedIn: 'root',
})
export class WhiteboardService {
  private readonly env = inject(ENV);
  private readonly activityService = inject(ActivityService);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf:  PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf:  PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
  });
  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
  public async create(whiteboard: WhiteboardModel, currentUser?: UserModel): Promise<string | undefined> {
    whiteboard.index = getWhiteboardIndex(whiteboard);
    const key = await this.firestoreService.createModel<WhiteboardModel>(WhiteboardCollection, whiteboard, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
    void this.activityService.log('whiteboard', 'create', currentUser, `${key}:${whiteboard.name}`);
    return key;
  }

  public read(key: string): Observable<WhiteboardModel | undefined> {
    return this.firestoreService.readModel<WhiteboardModel>(WhiteboardCollection, key);
  }

  public async update(whiteboard: WhiteboardModel, currentUser?: UserModel): Promise<string | undefined> {
    whiteboard.index = getWhiteboardIndex(whiteboard);
    const key = await this.firestoreService.updateModel<WhiteboardModel>(WhiteboardCollection, whiteboard, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    void this.activityService.log('whiteboard', 'update', currentUser, `${key}:${whiteboard.name}`);
    return key;
  }

  public async delete(whiteboard: WhiteboardModel, currentUser?: UserModel): Promise<void> {
    const payload = `${whiteboard.okey}:${whiteboard.name}`;
    await this.firestoreService.deleteModel<WhiteboardModel>(WhiteboardCollection, whiteboard, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
    void this.activityService.log('whiteboard', 'delete', currentUser, payload);
  }

  /*-------------------------- LIST / QUERY --------------------------------*/
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<WhiteboardModel[]> {
    return this.firestoreService.searchData<WhiteboardModel>(WhiteboardCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }
}
