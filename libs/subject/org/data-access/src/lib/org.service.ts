import { inject, Injectable } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { collection, query } from 'firebase/firestore';
import { collectionData } from 'rxfire/firestore';
import { map, Observable, of } from 'rxjs';

import { getCategoryAbbreviation, OrgTypes } from '@bk2/shared/categories';
import { ENV, FIRESTORE } from '@bk2/shared/config';
import { AddressCollection, AddressModel, OrgCollection, OrgModel, UserModel } from '@bk2/shared/models';
import { addIndexElement, createModel, getSystemQuery, searchData, updateModel } from '@bk2/shared/util';

import { saveComment } from '@bk2/comment/util';

@Injectable({
  providedIn: 'root'
})
export class OrgService  {
  private readonly env = inject(ENV);
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);

  private readonly tenantId = this.env.owner.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
  public async create(org: OrgModel, currentUser?: UserModel): Promise<string> {
    org.index = this.getSearchIndex(org);
    const _key = await createModel(this.firestore, OrgCollection, org, this.tenantId, '@subject.org.operation.create', this.toastController);
    await saveComment(this.firestore, this.tenantId, currentUser, OrgCollection, _key, '@comment.operation.initial.conf');
    return _key;
  }
  
  /**
   * Returns the org with the given unique key.
   * @param key the unique key of the org in the database
   * @returns an Observable of the org or undefined if not found
   */
  public read(key: string): Observable<OrgModel | undefined> {
    if (!key || key.length === 0) return of(undefined);
    return this.list().pipe(
      map((orgs: OrgModel[]) => {
        return orgs.find((org: OrgModel) => org.bkey === key);
      }));
  }

 /**
   * Finds the first org that matches a given bexioId.
   * To avoid caching issues, we query on the locally cached list (from list()) and do not query the server.
   * @param bexioId the id of the org within Bexio
   * @returns an Observable of the matching org or undefined
   */
  public readOrgByBexioId(bexioId: string): Observable<OrgModel | undefined> {
    if (!bexioId || bexioId.length === 0) return of(undefined);
    return this.list().pipe(
      map((orgs: OrgModel[]) => {
        return orgs.find((org: OrgModel) => org.bexioId === bexioId);
      }));
  }

  public async update(org: OrgModel, confirmMessage = '@subject.org.operation.update'): Promise<void> {
    org.index = this.getSearchIndex(org);
    await updateModel(this.firestore, OrgCollection, org, confirmMessage, this.toastController);    
  }

  public async delete(org: OrgModel): Promise<void> {
    org.isArchived = true;
    await this.update(org, `@subject.org.operation.delete`);
  }

  /*-------------------------- LIST / QUERY  --------------------------------*/
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<OrgModel[]> {
    return searchData<OrgModel>(this.firestore, OrgCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }

  public listAddresses(org: OrgModel): Observable<AddressModel[]> {
    const _ref = query(collection(this.firestore, `${OrgCollection}/${org.bkey}/${AddressCollection}`));
    return collectionData(_ref, { idField: 'bkey' }) as Observable<AddressModel[]>;
  }

  /*-------------------------- search index --------------------------------*/
  /**
   * Create an index entry for a given organization based on its values.
   * @param org the organization to generate the index for 
   * @returns the index string
   */
  public getSearchIndex(org: OrgModel): string {
    let _index = '';
    _index = addIndexElement(_index, 'n', org.name);
    _index = addIndexElement(_index, 'c', org.fav_city);
    _index = addIndexElement(_index, 'ot', getCategoryAbbreviation(OrgTypes, org.type));
    _index = addIndexElement(_index, 'dof', org.dateOfFoundation);
    return _index;
  }

  /**
   * Returns a string explaining the structure of the index.
   * This can be used in info boxes on the GUI.
   */
  public getSearchIndexInfo(): string {
    return 'n:name c:city ot:orgType dof:dateOfFoundation';
  }
}
