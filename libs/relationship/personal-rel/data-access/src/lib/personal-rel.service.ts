import { inject, Injectable } from '@angular/core';
import { map, Observable, of } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import { PersonalRelCollection, PersonalRelModel, UserModel } from '@bk2/shared-models';
import { findByKey, getFullName, getSystemQuery, removeDuplicatesFromArray } from '@bk2/shared-util-core';

import { getPersonalRelIndex } from '@bk2/relationship-personal-rel-util';
import { ActivityService } from '@bk2/activity-data-access';
import { PFX } from './scope';

@Injectable({
    providedIn: 'root'
})
export class PersonalRelService {
  private readonly env = inject(ENV);
  private readonly activityService = inject(ActivityService);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'operation.create.conf',
    create_error: PFX + 'operation.create.error',
    update_conf:  PFX + 'operation.update.conf',
    update_error: PFX + 'operation.update.error',
    delete_conf:  PFX + 'operation.delete.conf',
    delete_error: PFX + 'operation.delete.error',
    end_conf:     PFX + 'operation.end.conf',
    end_error:    PFX + 'operation.end.error',
  });

  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD operations on personalRel --------------------------------*/
  /**
   * Create a new personalRel and save it to the database.
   * @param personalRel the new personalRel to save
   * @param currentUser the current user performing the operation
   * @returns the document id of the stored personalRel in the database or undefined if the operation failed
   */
  public async create(personalRel: PersonalRelModel, currentUser?: UserModel): Promise<string | undefined> {
    personalRel.index = getPersonalRelIndex(personalRel);
    const key = await this.firestoreService.createModel<PersonalRelModel>(PersonalRelCollection, personalRel, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
    const payload = `${key}: ${getFullName(personalRel.subjectFirstName, personalRel.subjectLastName)} ${personalRel.type} ${getFullName(personalRel.objectFirstName, personalRel.objectLastName)}`;
    void this.activityService.log('personalrel', 'create', currentUser, payload);
    return key;
  }

  /**
   * Retrieve an existing personalRel from the cached list of all personalRels.
   * @param key the key of the personalRel to retrieve
   * @returns the personalRel as an Observable
   */
  public read(key: string): Observable<PersonalRelModel | undefined> {
    return findByKey<PersonalRelModel>(this.list(), key);
  }

  /**
   * Update an existing personalRel with new values.
   * @param personalRel the personalRel to update
   * @param currentUser the current user performing the operation
   * @returns the document id of the updated personalRel or undefined if the operation failed
   */
  public async update(personalRel: PersonalRelModel, currentUser?: UserModel): Promise<string | undefined> {
    personalRel.index = getPersonalRelIndex(personalRel);
    const key = await this.firestoreService.updateModel<PersonalRelModel>(PersonalRelCollection, personalRel, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    const payload = `${key}: ${getFullName(personalRel.subjectFirstName, personalRel.subjectLastName)} ${personalRel.type} ${getFullName(personalRel.objectFirstName, personalRel.objectLastName)}`;
    void this.activityService.log('personalrel', 'update', currentUser, payload);
    return key;
  }

  public async delete(personalRel: PersonalRelModel, currentUser?: UserModel): Promise<void> {
    const payload = `${personalRel.bkey}: ${getFullName(personalRel.subjectFirstName, personalRel.subjectLastName)} ${personalRel.type} ${getFullName(personalRel.objectFirstName, personalRel.objectLastName)}`;
    await this.firestoreService.deleteModel<PersonalRelModel>(PersonalRelCollection, personalRel, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
    void this.activityService.log('personalrel', 'delete', currentUser, payload);
  }

  /**
   * End an existing personal relationship by setting its validTo date.
   * @param personalRel the personalRel to end
   * @param validTo the end date of the personalRel
   * @param currentUser the current user performing the operation
   * @returns the document id of the updated personalRel or undefined if the operation failed
   */
  public async endPersonalRelByDate(personalRel: PersonalRelModel, validTo: string, currentUser?: UserModel): Promise<string | undefined> {
    if (personalRel.validTo.startsWith('9999') && validTo && validTo.length === 8) {
      personalRel.validTo = validTo;
      return await this.firestoreService.updateModel<PersonalRelModel>(PersonalRelCollection, personalRel, false, this.i18n.end_conf(), this.i18n.end_error(), currentUser);
    }
    return undefined;
  }

  /*-------------------------- list --------------------------------*/
  public list(orderBy = 'subjectLastName', sortOrder = 'asc'): Observable<PersonalRelModel[]> {
    return this.firestoreService.searchData<PersonalRelModel>(PersonalRelCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }

  /**
   * List the personal relationships of a person. The person can be the subject or the object of the relationship.
   * We are not quering the database, but using the cached full list of personal relationships.
   * @param personKey the document id of the person to look its relationships up
   * @returns an Observable array of the selected personal relationships
   */
  public listPersonalRelsOfPerson(personKey: string): Observable<PersonalRelModel[]> {
    if (!personKey || personKey.length === 0) return of([]);
    return this.list().pipe(
      map((personalRels: PersonalRelModel[]) => {
        const _filteredRels = personalRels.filter((personalRel: PersonalRelModel) => {
          return (personalRel.subjectKey === personKey || personalRel.objectKey === personKey);
        });
        return removeDuplicatesFromArray<PersonalRelModel>(_filteredRels, 'bkey');
      })
    );
  }

  /*-------------------------- export --------------------------------*/
  public export(): void {
    console.log('PersonalRelService.export: not yet implemented.');
  }
}
