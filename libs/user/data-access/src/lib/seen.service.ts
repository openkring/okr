import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { SeenModel, seenCollectionPath } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

/**
 * The user's "I have looked at this" markers — `users/{uid}/seen/{parentKey}`.
 *
 * Generic on purpose: the first client is the calevent activity badge, but any model that
 * counts its activity can use the same subcollection with its own `<modelType>.<key>` id.
 * No toast, no confirmation: marking something as seen is a side effect of opening it.
 */
@Injectable({
  providedIn: 'root'
})
export class SeenService {
  private readonly firestoreService = inject(FirestoreService);

  /** All markers of one user as a live stream; empty before login. */
  public list(uid: string | undefined): Observable<SeenModel[]> {
    if (!uid) return of([]);
    return this.firestoreService.listAllObjects<SeenModel>(seenCollectionPath(uid), true);
  }

  /**
   * Record that the user has now seen `count` activity entries on the parent.
   * Overwrites the previous marker (setDoc) — the id is the parent key.
   */
  public async markSeen(uid: string | undefined, parentKey: string, count: number): Promise<void> {
    if (!uid || !parentKey) return;
    const marker: Omit<SeenModel, 'okey'> = { count: count ?? 0, seenAt: getTodayStr(DateFormat.StoreDateTime) };
    await this.firestoreService.createObject(seenCollectionPath(uid), parentKey, marker);
  }
}
