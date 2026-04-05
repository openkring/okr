import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom, map } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { FolderCollection, FolderModel, UserModel } from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';

import { getFolderIndex, newFolderModel } from '@bk2/folder-util';
import { ActivityService } from '@bk2/activity-data-access';

@Injectable({
  providedIn: 'root'
})
export class FolderService {
  private readonly env = inject(ENV);
  private readonly activityService = inject(ActivityService);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
  public async create(folder: FolderModel, currentUser?: UserModel): Promise<string | undefined> {
    folder.index = getFolderIndex(folder);
    const key = await this.firestoreService.createModel<FolderModel>(FolderCollection, folder, '@folder.operation.create', currentUser);
    void this.activityService.log('folder', 'create', currentUser);
    return key;
  }

  public read(key: string): Observable<FolderModel | undefined> {
    return this.firestoreService.readModel<FolderModel>(FolderCollection, key);
  }

  public async update(folder: FolderModel, currentUser?: UserModel): Promise<string | undefined> {
    folder.index = getFolderIndex(folder);
    const key = await this.firestoreService.updateModel<FolderModel>(FolderCollection, folder, false, '@folder.operation.update', currentUser);
    void this.activityService.log('folder', 'update', currentUser);
    return key;
  }

  public async delete(folder: FolderModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<FolderModel>(FolderCollection, folder, '@folder.operation.delete', currentUser);
    void this.activityService.log('folder', 'delete', currentUser);
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
   * Ensure a FolderModel with bkey = groupKey exists for the GroupView files tab.
   * Creates it lazily the first time the files segment is opened.
   * @param groupKey the group bkey — also used as the folder bkey
   * @param groupName the group display name — used as the folder name
   * @param tenantId the tenant the folder belongs to
   * @param currentUser the user creating the folder (if it doesn't exist yet)
   */
  public async ensureGroupFolder(groupKey: string, groupName: string, tenantId: string, currentUser?: UserModel): Promise<void> {
    const existing = await firstValueFrom(this.firestoreService.readModel<FolderModel>(FolderCollection, groupKey));
    if (existing) return;
    const folder = newFolderModel(tenantId, groupName);
    folder.bkey = groupKey;
    await this.create(folder, currentUser);
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
      const folder: FolderModel | undefined = await firstValueFrom(this.read(currentKey));
      if (!folder) break;
      trail.unshift(folder); // prepend → root ends up first
      currentKey = folder.parents?.[0];
      depth++;
    }
    return trail;
  }
}
