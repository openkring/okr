import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ActivityService } from '@okr/activity-data-access';
import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { CrosswordTopicCollection, CrosswordTopicModel, UserModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

import { CROSSWORD_I18N_KEYS } from '@okr/games-crossword-util';

/**
 * The tenant's crossword topics (`crosswordTopics`). Writes are for content admins only —
 * firestore.rules enforces it; the UI only offers them in edit mode.
 */
@Injectable({ providedIn: 'root' })
export class CrosswordTopicService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly activityService = inject(ActivityService);
  private readonly i18n = inject(I18nService).translateAll({
    create_conf:  CROSSWORD_I18N_KEYS.create_conf,
    create_error: CROSSWORD_I18N_KEYS.create_error,
    update_conf:  CROSSWORD_I18N_KEYS.update_conf,
    update_error: CROSSWORD_I18N_KEYS.update_error,
    delete_conf:  CROSSWORD_I18N_KEYS.delete_conf,
    delete_error: CROSSWORD_I18N_KEYS.delete_error,
  });

  public list(): Observable<CrosswordTopicModel[]> {
    return this.firestoreService.searchData<CrosswordTopicModel>(
      CrosswordTopicCollection, getSystemQuery(this.env.tenantId), 'none');
  }

  public get(okey: string): Observable<CrosswordTopicModel | undefined> {
    return this.firestoreService.readModel<CrosswordTopicModel>(CrosswordTopicCollection, okey);
  }

  public async create(topic: CrosswordTopicModel, currentUser?: UserModel): Promise<string | undefined> {
    const key = await this.firestoreService.createModel<CrosswordTopicModel>(
      CrosswordTopicCollection, topic, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
    void this.activityService.log('crossword', 'create', currentUser, `${key}:${topic.title}`);
    return key;
  }

  public async update(topic: CrosswordTopicModel, currentUser?: UserModel): Promise<string | undefined> {
    const key = await this.firestoreService.updateModel<CrosswordTopicModel>(
      CrosswordTopicCollection, topic, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    void this.activityService.log('crossword', 'update', currentUser, `${topic.okey}:${topic.title}`);
    return key;
  }

  /**
   * Archive the topic (`deleteModel` archives, it never hard-deletes — see the `deleting-models`
   * skill). Takes the MODEL, not the okey: `deleteModel` internally applies
   * `getDeletePatch(model.tenants, this.env.tenantId)`, the archive-vs-detach rule for documents
   * shared across tenants, so the full model is load-bearing here.
   */
  public async delete(topic: CrosswordTopicModel, currentUser?: UserModel): Promise<string | undefined> {
    const key = await this.firestoreService.deleteModel<CrosswordTopicModel>(
      CrosswordTopicCollection, topic, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
    void this.activityService.log('crossword', 'delete', currentUser, `${topic.okey}:${topic.title}`);
    return key;
  }
}
