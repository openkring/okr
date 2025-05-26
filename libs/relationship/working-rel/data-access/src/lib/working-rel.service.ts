import { Injectable, inject } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import { ModalController, ToastController } from '@ionic/angular/standalone';

import { ENV, FIRESTORE } from '@bk2/shared/config';
import { WorkingRelCollection, WorkingRelModel, PersonModel, OrgModel } from '@bk2/shared/models';
import { createModel, getSystemQuery, searchData, updateModel } from '@bk2/shared/data-access';
import { selectDate } from '@bk2/shared/ui';
import { convertDateFormatToString, DateFormat, isOrg, isPerson } from '@bk2/shared/util';
import { OrgSelectModalComponent, PersonSelectModalComponent } from '@bk2/shared/feature';

import { AppStore } from '@bk2/auth/feature';
import { saveComment } from '@bk2/comment/util';

import { convertFormToNewWorkingRel, getWorkingRelSearchIndex, getWorkingRelSearchIndexInfo, isWorkingRel, WorkingRelNewFormModel } from '@bk2/working-rel/util';
import { WorkingRelEditModalComponent, WorkingRelNewModalComponent } from '@bk2/working-rel/feature';

@Injectable({
    providedIn: 'root'
})
export class WorkingRelService {
  private readonly env = inject(ENV);
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  private readonly tenantId = this.env.owner.tenantId;

  /*-------------------------- CRUD operations on workingRel --------------------------------*/
  /**
   * Create a new workingRel and save it to the database.
   * @param workingRel the new workingRel to save
   * @returns the document id of the stored workingRel in the database
   */
  public async create(workingRel: WorkingRelModel): Promise<string> {
    workingRel.index = this.getSearchIndex(workingRel);
    const _key = await createModel(this.firestore, WorkingRelCollection, workingRel, this.tenantId, '@workingRel.operation.create', this.toastController);
    await saveComment(this.firestore, this.tenantId, this.appStore.currentUser(), WorkingRelCollection, _key, '@comment.operation.initial.conf');  
    return _key;
  }

  /**
   * Retrieve an existing workingRel from the cached list of all workingRels.
   * @param key the key of the workingRel to retrieve
   * @returns the workingRel as an Observable
   */
  public read(key: string): Observable<WorkingRelModel | undefined> {
    if (!key || key.length === 0) return of(undefined);
    return this.list().pipe(
      map((workingRels: WorkingRelModel[]) => {
        return workingRels.find((workingRel: WorkingRelModel) => workingRel.bkey === key);
      }));
  }
    
  /**
   * Update an existing workingRel with new values.
   * @param workingRel the workingRel to update
   * @param i18nPrefix the prefix for the i18n key to use for the toast message (can be used for a delete confirmation)
   */
  public async update(workingRel: WorkingRelModel, confirmMessage = '@workingRel.operation.update'): Promise<void> {
    workingRel.index = this.getSearchIndex(workingRel);
    await updateModel(this.firestore, WorkingRelCollection, workingRel, confirmMessage, this.toastController);
  }

  public async delete(workingRel: WorkingRelModel): Promise<void> {
    workingRel.isArchived = true;
    await this.update(workingRel, `@workingRel.operation.delete`);
  }

