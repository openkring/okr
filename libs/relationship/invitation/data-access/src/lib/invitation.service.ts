import { inject, Injectable } from '@angular/core';
import { doc } from 'firebase/firestore';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { CommentCollection, InvitationCollection, InvitationModel, InvitationModelName, InvitationState, UserModel } from '@okr/shared-models';
import { DateFormat, findByKey, getFullName, getSystemQuery, getTodayStr, removeKeyFromOkrModel } from '@okr/shared-util-core';

import { createComment } from '@okr/comment-util';
import { getInvitationIndex, getLockCommentKey, getResponseComment, normaliseInvitation } from '@okr/relationship-invitation-util';

const PFX = '@relationship/invitation/data-access.';

@Injectable({
  providedIn: 'root'
})
export class InvitationService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly env = inject(ENV);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf:  PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf:  PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
  });

  /*-------------------------- CRUD operations --------------------------------*/
    /**
   * Create a new invitation relationship and save it to the database.
   * @param invitation the new invitation to save
   * @param currentUser the user who is creating the invitation
   * @returns the document id of the stored invitation in the database or undefined if the operation failed
   */
  public async create(invitation: InvitationModel, currentUser?: UserModel): Promise<string | undefined> {
    invitation.index = getInvitationIndex(invitation);
    if (!invitation.sentAt) invitation.sentAt = getTodayStr(DateFormat.StoreDateTime);
    return await this.firestoreService.createModel<InvitationModel>(InvitationCollection, invitation, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
  }
  
  /**
   * Retrieve an existing invitation relationship from the cached list of all invitations.
   * @param key the key of the invitation to retrieve
   * @returns the invitation as an Observable or undefined if not found
   */
  public read(key: string): Observable<InvitationModel | undefined> {
    return findByKey<InvitationModel>(this.list(), key);    
  }

  /**
   * Update an existing invitation relationship with new values.
   * @param invitation the invitation to update
   * @param currentUser the user who is updating the invitation
   * @returns the document id of the updated invitation or undefined if the operation failed
   */
  public async update(invitation: InvitationModel, currentUser?: UserModel): Promise<string | undefined> {
    const model = normaliseInvitation(invitation) as InvitationModel;   // legacy StoreDate timestamps -> StoreDateTime
    model.index = getInvitationIndex(model);
    // sentAt/respondedAt are stamped here, not entered: the form shows them read-only
    if (!model.sentAt) model.sentAt = getTodayStr(DateFormat.StoreDateTime);
    if (model.state !== 'pending' && !model.respondedAt) model.respondedAt = getTodayStr(DateFormat.StoreDateTime);
    return await this.firestoreService.updateModel<InvitationModel>(InvitationCollection, model, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
  }

  /*-------------------------- responses --------------------------------*/
  /**
   * Record an invitee's answer: stamp `respondedAt` with the current StoreDateTime, write the new
   * state and append the answer as a comment on `invitation.<okey>`. This is the ONLY way a state
   * change should be written — every caller (invitation list, invitees accordion, invitations
   * section, calevent action sheet) routes through here so the answer history stays complete.
   *
   * A locked invitation is refused: the organiser has frozen the responses. Callers are expected
   * to have told the user already (see `isLocked`); returning false keeps this safe as a last line
   * of defence rather than a silent write.
   *
   * @param invitation the invitation being answered
   * @param newState   the invitee's answer
   * @param currentUser the responding user — also the comment's author
   * @param note       optional free text the invitee added to their answer
   * @returns true when the answer was written, false when the invitation is locked
   */
  public async respond(invitation: InvitationModel, newState: InvitationState, currentUser?: UserModel, note?: string): Promise<boolean> {
    if (invitation.isLocked) return false;
    invitation.state = newState;
    invitation.respondedAt = getTodayStr(DateFormat.StoreDateTime);
    // deliberately without currentUser: that would add FirestoreService's generic 'record changed'
    // comment on top of the specific one below, and every answer would show up twice in the thread
    await this.update(invitation);
    await this.addResponseComment(invitation, getResponseComment(newState, note), currentUser);
    return true;
  }

  /**
   * Lock or release every invitation of one calevent in a single batch, and record the change as a
   * comment on each of them. Locking is an organiser action (see the calevent action sheet); the
   * flag itself lives per invitation so a query never has to join back to the event.
   *
   * @param invitations every invitation of the calevent — already filtered by the caller
   * @param isLocked    true to freeze the responses, false to release them
   * @param currentUser the organiser performing the change
   * @returns the number of invitations whose lock state actually changed
   */
  public async setLocked(invitations: InvitationModel[], isLocked: boolean, currentUser?: UserModel): Promise<number> {
    const changed = invitations.filter(inv => (inv.isLocked ?? false) !== isLocked);
    if (changed.length === 0) return 0;
    const batch = this.firestoreService.getBatch();
    const authorName = currentUser ? getFullName(currentUser.firstName, currentUser.lastName) : '';
    for (const invitation of changed) {
      batch.update(doc(this.firestoreService.firestore, `${InvitationCollection}/${invitation.okey}`), { isLocked });
      if (!currentUser) continue;
      // the comment rides along in the same batch: a lock that is not traceable is worse than none
      const comment = createComment(currentUser.personKey, authorName, getLockCommentKey(isLocked),
        `${InvitationModelName}.${invitation.okey}`, this.env.tenantId);
      batch.set(doc(this.firestoreService.firestore, `${CommentCollection}/${comment.okey}`), removeKeyFromOkrModel(structuredClone(comment)));
    }
    await batch.commit();
    return changed.length;
  }

  /**
   * Appends one comment to an invitation. Silently does nothing without a current user or before
   * the invitation exists — a response by an anonymous caller is already impossible upstream.
   */
  private async addResponseComment(invitation: InvitationModel, description: string, currentUser?: UserModel): Promise<void> {
    if (!currentUser || !invitation.okey) return;
    const comment = createComment(currentUser.personKey, getFullName(currentUser.firstName, currentUser.lastName),
      description, `${InvitationModelName}.${invitation.okey}`, this.env.tenantId);
    await this.firestoreService.saveComment(comment);
  }

  /**
   * Hard-delete an existing invitation relationship (admin only, see InvitationList).
   * An invitation is never shared across tenants, so there is nothing to detach or archive.
   * @param invitation the invitation to delete
   * @returns a promise that resolves when the invitation is deleted
   */
  public async delete(invitation: InvitationModel): Promise<void> {
    await this.firestoreService.deleteObject(InvitationCollection, invitation.okey, this.i18n.delete_conf());
  }

  /*-------------------------- LIST  --------------------------------*/
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<InvitationModel[]> {
    return this.firestoreService.searchData<InvitationModel>(InvitationCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }

  /*-------------------------- export --------------------------------*/
  public export(): void {
    console.log('InvitationService.export: not yet implemented.');
  }
}
