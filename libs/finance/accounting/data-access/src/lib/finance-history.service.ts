import { inject, Injectable } from '@angular/core';
import { map, Observable, of } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { CommentModel, FinanceCommentCollection, UserModel } from '@okr/shared-models';
import { DateFormat, getFullName, getTodayStr } from '@okr/shared-util-core';

/**
 * The Verlauf of an invoice or bill (`parentKey` = `invoice.<okey>` / `bill.<okey>`) in `finance-comments`:
 * bexio comments (tags 'bexio'), events written by the Cloud Functions (tags 'system,<kind>', description
 * `@<i18n key> <details>`) and notes the treasurer adds here (tags 'note'). Treasurer/privileged only
 * (firestore.rules); entries are never edited or deleted.
 */
@Injectable({ providedIn: 'root' })
export class FinanceHistoryService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = inject(ENV).tenantId;

  /** Oldest first, like a comment thread. Sorted here: an orderBy would need one more composite index. */
  public list(parentKey: string): Observable<CommentModel[]> {
    if (!parentKey) return of([]);
    return this.firestoreService.searchData<CommentModel>(FinanceCommentCollection, [
      { key: 'tenants', operator: 'array-contains', value: this.tenantId },
      { key: 'parentKey', operator: '==', value: parentKey },
    ], 'none').pipe(
      map((entries) => [...entries].sort((a, b) => (a.creationDateTime ?? '').localeCompare(b.creationDateTime ?? ''))),
    );
  }

  /** Adds a note by the current user. The rules accept only tags 'note', authored by the caller. */
  public async addNote(parentKey: string, text: string, currentUser: UserModel | undefined): Promise<string | undefined> {
    const description = text.trim();
    if (!parentKey || !description || !currentUser) return undefined;
    const note = new CommentModel();
    note.authorKey = currentUser.personKey;
    note.authorName = getFullName(currentUser.firstName, currentUser.lastName);
    note.creationDateTime = getTodayStr(DateFormat.StoreDateTime);
    note.parentKey = parentKey;
    note.description = description;
    note.tags = 'note';
    note.tenants = [this.tenantId];
    return this.firestoreService.createModel<CommentModel>(FinanceCommentCollection, note);
  }
}
