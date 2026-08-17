import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { InvitationCollection, InvitationModel, UserModel } from '@okr/shared-models';
import { DateFormat, findByKey, getSystemQuery, getTodayStr } from '@okr/shared-util-core';

import { getInvitationIndex } from '@okr/relationship-invitation-util';

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
    if (!invitation.sentAt) invitation.sentAt = getTodayStr(DateFormat.StoreDate);
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
    invitation.index = getInvitationIndex(invitation);
    // sentAt/respondedAt are stamped here, not entered: the form shows them read-only
    if (!invitation.sentAt) invitation.sentAt = getTodayStr(DateFormat.StoreDate);
    if (invitation.state !== 'pending' && !invitation.respondedAt) invitation.respondedAt = getTodayStr(DateFormat.StoreDate);
    return await this.firestoreService.updateModel<InvitationModel>(InvitationCollection, invitation, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
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
