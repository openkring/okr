import { Injectable, inject } from "@angular/core";
import { Observable, first, forkJoin, map, of } from "rxjs";

import { ENV } from "@bk2/shared-config";
import { FirestoreService } from "@bk2/shared-data-access";
import { DbQuery, SectionCollection, SectionModel, UserModel } from "@bk2/shared-models";
import { addSystemQueries, findByKey, getSystemQuery } from "@bk2/shared-util-core";

import { getSectionIndex } from "@bk2/cms-section-util";

@Injectable({
    providedIn: 'root'
})
export class SectionService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Save a new SectionModel to the database.
   * @param section the new SectionModel
   * @returns the key of the newly created SectionModel
   */
  public async create(section: SectionModel, currentUser?: UserModel): Promise<string | undefined> {
    section.index = getSectionIndex(section);
    return await this.firestoreService.createModel<SectionModel>(SectionCollection, section, '@content.section.operation.create', currentUser);
  }

  /**
   * Return an Observable of a section by key.
   * @param key the key of the model document
   */
  public read(key: string): Observable<SectionModel | undefined> {
    return findByKey<SectionModel>(this.list(), key);
  }

  /**
   * Update an existing SectionModel with new values.
   * @param section the SectionModel with the new values
   * @param toastController 
   */
  public async update(section: SectionModel, currentUser?: UserModel, confirmMessage = '@content.section.operation.update'): Promise<string | undefined> {
    section.index = getSectionIndex(section);
    return await this.firestoreService.updateModel<SectionModel>(SectionCollection, section, false, confirmMessage, currentUser);
  }

  /**
   * Delete a section by setting its isArchived flag to true.
   * To physically delete a section, an admin user needs to delete it directly in the database.
   * @param section the section to be deleted
   */
  public async delete(section: SectionModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<SectionModel>(SectionCollection, section, '@content.section.operation.delete', currentUser);
  }

  /*-------------------------- LIST / QUERY  --------------------------------*/
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<SectionModel[]> {
    return this.firestoreService.searchData<SectionModel>(SectionCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }
  /**
   * Query the database for sections based on a DbQuery array.
   * @param dbQuery the DbQuery array to filter the sections
   * @param orderBy the field to order the results by
   * @param sortOrder the sort order (asc or desc)
   * @returns an Observable of SectionModel[]
   */
  public query(dbQuery: DbQuery[], orderBy = 'name', sortOrder = 'asc'): Observable<SectionModel[]> {
    const _dbQuery = addSystemQueries(dbQuery, this.env.tenantId);
    return this.firestoreService.searchData<SectionModel>(SectionCollection, _dbQuery, orderBy, sortOrder);
  }

  /*-------------------------- SEARCH --------------------------------*/
  public searchByKeys(sectionKeys: string[]): Observable<SectionModel[]> {
    if (!sectionKeys || sectionKeys.length === 0) {
      return of([]);    // Return an empty array if no keys are provided
    }

    // read all sections
    // we need to use first() on each read() in order to make sure that each observable completes
    const sectionObservables: Observable<SectionModel | undefined>[] = sectionKeys.map(key => this.read(key).pipe(first()));
   // Use forkJoin to wait for all read operations to complete
   return forkJoin(sectionObservables).pipe(
    // After forkJoin emits the array of results (including potential undefined values)
    // filter out the undefined values
    map(results => results.filter((section): section is SectionModel => !!section))
  );
  }
}

