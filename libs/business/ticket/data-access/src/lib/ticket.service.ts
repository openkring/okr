import { inject, Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import {
  CommentCollection, CommentModel, TicketClassification, TicketCollection, TicketModel,
  TicketSeverity,
} from '@okr/shared-models';
import { findByKey, getSystemQuery } from '@okr/shared-util-core';

/** One transition of the queue — the `action` argument of the `triageTicket` callable (C4 §4). */
export type TriageAction = 'accept' | 'wait' | 'resume' | 'workaround' | 'fix' | 'close' | 'severity';

/**
 * Read side of the 3LS escalation queue (C4), bkaiser-side in tenant `kring`.
 *
 * **There is no direct write path here, and that is the design.** `firestore.rules` has `tickets`
 * as admin-**read**, `allow write: if false`, so every mutation goes through a callable:
 *  - `classifyTicket` — because the classification decides free vs. chargeable and is audited.
 *    A rule cannot require that a reason and an author arrive with it; the callable can, and an
 *    admin who could write the document directly could bill a partner with nothing on the record.
 *  - `triageTicket` — because `waitingDays` is *banked* on each leave of `waiting-on-partner`
 *    (C4 §4) and is not reconstructible from the record afterwards. A hand-edited status would
 *    silently flatter our own resolution time in the §5 statistics.
 *  - `commentTicket` — because a partner has no `kring` account to write a comment with, and the
 *    partner's half of the thread is redacted server-side before it is stored (§6.1).
 *
 * Reads stay on Firestore, so the queue is realtime the way every other list in the app is.
 */
@Injectable({ providedIn: 'root' })
export class TicketService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly functions = getFunctions(getApp(), 'europe-west6');

  private readonly tenantId = this.env.tenantId;

  /** Newest first: an escalation is worked from the top and the SLA clock runs on the fresh ones. */
  public list(): Observable<TicketModel[]> {
    return this.firestoreService.searchData<TicketModel>(
      TicketCollection, getSystemQuery(this.tenantId), 'submittedAt', 'desc');
  }

  public read(ticketKey: string): Observable<TicketModel | undefined> {
    return findByKey<TicketModel>(this.list(), ticketKey);
  }

  /**
   * The comment thread, under `parentKey = 'ticket.<okey>'`.
   *
   * The existing `comments` collection rather than a subcollection of our own: it is generic by
   * `parentKey`, already carries its own row in the subject-data map and its own rules, and a
   * second comment collection would be a second thing to classify, erase and secure for behaviour
   * we already have.
   */
  public comments(ticketKey: string): Observable<CommentModel[]> {
    return this.firestoreService.searchData<CommentModel>(
      CommentCollection,
      [...getSystemQuery(this.tenantId), { key: 'parentKey', operator: '==', value: `ticket.${ticketKey}` }],
      'creationDateTime', 'asc');
  }

  /** Errors are not caught: these are critical, user-initiated writes and the store surfaces them. */
  public async classify(
    ticketKey: string, classification: TicketClassification, classificationReason: string,
  ): Promise<void> {
    const fn = httpsCallable(this.functions, 'classifyTicket');
    await fn({ ticketKey, classification, classificationReason });
  }

  public async triage(
    ticketKey: string, action: TriageAction,
    extras: { fixVersion?: string; severity?: TicketSeverity } = {},
  ): Promise<void> {
    const fn = httpsCallable(this.functions, 'triageTicket');
    await fn({ ticketKey, action, ...extras });
  }

  public async comment(ticketKey: string, text: string): Promise<void> {
    const fn = httpsCallable(this.functions, 'commentTicket');
    await fn({ ticketKey, text });
  }
}
