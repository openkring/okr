import { inject, Injectable } from '@angular/core';
import { map, Observable, of } from 'rxjs';

import { getCategoryAbbreviation, OrgTypes } from '@bk2/shared/categories';
import { ENV } from '@bk2/shared/config';
import { AddressCollection, AddressModel, OrgCollection, OrgModel, UserModel } from '@bk2/shared/models';
import { addIndexElement, findByKey, getSystemQuery } from '@bk2/shared/util-core';
import { FirestoreService } from '@bk2/shared/data-access';

@Injectable({
  providedIn: 'root'
})
export class OrgService  {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new organization in the database.
   * @param org the OrgModel to store in the database. It must contain a valid bkey.
   * @param currentUser the current user who performs the operation
   * @returns the unique key of the created organization or undefined if the operation failed
   */
  public async create(org: OrgModel, currentUser?: UserModel): Promise<string | undefined> {
    org.index = this.getSearchIndex(org);
    return await this.firestoreService.createModel<OrgModel>(OrgCollection, org, '@subject.org.operation.create', currentUser);
  }
  
  /**
   * Returns the org with the given unique key.
   * @param key the unique key of the org in the database
   * @returns an Observable of the org or undefined if not found
   */
  public read(key: string): Observable<OrgModel | undefined> {
    return findByKey<OrgModel>(this.list(), key);
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

  /**
   * Updates an existing organization in the database.
   * @param org the OrgModel to update
   * @param currentUser the current user who performs the operation
   * @param confirmMessage the message to display in the confirmation dialog
   * @returns the unique key of the updated organization or undefined if the operation failed
   */
  public async update(org: OrgModel, currentUser?: UserModel, confirmMessage = '@subject.org.operation.update'): Promise<string | undefined> {
    org.index = this.getSearchIndex(org);
    return await this.firestoreService.updateModel<OrgModel>(OrgCollection, org, false, confirmMessage, currentUser);
  }

  /**
   * Deletes an organization from the database.
   * @param org the OrgModel to delete
   * @param currentUser the current user who performs the operation
   * @returns a Promise that resolves when the operation is complete
   */
  public async delete(org: OrgModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<OrgModel>(OrgCollection, org, '@subject.org.operation.delete', currentUser);
  }

  /*-------------------------- LIST / QUERY  --------------------------------*/
  /**
   * Lists all organizations in the database.
   * @param orderBy the name of the field to order by
   * @param sortOrder the order direction (asc or desc)
   * @returns an Observable of the list of organizations
   */
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<OrgModel[]> {
    return this.firestoreService.searchData<OrgModel>(OrgCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }

  /**
   * This function retrieves all addresses associated with a given organization.
   * The addresses are returned as an Observable array of AddressModel.
   * @param org the organization for which to list addresses
   * @returns an Observable array of AddressModel
   */
  public listAddresses(org: OrgModel): Observable<AddressModel[]> {
    const _collection = `${OrgCollection}/${org.bkey}/${AddressCollection}`;
    return this.firestoreService.searchData<AddressModel>(_collection, getSystemQuery(this.env.tenantId));
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
