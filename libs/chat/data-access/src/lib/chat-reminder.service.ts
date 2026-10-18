import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { FirestoreService } from '@okr/shared-data-access';
import { ChatReminderCollection, ChatReminderModel, OkrModel } from '@okr/shared-models';

/**
 * A reminder is never archived (state carries its lifecycle, rules forbid delete), so the model has
 * no `isArchived`; FirestoreService's generic constraint wants it. It is only a type-level
 * stand-in: the field is never set, so it is never written.
 */
type StoredReminder = ChatReminderModel & OkrModel;

/**
 * Reminders on bookmarked chat messages (spec 1.104 §5). The owner's client creates a pending
 * reminder, may move it (`dueAt`) or cancel it; a 5-minute Cloud Function sweep sends it.
 * firestore.rules allow only exactly that, so the list query must match the rules too: own
 * person, own tenant, pending (an index for exactly this exists).
 *
 * The `errorMessage` parameters take an already RESOLVED string (or undefined) — never a key.
 */
@Injectable({ providedIn: 'root' })
export class ChatReminderService {
  private readonly firestoreService = inject(FirestoreService);

  /** Live list of the caller's pending reminders in this tenant. */
  public listPending(personKey: string, tenantId: string): Observable<ChatReminderModel[]> {
    return this.firestoreService.searchData<ChatReminderModel>(ChatReminderCollection, [
      { key: 'personKey', operator: '==', value: personKey },
      { key: 'tenants', operator: 'array-contains', value: tenantId },
      { key: 'state', operator: '==', value: 'pending' },
    ], 'none');
  }

  public async create(reminder: ChatReminderModel, errorMessage?: string): Promise<string | undefined> {
    return this.firestoreService.createModel<StoredReminder>(ChatReminderCollection, reminder as StoredReminder, undefined, errorMessage);
  }

  /**
   * Move a pending reminder to a new time. Rules allow `dueAt` only while pending. Partial write:
   * the sweep may have bumped `failures` since this copy was read, and re-sending the whole cached
   * doc would put `failures` into the diff, which the rules deny.
   */
  public async reschedule(reminder: ChatReminderModel, dueAt: number, errorMessage?: string): Promise<boolean> {
    return !!(await this.firestoreService.updateFields(ChatReminderCollection, reminder.okey, { dueAt }, errorMessage));
  }

  /** Cancel a pending reminder (state → cancelled; documents are never deleted). Partial write, see reschedule. */
  public async cancel(reminder: ChatReminderModel, errorMessage?: string): Promise<boolean> {
    return !!(await this.firestoreService.updateFields(ChatReminderCollection, reminder.okey, { state: 'cancelled' }, errorMessage));
  }
}
