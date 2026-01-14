import { inject, Injectable } from '@angular/core';
import { map, Observable, of } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { PersonCollection, PersonModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import {getPersonIndex} from '@bk2/subject-person-util'

@Injectable({
  providedIn: 'root'
})
export class PersonService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Creates a new person.
   * @param person the person to create
   * @param currentUser the current user
   * @returns the unique key of the created person or undefined if creation failed
   */
  public async create(person: PersonModel, currentUser?: UserModel): Promise<string | undefined> {
    person.index = getPersonIndex(person);
    return await this.firestoreService.createModel<PersonModel>(PersonCollection, person, '@subject.person.operation.create', currentUser);
  }
  
  /**
   * Returns the person with the given unique key.
   * @param key the unique key of the person 
   * @returns an Observable of the person or undefined if not found
   */
  public read(key?: string): Observable<PersonModel | undefined> {
    if (!key || key.length === 0) return of(undefined);
    return findByKey<PersonModel>(this.list(), key);    
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
      map((persons: PersonModel[]) => {
        return persons.find((person: PersonModel) => person.bexioId === bexioId);
      }));
  }

  /**
   * Updates an existing person.
   * @param person the person to update
   * @param currentUser the current user
   * @param confirmMessage the confirmation message
   * @returns the unique key of the updated person or undefined if update failed
   */
  public async update(person: PersonModel, currentUser?: UserModel, confirmMessage = '@subject.person.operation.update'): Promise<string | undefined> {
    person.index = getPersonIndex(person);
    return await this.firestoreService.updateModel<PersonModel>(PersonCollection, person, false, confirmMessage, currentUser);
  }

  /**
   * Archives a person by setting its isArchived property to true.
   * @param person the person to archive
   * @param currentUser the current user
   * @returns a Promise that resolves when the operation is complete
   */
  public async delete(person: PersonModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<PersonModel>(PersonCollection, person, '@subject.person.operation.delete', currentUser);
  }

  /**
   * Checks if a person with the given first and last name already exists.
   * @param persons the list of persons to check
   * @param firstName the first name to check
   * @param lastName the last name to check
   * @returns true if the person exists, false otherwise
   */
  public checkIfExists(persons?: PersonModel[], firstName?: string, lastName?: string): boolean {
    if (!persons || persons.length === 0) {
      return false;
    }
    const searchFirstName = !firstName ? '' : firstName.trim().toLowerCase();
    const searchLastName = !lastName ? '' : lastName.trim().toLowerCase();

    return persons.some(person =>
      person.firstName?.trim().toLowerCase() === searchFirstName &&
      person.lastName?.trim().toLowerCase() === searchLastName
    );
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