 /**
   * Show a modal to add a new workingRel.
   * @param subject first person to be related
   * @param object second person to be related
   */
  public async add(subject?: PersonModel, object?: OrgModel): Promise<void> {
    const _subject = structuredClone(subject ?? await this.selectPerson());
    const _object = structuredClone(object ?? await this.selectOrg());
    if (subject && object) {
      const _modal = await this.modalController.create({
        component: WorkingRelNewModalComponent,
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
        const _workingRel = convertFormToNewWorkingRel(data as WorkingRelNewFormModel, this.tenantId);
        await this.create(_workingRel);
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

  public async selectOrg(): Promise<OrgModel | undefined> {
    const _modal = await this.modalController.create({
      component: OrgSelectModalComponent,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: '',
        currentUser: this.appStore.currentUser()
      }
    });
    _modal.present();
    const { data, role } = await _modal.onWillDismiss();
    if (role === 'confirm') {
      if (isOrg(data, this.env.owner.tenantId)) {
        return data;
      }
    }
    return undefined;
  }

  /**
   * Show a modal to edit an existing workingRel.
   * @param workingRel the workingRel to edit
   */
  public async edit(workingRel?: WorkingRelModel): Promise<void> {
    let _workingRel = workingRel;
    if (!_workingRel) {
      _workingRel = new WorkingRelModel(this.tenantId);
    }
    
    const _modal = await this.modalController.create({
      component: WorkingRelEditModalComponent,
      componentProps: {
        workingRel: _workingRel,
        currentUser: this.appStore.currentUser()
      }
    });
    _modal.present();
    await _modal.onWillDismiss();
    const { data, role } = await _modal.onDidDismiss();
    if (role === 'confirm') {
      if (isWorkingRel(data, this.tenantId)) {
        await (!data.bkey ? this.create(data) : this.update(data));
      }
    }  }

  /**
   * End an existing workingRel.
   * @param workingRel the workingRel to delete, its bkey needs to be valid so that we can find it in the database. 
   */
  public async end(workingRel: WorkingRelModel): Promise<void> {
    const _date = await selectDate(this.modalController);
    if (!_date) return;
    await this.endWorkingRelByDate(workingRel, convertDateFormatToString(_date, DateFormat.IsoDate, DateFormat.StoreDate, false));    
  }

  /**
   * End an existing workingRel relationship by setting its validTo date.
   * @param workingRel the workingRel to end
   * @param validTo the end date of the workingRel
   */
  public async endWorkingRelByDate(workingRel: WorkingRelModel, validTo: string): Promise<void> {
    if (workingRel.validTo.startsWith('9999') && validTo && validTo.length === 8) {
      workingRel.validTo = validTo;
      await this.update(workingRel);
      await saveComment(this.firestore, this.tenantId, this.appStore.currentUser(), WorkingRelCollection, workingRel.bkey, '@comment.message.workingRel.deleted');  
    }
  }

  /*-------------------------- list --------------------------------*/
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<WorkingRelModel[]> {
    return searchData<WorkingRelModel>(this.firestore, WorkingRelCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }

  /**
   * List the working relationships of a person
   * @param personKey the document id of the person to look its relationships up
   * @returns an Observable array of the selected working relationships
   */
  public listWorkingRelsOfPerson(personKey: string): Observable<WorkingRelModel[]> {
    if (!personKey || personKey.length === 0) return of([]);
    return this.list().pipe(
      map((workingRels: WorkingRelModel[]) => {
        return workingRels.filter((workingRel: WorkingRelModel) =>
          (workingRel.subjectKey === personKey));
      })
    );
  }

  /**
   * List the workers of an organization
   * @param orgKey the document id of the org to look its relationships up
   * @returns an Observable array of the selected working relationships
   */
  public listWorkersOfOrg(orgKey: string): Observable<WorkingRelModel[]> {
    if (!orgKey || orgKey.length === 0) return of([]);
    return this.list().pipe(
      map((workingRels: WorkingRelModel[]) => {
        return workingRels.filter((workingRel: WorkingRelModel) =>
          (workingRel.objectKey === orgKey));
      })
    );
  }

  /*-------------------------- export --------------------------------*/
  public export(): void {
    console.log('WorkingRelService.export: not yet implemented.');
  }
 
  /*-------------------------- search index --------------------------------*/
  public getSearchIndex(workingRel: WorkingRelModel): string {
    return getWorkingRelSearchIndex(workingRel);
  }

  public getSearchIndexInfo(): string {
    return getWorkingRelSearchIndexInfo();
  }
}
