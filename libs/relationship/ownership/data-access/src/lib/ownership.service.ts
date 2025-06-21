import { Injectable, inject } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import { ToastController } from '@ionic/angular/standalone';

import { ENV, FIRESTORE } from '@bk2/shared/config';
import { ModelType, OwnershipCollection, OwnershipModel, UserModel } from '@bk2/shared/models';
import { createModel, findByKey, getSystemQuery, searchData, updateModel } from '@bk2/shared/util';

import { saveComment } from '@bk2/comment/util';

import { getOwnershipSearchIndex, getOwnershipSearchIndexInfo } from '@bk2/ownership/util';

@Injectable({
    providedIn: 'root'
})
export class OwnershipService {
  private readonly env = inject(ENV);
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);

  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD operations Ownership --------------------------------*/
  /**
   * Create a new ownership and save it to the database.
   * @param ownership the new ownership to save
   * @returns the document id of the stored ownership in the database
   */
  public async create(ownership: OwnershipModel, currentUser?: UserModel): Promise<string> {
    ownership.index = this.getSearchIndex(ownership);
    const _key = await createModel(this.firestore, OwnershipCollection, ownership, this.tenantId, '@ownership.operation.create', this.toastController);
    await saveComment(this.firestore, this.tenantId, currentUser, OwnershipCollection, _key, '@comment.operation.initial.conf');  
    return _key;    
  }

  /**
   * Retrieve an existing ownership from the database.
   * @param key the key of the ownership to retrieve
   * @returns the ownership as an Observable
   */
  public read(key: string): Observable<OwnershipModel | undefined> {
    return findByKey<OwnershipModel>(this.list(), key);    
  }

  /**
   * Update an existing ownership with new values.
   * @param ownership the ownership to update
   * @param i18nPrefix the prefix for the i18n key to use for the toast message (can be used for a delete confirmation)
   */
  public async update(ownership: OwnershipModel, confirmMessage = '@ownership.operation.update'): Promise<void> {
    ownership.index = this.getSearchIndex(ownership);
    await updateModel(this.firestore, OwnershipCollection, ownership, confirmMessage, this.toastController);
  }

  public async delete(ownership: OwnershipModel): Promise<void> {
    ownership.isArchived = true;
    await this.update(ownership, `@ownership.operation.delete`);
  }

  /**
   * End an existing ownership by setting its validTo date.
   * @param ownership the ownership to end
   * @param validTo the end date of the ownership
   */
  public async endOwnershipByDate(ownership: OwnershipModel, validTo: string, currentUser?: UserModel): Promise<void> {
    if (ownership.validTo.startsWith('9999') && validTo && validTo.length === 8) {
      ownership.validTo = validTo;
      await this.update(ownership);
      await saveComment(this.firestore, this.tenantId, currentUser, OwnershipCollection, ownership.bkey, '@comment.message.ownership.deleted');  
    }
  }

/*   public async createNewOwnershipFromSubject(subjectKey: string): Promise<void> {
    const _subject = await firstValueFrom(this.dataService.readModel(CollectionNames.Subject, subjectKey));
    if (isSubject(_subject)) {
      const _resource = await this.selectResource();
      if (!_resource) return;

      const _date = await selectDate(this.modalController);
      if (!_date) return;

      const _validFrom = convertDateFormatToString(_date, DateFormat.IsoDate, DateFormat.StoreDate);

      const _ownership = newResourceOwnership(_resource, _subject, _validFrom);
      const _key = await this.saveNewOwnership(_ownership);
      await this.saveComment(CollectionNames.Ownership, _key, '@comment.operation.initial.conf');   
    } else {
      warn('OwnershipService.createNewOwnershipFromSubject: no subject ${subjectKey} found.');
    } 
  }
 */
