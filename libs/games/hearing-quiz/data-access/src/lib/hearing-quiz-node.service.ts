import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ActivityService } from '@okr/activity-data-access';
import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { HearingQuizNodeCollection, HearingQuizNodeModel, UserModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

import { HEARING_QUIZ_I18N_KEYS, HearingQuizPlacement, getHearingQuizNodeIndex } from '@okr/games-hearing-quiz-util';

/**
 * The Hörtraining content tree of the current tenant (`hearingQuizNodes`). Writes are for content
 * admins only — firestore.rules enforces it; the UI only offers them in edit mode.
 */
@Injectable({ providedIn: 'root' })
export class HearingQuizNodeService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly activityService = inject(ActivityService);
  private readonly i18n = inject(I18nService).translateAll({
    create_conf:  HEARING_QUIZ_I18N_KEYS.create_conf,
    create_error: HEARING_QUIZ_I18N_KEYS.create_error,
    update_conf:  HEARING_QUIZ_I18N_KEYS.update_conf,
    update_error: HEARING_QUIZ_I18N_KEYS.update_error,
    delete_conf:  HEARING_QUIZ_I18N_KEYS.delete_conf,
    delete_error: HEARING_QUIZ_I18N_KEYS.delete_error,
    copy_conf:    HEARING_QUIZ_I18N_KEYS.copy_conf,
    copy_error:   HEARING_QUIZ_I18N_KEYS.copy_error,
    move_error:   HEARING_QUIZ_I18N_KEYS.move_error,
  });

  /**
   * Every live node of the tenant, unsorted (the tree helpers sort). No `orderBy`: ordering on
   * `order` next to the system query's `array-contains-any` would cost a composite index for
   * nothing — a tenant's tree is a few hundred documents at most.
   */
  public list(): Observable<HearingQuizNodeModel[]> {
    return this.firestoreService.searchData<HearingQuizNodeModel>(HearingQuizNodeCollection, getSystemQuery(this.env.tenantId), 'none');
  }

  public async create(node: HearingQuizNodeModel, currentUser?: UserModel): Promise<string | undefined> {
    node.index = getHearingQuizNodeIndex(node);
    const key = await this.firestoreService.createModel<HearingQuizNodeModel>(
      HearingQuizNodeCollection, node, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
    void this.activityService.log('hearingQuiz', 'create', currentUser, `${key}:${node.title}`);
    return key;
  }

  public async update(node: HearingQuizNodeModel, currentUser?: UserModel, confirm = true): Promise<string | undefined> {
    node.index = getHearingQuizNodeIndex(node);
    const key = await this.firestoreService.updateModel<HearingQuizNodeModel>(
      HearingQuizNodeCollection, node, false, confirm ? this.i18n.update_conf() : undefined, this.i18n.update_error(), currentUser);
    if (confirm) void this.activityService.log('hearingQuiz', 'update', currentUser, `${key}:${node.title}`);
    return key;
  }

  /**
   * Archive `node` and everything below it (`deleteModel` archives, it never hard-deletes —
   * see the `deleting-models` skill). Audio files stay in storage: a copy may share them.
   * @param subtree the node itself plus all its descendants
   */
  public async delete(subtree: HearingQuizNodeModel[], currentUser?: UserModel): Promise<void> {
    const [root, ...rest] = subtree;
    if (!root) return;
    // children first, silently; the root carries the one toast
    for (const node of rest) {
      await this.firestoreService.deleteModel<HearingQuizNodeModel>(HearingQuizNodeCollection, node, undefined, this.i18n.delete_error(), currentUser);
    }
    await this.firestoreService.deleteModel<HearingQuizNodeModel>(HearingQuizNodeCollection, root, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
    void this.activityService.log('hearingQuiz', 'delete', currentUser, `${root.okey}:${root.title}`);
  }

  /** Apply a move: one silent update per node whose parent or order changed. */
  public async place(nodes: HearingQuizNodeModel[], placements: HearingQuizPlacement[], currentUser?: UserModel): Promise<void> {
    const byKey = new Map(nodes.map(n => [n.okey, n]));
    for (const p of placements) {
      const node = byKey.get(p.key);
      if (!node) continue;
      await this.firestoreService.updateModel<HearingQuizNodeModel>(
        HearingQuizNodeCollection, { ...node, parentKey: p.parentKey, order: p.order }, false, undefined, this.i18n.move_error(), currentUser);
    }
  }

  /** Write a copied subtree (already re-keyed by `cloneSubtree`) in batches. */
  public async createCopies(copies: HearingQuizNodeModel[], currentUser?: UserModel): Promise<boolean> {
    const ok = await this.firestoreService.createModels<HearingQuizNodeModel>(HearingQuizNodeCollection, copies, this.i18n.copy_error());
    if (ok) {
      void this.activityService.log('hearingQuiz', 'copy', currentUser, `${copies[0]?.okey}:${copies[0]?.title}`);
    }
    return ok;
  }
}
