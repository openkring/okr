import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';

import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { TOAST_LENGTH } from '@okr/shared-constants';
import { ENV } from '@okr/shared-config';

/** What kind of item the `deleteGroupContent` callable should delete. */
export type GroupContentTarget = 'folder' | 'document';

/** The folder fields a group admin may change — the inputs of `folder.form.ts`. */
export interface GroupFolderPatch {
  name: string;
  title: string;
  description: string;
  tags: string;
  membersMayUpload: boolean;
}

/** Response of the `deleteGroupContent` callable — see apps/functions/src/content. */
export interface DeleteGroupContentResponse {
  /** 'archived' → isArchived was set; 'detached' → this tenant was removed from `tenants`. */
  action: 'archived' | 'detached';
}

/**
 * Server-side deletion of files and folders inside a group's files segment, on behalf of a
 * GROUP ADMIN.
 *
 * `firestore.rules` grants folder/document deletion to a content manager, the folder owner
 * or the document's author only — it has no way to express "the caller is an admin of this
 * group", because `GroupModel.admins` is an `AvatarInfo[]` and rules cannot scan a list of
 * maps for a field value. A group admin who is none of the above therefore deletes through
 * this callable, which re-checks admin-ship and folder containment with the Admin SDK.
 *
 * Delete semantics are identical to the direct path: the item is archived, or detached
 * from this tenant when it is shared — never hard-deleted. The update path writes only the
 * form's own fields; `parents`, `ownerKey` and `tenants` are never sent, and the server
 * would ignore them anyway.
 */
@Injectable({ providedIn: 'root' })
export class GroupContentService {
  private readonly env = inject(ENV);
  private readonly toastController = inject(ToastController);
  private readonly functions = getFunctions(getApp(), 'europe-west6');

  /**
   * Deletes `okey` from the group's files segment. Returns true on success; on failure it
   * shows `errorMessage` as a toast and returns false — the callers are user-initiated
   * delete actions that must not leave an unhandled rejection behind.
   */
  public async deleteAsGroupAdmin(
    target: GroupContentTarget,
    groupKey: string,
    okey: string,
    confirmMessage?: string,
    errorMessage?: string,
  ): Promise<boolean> {
    try {
      const fn = httpsCallable<
        { tenantId: string; groupKey: string; target: GroupContentTarget; okey: string },
        DeleteGroupContentResponse
      >(this.functions, 'deleteGroupContent');
      await fn({ tenantId: this.env.tenantId, groupKey, target, okey });
      if (confirmMessage) await this.showToast(confirmMessage);
      return true;
    } catch (ex) {
      console.error(`GroupContentService.deleteAsGroupAdmin(${target}/${okey}) failed:`, ex);
      if (errorMessage) await this.showToast(errorMessage);
      return false;
    }
  }

  /**
   * Renames a folder / toggles `membersMayUpload` inside the group's files segment. Same
   * error contract as {@link deleteAsGroupAdmin}: true on success, toast + false on failure.
   */
  public async updateFolderAsGroupAdmin(
    groupKey: string,
    okey: string,
    patch: GroupFolderPatch,
    confirmMessage?: string,
    errorMessage?: string,
  ): Promise<boolean> {
    try {
      const fn = httpsCallable<
        { tenantId: string; groupKey: string; okey: string } & GroupFolderPatch,
        { okey: string }
      >(this.functions, 'updateGroupFolder');
      await fn({ tenantId: this.env.tenantId, groupKey, okey, ...patch });
      if (confirmMessage) await this.showToast(confirmMessage);
      return true;
    } catch (ex) {
      console.error(`GroupContentService.updateFolderAsGroupAdmin(${okey}) failed:`, ex);
      if (errorMessage) await this.showToast(errorMessage);
      return false;
    }
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastController.create({ message, duration: TOAST_LENGTH });
    await toast.present();
  }
}
