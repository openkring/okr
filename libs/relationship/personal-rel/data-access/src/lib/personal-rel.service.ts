import { Injectable, inject } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import { ToastController } from '@ionic/angular/standalone';

import { ENV, FIRESTORE } from '@bk2/shared/config';
import { PersonalRelCollection, PersonalRelModel, UserModel } from '@bk2/shared/models';
import { createModel, getSystemQuery, removeDuplicatesFromArray, searchData, updateModel } from '@bk2/shared/util';

import { saveComment } from '@bk2/comment/util';

import { getPersonalRelSearchIndex, getPersonalRelSearchIndexInfo } from '@bk2/personal-rel/util';

@Injectable({
    providedIn: 'root'
})
export class PersonalRelService {
  private readonly env = inject(ENV);
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);

  private readonly tenantId = this.env.owner.tenantId;

  /*-------------------------- CRUD operations on personalRel --------------------------------*/
  /**
   * Create a new personalRel and save it to the database.
   * @param personalRel the new personalRel to save
   * @returns the document id of the stored personalRel in the database
   */
  public async create(personalRel: PersonalRelModel, currentUser?: UserModel): Promise<string> {
    personalRel.index = this.getSearchIndex(personalRel);
    const _key = await createModel(this.firestore, PersonalRelCollection, personalRel, this.tenantId, '@personalRel.operation.create', this.toastController);
    await saveComment(this.firestore, this.tenantId, currentUser, PersonalRelCollection, _key, '@comment.operation.initial.conf');  
    return _key;
  }

  /**
   * Retrieve an existing personalRel from the cached list of all personalRels.
   * @param key the key of the personalRel to retrieve
   * @returns the personalRel as an Observable
   */
  public read(key: string): Observable<PersonalRelModel | undefined> {
    if (!key || key.length === 0) return of(undefined);
    return this.list().pipe(
      map((personalRels: PersonalRelModel[]) => {
        return personalRels.find((personalRel: PersonalRelModel) => personalRel.bkey === key);
      }));
  }

  /**
   * Update an existing personalRel with new values.
   * @param personalRel the personalRel to update
   * @param i18nPrefix the prefix for the i18n key to use for the toast message (can be used for a delete confirmation)
   */
  public async update(personalRel: PersonalRelModel, confirmMessage = '@personalRel.operation.update'): Promise<void> {
    personalRel.index = this.getSearchIndex(personalRel);
    await updateModel(this.firestore, PersonalRelCollection, personalRel, confirmMessage, this.toastController);
  }

  public async delete(personalRel: PersonalRelModel): Promise<void> {
    personalRel.isArchived = true;
    await this.update(personalRel, `@personalRel.operation.delete`);
  }

  /**
   * End an existing personal relationship by setting its validTo date.
   * @param personalRel the personalRel to end
   * @param validTo the end date of the personalRel
   */
  public async endPersonalRelByDate(personalRel: PersonalRelModel, validTo: string, currentUser?: UserModel): Promise<void> {
    if (personalRel.validTo.startsWith('9999') && validTo && validTo.length === 8) {
      personalRel.validTo = validTo;
      await this.update(personalRel);
      await saveComment(this.firestore, this.tenantId, currentUser, PersonalRelCollection, personalRel.bkey, '@comment.message.personalRel.deleted');  
    }
  }

  /*-------------------------- list --------------------------------*/
  public list(orderBy = 'subjectLastName', sortOrder = 'asc'): Observable<PersonalRelModel[]> {
    return searchData<PersonalRelModel>(this.firestore, PersonalRelCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
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
 
  /*-------------------------- search index --------------------------------*/
  public getSearchIndex(personalRel: PersonalRelModel): string {
    return getPersonalRelSearchIndex(personalRel);
  }

  public getSearchIndexInfo(): string {
    return getPersonalRelSearchIndexInfo();
  }
}