/*   public async createNewOwnershipFromResource(resourceKey: string): Promise<void> {
    const _resource = await firstValueFrom(this.dataService.readModel(CollectionNames.Resource, resourceKey));
    if (isResource(_resource)) {
      const _owner = await this.selectOwner();
      if (!_owner) return;

      const _date = await selectDate(this.modalController);    
      if (!_date) return;
      
      const _validFrom = convertDateFormatToString(_date, DateFormat.IsoDate, DateFormat.StoreDate);

      const _ownership = newResourceOwnership(_resource, _owner, _validFrom);
      const _key = await this.saveNewOwnership(_ownership);
      await this.saveComment(CollectionNames.Ownership, _key, '@comment.operation.initial.conf');   
    } else {
      warn('OwnershipService.createNewOwnershipFromResource: no resource ${resourceKey} found.');
    } 
  }

  /*-------------------------- LIST / QUERY  --------------------------------*/
  public list(orderBy = 'validFrom', sortOrder = 'desc'): Observable<OwnershipModel[]> {
    return searchData<OwnershipModel>(this.firestore, OwnershipCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }

  /**
   * List the ownerships for a given owner (person or organization).
   * @param ownerKey the given subject to list its ownerships for.
   * @returns a list of the owner's ownerships as an Observable
   */
  public listOwnershipsOfOwner(ownerKey: string, modelType: ModelType): Observable<OwnershipModel[]> {
    if (!ownerKey || ownerKey.length === 0) return of([]);

    return this.list().pipe(
      map((ownerships: OwnershipModel[]) => {
        return ownerships.filter((ownership: OwnershipModel) => ownership.ownerKey === ownerKey && ownership.ownerModelType === modelType);
      }));
  }

  /**
   * Select an owner from the list of subjects to be used in a new ownership. 
   * Owner can be any subject (Person, Org, Group).
   * @returns the subject that was selected or undefined if no subject was selected
   */
/*   public async selectOwner(): Promise<SubjectModel | undefined> {
    const _modal = await this.modalController.create({
      component: BkModelSelectComponent,
      componentProps: {
        bkListType: ListType.SubjectAll
      }
    });
    _modal.present();
    const { data, role } = await _modal.onDidDismiss();
    if (role === 'confirm') {
      return isSubject(data) ? data : undefined;
    }
    return undefined;
  }
 */
  /**
   * Select a resource from the list of all resources to be used in a new ownership. 
   * @returns the resource that was selected or undefined if no resource was selected
   */
/*     public async selectResource(): Promise<ResourceModel | undefined> {
      const _modal = await this.modalController.create({
        component: BkModelSelectComponent,
        componentProps: {
          bkListType: ListType.ResourceAll
        }
      });
      _modal.present();
      const { data, role } = await _modal.onDidDismiss();
      if (role === 'confirm') {
        return isResource(data) ? data : undefined;
      }
      return undefined;
    }
 */

  /*-------------------------- export --------------------------------*/
  public async export(): Promise<void> {
    //const _index = await this.selectExportType();
    //if (_index === undefined) return;
    //if (_index === 0) {
      console.log('OwnershipService.export: export are not implemented yet.');
      //await exportXlsx(this.filteredItems(), 'all', 'all');
    //}
  }

 /*  private async selectExportType(): Promise<number | undefined> {
    const _modal = await this.modalController.create({
      component: BkLabelSelectModalComponent,
      componentProps: {
        labels: [
          '@ownership.select.raw', 
          '@ownership.select.lockers', 
        ],
        icons: ['list-circle-outline', 'list-outline'],
        title: '@ownership.select.title'
      }
    });
    _modal.present();
    const { data, role } = await _modal.onDidDismiss();
    if (role === 'confirm') {
      if (data !== undefined) {
        console.log('OwnershipService.selectExportType: data: ' + data);
        return parseInt(data);
      }
    }
    return undefined;
  } */

/* ---------------------- Index operations -------------------------*/
  public getSearchIndex(ownership: OwnershipModel): string {
    return getOwnershipSearchIndex(ownership);
  }

  /**
   * Returns a string explaining the structure of the index.
   * This can be used in info boxes on the GUI.
   */
  public getSearchIndexInfo(): string {
    return getOwnershipSearchIndexInfo();
  }
}
