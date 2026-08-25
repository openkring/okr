import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom, map } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { FolderCollection, FolderModel, UserModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

import { getFolderIndex, newFolderModel } from '@okr/content-folder-util';
import { ActivityService } from '@okr/activity-data-access';
import { GroupContentService } from '@okr/subject-group-data-access';
import { PFX } from './scope';

@Injectable({
  providedIn: 'root'
})
export class FolderService {
  private readonly env = inject(ENV);
  private readonly activityService = inject(ActivityService);
  private readonly groupContentService = inject(GroupContentService);
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
  public async create(folder: FolderModel, currentUser?: UserModel): Promise<string | undefined> {
    folder.index = getFolderIndex(folder);
    const key = await this.firestoreService.createModel<FolderModel>(FolderCollection, folder, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
    void this.activityService.log('folder', 'create', currentUser, `${key}:${folder.name}`);
    return key;
  }

  public read(key: string): Observable<FolderModel | undefined> {
    return this.firestoreService.readModel<FolderModel>(FolderCollection, key);
  }

  public async update(folder: FolderModel, currentUser?: UserModel): Promise<string | undefined> {
    folder.index = getFolderIndex(folder);
    const key = await this.firestoreService.updateModel<FolderModel>(FolderCollection, folder, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    void this.activityService.log('folder', 'update', currentUser, `${key}:${folder.name}`);
    return key;
  }

  public async delete(folder: FolderModel, currentUser?: UserModel): Promise<void> {
    const payload = `${folder.okey}:${folder.name}`
    await this.firestoreService.deleteModel<FolderModel>(FolderCollection, folder, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
    void this.activityService.log('folder', 'delete', currentUser, payload);
  }

  /**
   * Rename a folder of a group's files segment / toggle its `membersMayUpload` flag as a
   * GROUP ADMIN, through the `updateGroupFolder` Cloud Function.
   *
   * firestore.rules' `allow update` on folders is the same content-manager-or-owner branch
   * as its `allow delete`, so a group admin who owns neither is rejected there too. Use
   * this whenever `canWriteFolderDirectly` is false but `canEditFolder(..., isGroupAdmin)`
   * is true. Only the form's own fields are sent — `parents`, `ownerKey` and `tenants`
   * stay as they are.
   * @param folder the edited folder (its okey identifies the document)
   * @param groupKey the group whose files segment the folder belongs to
   * @param currentUser the acting group admin (for the activity log)
   */
  public async updateAsGroupAdmin(folder: FolderModel, groupKey: string, currentUser?: UserModel): Promise<void> {
    const ok = await this.groupContentService.updateFolderAsGroupAdmin(groupKey, folder.okey, {
      name: folder.name,
      title: folder.title,
      description: folder.description,
      tags: folder.tags,
      membersMayUpload: folder.membersMayUpload === true,
    }, this.i18n.update_conf(), this.i18n.update_error());
    if (!ok) return;
    void this.activityService.log('folder', 'update', currentUser, `${folder.okey}:${folder.name}`);
  }

  /**
   * Delete a folder of a group's files segment as a GROUP ADMIN, through the
   * `deleteGroupContent` Cloud Function.
   *
   * firestore.rules only lets a content manager or the folder's owner delete a folder — it
   * cannot check group admin-ship (`GroupModel.admins` is a list of maps). Use this whenever
   * `canDeleteFolderDirectly` is false but `canEditFolder(..., isGroupAdmin)` is true; the
   * function re-verifies both admin-ship and that the folder really sits inside the group.
   * @param folder the folder to delete
   * @param groupKey the group whose files segment the folder belongs to
   * @param currentUser the acting group admin (for the activity log)
   */
  public async deleteAsGroupAdmin(folder: FolderModel, groupKey: string, currentUser?: UserModel): Promise<void> {
    const payload = `${folder.okey}:${folder.name}`;
    const ok = await this.groupContentService.deleteAsGroupAdmin(
      'folder', groupKey, folder.okey, this.i18n.delete_conf(), this.i18n.delete_error());
    if (!ok) return;
    void this.activityService.log('folder', 'delete', currentUser, payload);
  }

  /*-------------------------- LIST / QUERY --------------------------------*/
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<FolderModel[]> {
    return this.firestoreService.searchData<FolderModel>(FolderCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }

  // Note: a second array-contains on 'parents' would conflict with the tenants filter,
  // so we reuse the cached list() stream and filter client-side.
  public listByParent(parentFolderKey: string): Observable<FolderModel[]> {
    return this.list().pipe(
      map(folders => folders.filter(f => f.parents.includes(parentFolderKey)))
    );
  }

  /*-------------------------- GROUP FOLDER --------------------------------*/
  /**
   * Ensure a FolderModel with okey = groupKey exists for the GroupView files tab.
   * Creates it lazily the first time the files segment is opened.
   *
   * Adoption guard: the tightened rules let any registered member create a self-owned
   * folder at an arbitrary document ID — including a well-known key like a group's
   * folder — before the legitimate owner gets there first. If a squatter wins that
   * race, a folder owner is granted moderation rights over every document inside it,
   * so an existing folder is only accepted when its `ownerKey` is one of
   * `allowedOwnerKeys`.
   * @param groupKey the group okey — also used as the folder okey
   * @param groupName the group display name — used as the folder name
   * @param tenantId the tenant the folder belongs to
   * @param currentUser the user creating the folder (if it doesn't exist yet)
   * @param allowedOwnerKeys personKeys permitted to own this well-known folder. An
   *   empty array means "no owner policy known" and disables the adoption guard —
   *   pass the group's admin personKeys from the group-view call site; other callers
   *   (EZS/RAG folders) omit it.
   * @returns true when the folder is present and legitimately owned (safe to use),
   *   false when it was refused (owner conflict) or could not be created.
   */
  public async ensureGroupFolder(groupKey: string, groupName: string, tenantId: string, currentUser?: UserModel, allowedOwnerKeys: string[] = []): Promise<boolean> {
    // A get() on a not-yet-existent folder can be REJECTED by the tenantRead() rule
    // (it dereferences resource.data.tenants on a null resource → "Missing or
    // insufficient permissions"), so treat any read failure as "does not exist" and
    // fall through to create. Both branches are guarded: this runs from an un-awaited
    // caller (onSegmentChanged), so an escaping rejection would be uncaught.
    try {
      const existing = await firstValueFrom(this.firestoreService.readModel<FolderModel>(FolderCollection, groupKey));
      if (existing) {
        const ownerKey = existing.ownerKey ?? ''; // legacy folders have no ownerKey
        if (allowedOwnerKeys.length > 0 && ownerKey !== '' && !allowedOwnerKeys.includes(ownerKey)) {
          console.error(`FolderService.ensureGroupFolder: folder '${groupKey}' is owned by '${ownerKey}', which is not among the expected owners — refusing to treat it as the group's folder`);
          return false;
        }
        return true;
      }
    } catch { /* not readable / does not exist → create below */ }

    try {
      const folder = newFolderModel(tenantId, groupName, [], currentUser?.personKey ?? '');
      folder.okey = groupKey;
      await this.create(folder, currentUser);
      return true;
    } catch (ex) {
      console.error(`FolderService.ensureGroupFolder: could not create folder '${groupKey}'`, ex);
      return false;
    }
  }

  /*-------------------------- BREADCRUMB TRAIL --------------------------------*/
  /**
   * Load the full ancestor chain from root to the given folder key.
   * Follows FolderModel.parents[0] upward up to maxDepth levels.
   * Returns an array ordered root → … → current.
   */
  public async loadBreadcrumbTrail(folderKey: string, maxDepth = 5): Promise<FolderModel[]> {
    const trail: FolderModel[] = [];
    let currentKey: string | undefined = folderKey;
    let depth = 0;

    while (currentKey && depth < maxDepth) {
      let folder: FolderModel | undefined;
      try {
        // A get() on a non-existent ancestor rejects under tenantRead() (resource is
        // null); stop the chain gracefully rather than reject the whole trail.
        folder = await firstValueFrom(this.read(currentKey));
      } catch { break; }
      if (!folder) break;
      trail.unshift(folder); // prepend → root ends up first
      currentKey = folder.parents?.[0];
      depth++;
    }
    return trail;
  }
}
