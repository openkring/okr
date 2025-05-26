import { Injectable, inject } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import { ModalController, ToastController } from '@ionic/angular/standalone';

import { ENV, FIRESTORE } from '@bk2/shared/config';
import { PersonalRelCollection, PersonalRelModel, PersonModel } from '@bk2/shared/models';
import { createModel, getSystemQuery, searchData, updateModel } from '@bk2/shared/data-access';
import { selectDate } from '@bk2/shared/ui';
import { convertDateFormatToString, DateFormat, isPerson, isPersonalRel, removeDuplicatesFromArray } from '@bk2/shared/util';
import { PersonSelectModalComponent } from '@bk2/shared/feature';

import { AppStore } from '@bk2/auth/feature';
import { saveComment } from '@bk2/comment/util';

import { convertFormToNewPersonalRel, getPersonalRelSearchIndex, getPersonalRelSearchIndexInfo, PersonalRelNewFormModel } from '@bk2/personal-rel/util';
import { PersonalRelEditModalComponent, PersonalRelNewModalComponent } from '@bk2/personal-rel/feature';

@Injectable({
    providedIn: 'root'
})
export class PersonalRelService {
  private readonly env = inject(ENV);
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  private readonly tenantId = this.env.owner.tenantId;

  /*-------------------------- CRUD operations on personalRel --------------------------------*/
  /**
   * Create a new personalRel and save it to the database.
   * @param personalRel the new personalRel to save
   * @returns the document id of the stored personalRel in the database
   */
  public async create(personalRel: PersonalRelModel): Promise<string> {
    personalRel.index = this.getSearchIndex(personalRel);
    const _key = await createModel(this.firestore, PersonalRelCollection, personalRel, this.tenantId, '@personalRel.operation.create', this.toastController);
    await saveComment(this.firestore, this.tenantId, this.appStore.currentUser(), PersonalRelCollection, _key, '@comment.operation.initial.conf');  
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
   * Show a modal to add a new personalRel.
   * @param subject first person to be related
   * @param object second person to be related
   */
  public async add(subject?: PersonModel, object?: PersonModel): Promise<void> {
    const _subject = structuredClone(subject ?? await this.selectPerson());
    const _object = structuredClone(object ?? await this.selectPerson());
    if (_subject && _object) {
      const _modal = await this.modalController.create({
        component: PersonalRelNewModalComponent,
        cssClass: 'small-modal',
        componentProps: {
          subject: _subject,
          object: _object,
          currentUser: this.appStore.currentUser()
        }
      });
      _modal.present();
      const { data, role } = await _modal.onDidDismiss();
      if (role === 'confirm') {
        const _personalRel = convertFormToNewPersonalRel(data as PersonalRelNewFormModel, this.tenantId);
        await this.create(_personalRel);
      }
    }
  } 
  
  public async selectPerson(): Promise<PersonModel | undefined> {
    const _modal = await this.modalController.create({
      component: PersonSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.appStore.currentUser()
      }
    });
    _modal.present();
    const { data, role } = await _modal.onWillDismiss();
    if (role === 'confirm') {
      if (isPerson(data, this.env.owner.tenantId)) {
        return data;
      }
    }
    return undefined;
  }

  /**
   * Show a modal to edit an existing personalRel.
   * @param personalRel the personalRel to edit
   */
  public async edit(personalRel?: PersonalRelModel): Promise<void> {
    let _personalRel = personalRel;
    if (!_personalRel) {
      _personalRel = new PersonalRelModel(this.tenantId);
    }
    
    const _modal = await this.modalController.create({
      component: PersonalRelEditModalComponent,
      componentProps: {
        personalRel: _personalRel,
        currentUser: this.appStore.currentUser()
      }
    });
    _modal.present();
    await _modal.onWillDismiss();
    const { data, role } = await _modal.onDidDismiss();
    if (role === 'confirm') {
      if (isPersonalRel(data, this.tenantId)) {
        await (!data.bkey ? this.create(data) : this.update(data));
      }
    }  }

  /**
   * End an existing personalRel.
   * @param personalRel the personalRel to delete, its bkey needs to be valid so that we can find it in the database. 
   */
  public async end(personalRel: PersonalRelModel): Promise<void> {
    const _date = await selectDate(this.modalController);
    if (!_date) return;
    await this.endPersonalRelByDate(personalRel, convertDateFormatToString(_date, DateFormat.IsoDate, DateFormat.StoreDate, false));    
  }

  /**
   * End an existing personal relationship by setting its validTo date.
   * @param personalRel the personalRel to end
   * @param validTo the end date of the personalRel
   */
  public async endPersonalRelByDate(personalRel: PersonalRelModel, validTo: string): Promise<void> {
    if (personalRel.validTo.startsWith('9999') && validTo && validTo.length === 8) {
      personalRel.validTo = validTo;
      await this.update(personalRel);
      await saveComment(this.firestore, this.tenantId, this.appStore.currentUser(), PersonalRelCollection, personalRel.bkey, '@comment.message.personalRel.deleted');  
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
