import { inject, Injectable } from '@angular/core';
import { map, Observable, of, take } from 'rxjs';

import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { PersonCollection, PersonModel, UserModel } from '@bk2/shared-models';
import { getFullName, getSystemQuery } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import {
  getPersonIndex,
  FindPersonDuplicatesRequest,
  FindPersonDuplicatesResponse,
  MergePersonIntoTenantRequest,
  MergePersonIntoTenantResponse,
  PersonDuplicateCandidate,
  ReconcilableField,
} from '@bk2/subject-person-util';
import { ActivityService } from '@bk2/activity-data-access';
import { PFX } from './scope';

@Injectable({
  providedIn: 'root'
})
export class PersonService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly activityService = inject(ActivityService);
  private i18nService = inject(I18nService);
  private readonly functions = getFunctions(getApp(), 'europe-west6');

  // i18n
  protected readonly i18n = this.i18nService.translateAll({
    create_conf: PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf: PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf: PFX + 'delete.conf',
    delete_error: PFX + 'delete.error'
  });

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Creates a new person.
   * @param person the person to create
   * @param currentUser the current user
   * @returns the unique key of the created person or undefined if creation failed
   */
  public async create(person: PersonModel, currentUser?: UserModel): Promise<string | undefined> {
    person.index = getPersonIndex(person);
    const key = await this.firestoreService.createModel<PersonModel>(PersonCollection, person, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
    const payload = `${key}: ${getFullName(person.firstName, person.lastName)}`;
    void this.activityService.log('person', 'create', currentUser, payload);
    return key;
  }
  
  /**
   * Returns the person with the given unique key.
   * @param key the unique key of the person 
   * @returns an Observable of the person or undefined if not found
   */
  public read(key?: string): Observable<PersonModel | undefined> {
    if (!key || key.length === 0) return of(undefined);
    return this.firestoreService.readModel<PersonModel>(PersonCollection, key).pipe(take(1));    
  }

  /**
   * Finds the first person that matches a given bexioId.
   * To avoid caching issues, we query on the locally cached list (from list()) and do not query the server.
   * @param bexioId the id of the person within Bexio
   * @returns an Observable of the matching person or undefined
   */
  public readPersonByBexioId(bexioId: string): Observable<PersonModel | undefined> {
    if (!bexioId || bexioId.length === 0) return of(undefined);
    return this.list().pipe(
      take(1),
      map((persons: PersonModel[]) => {
        return persons.find((person: PersonModel) => person.bexioId === bexioId);
      }));
  }

  /**
   * Updates an existing person.
   * @param person the person to update
   * @param currentUser the current user
   * @returns the unique key of the updated person or undefined if update failed
   */
  public async update(person: PersonModel, currentUser?: UserModel): Promise<string | undefined> {
    person.index = getPersonIndex(person);
    const key = await this.firestoreService.updateModel<PersonModel>(PersonCollection, person, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    const payload = `${key}: ${getFullName(person.firstName, person.lastName)}`;
    void this.activityService.log('person', 'update', currentUser, payload);
    return key;
  }

  /**
   * Archives a person by setting its isArchived property to true.
   * @param person the person to archive
   * @param currentUser the current user
   * @returns a Promise that resolves when the operation is complete
   */
  public async delete(person: PersonModel, currentUser?: UserModel): Promise<void> {
    const payload = `${person.bkey}: ${getFullName(person.firstName, person.lastName)}`;
    await this.firestoreService.deleteModel<PersonModel>(PersonCollection, person, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
    void this.activityService.log('person', 'delete', currentUser, payload);
  }

  /**
   * Cross-tenant duplicate search via the findPersonDuplicates callable.
   * Matches on name / dateOfBirth / favEmail / ssnId. Returns [] on any error.
   */
  public async findDuplicates(req: FindPersonDuplicatesRequest): Promise<PersonDuplicateCandidate[]> {
    try {
      const fn = httpsCallable<FindPersonDuplicatesRequest, FindPersonDuplicatesResponse>(
        this.functions, 'findPersonDuplicates');
      const result = await fn(req);
      return result.data.candidates ?? [];
    } catch (error) {
      console.error('PersonService.findDuplicates failed', error);
      return [];
    }
  }

  /**
   * Shares an existing person into the given tenant and applies the resolved scalar fields,
   * via the mergePersonIntoTenant callable. Returns the merged person key.
   */
  public async mergeIntoTenant(
    personKey: string,
    tenantId: string,
    resolvedFields: Partial<Record<ReconcilableField, string>>,
  ): Promise<string> {
    const fn = httpsCallable<MergePersonIntoTenantRequest, MergePersonIntoTenantResponse>(
      this.functions, 'mergePersonIntoTenant');
    const result = await fn({ personKey, tenantId, resolvedFields });
    return result.data.bkey;
  }

  /*-------------------------- LIST / QUERY  --------------------------------*/
  /**
   * Lists all persons in the database.
   * @param orderBy the name of the field to order by
   * @param sortOrder the order direction (asc or desc)
   * @returns an Observable of the list of persons
   */
  public list(orderBy = 'lastName', sortOrder = 'asc'): Observable<PersonModel[]> {
    return this.firestoreService.searchData<PersonModel>(PersonCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }
}
