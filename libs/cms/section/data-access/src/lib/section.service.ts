import { Injectable, inject } from "@angular/core";
import { Observable, first, forkJoin, map, of } from "rxjs";
import { ToastController } from "@ionic/angular/standalone";

import { DbQuery, SectionCollection, SectionModel, UserModel } from "@bk2/shared/models";
import { SectionTypes, getCategoryName } from "@bk2/shared/categories";
import { ENV, FIRESTORE } from "@bk2/shared/config";
import { addSystemQueries, createModel, getSystemQuery, searchData, updateModel } from "@bk2/shared/util-core";
import { confirmAction } from "@bk2/shared/util-angular";

import { saveComment } from "@bk2/comment/util";
import { bkTranslate } from "@bk2/shared/i18n";

@Injectable({
    providedIn: 'root'
})
export class SectionService {
  private readonly env = inject(ENV);
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);

  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Save a new SectionModel to the database.
   * @param section the new SectionModel
   * @returns the key of the newly created SectionModel
   */
  public async create(section: SectionModel, currentUser?: UserModel): Promise<string> {
    try {
      section.index = this.getSearchIndex(section);
      const _key = await createModel(this.firestore, SectionCollection, section, this.tenantId);
      await confirmAction(bkTranslate('@content.section.operation.create.conf'), true, this.toastController);
      await saveComment(this.firestore, this.tenantId, currentUser, SectionCollection, _key, '@comment.operation.initial.conf');
      return _key;    
    }
    catch (error) {
      await confirmAction(bkTranslate('@calEvent.operation.create.error'), true, this.toastController);
      throw error; // rethrow the error to be handled by the caller
    }
  }

  /**
   * Return an Observable of a section by uid.
   * @param afs a handle on the Firestore database
   * @param uid the key of the model document
   */
  public read(key: string): Observable<SectionModel | undefined> {
    console.log(`SectionService.read(${key})`);
    if (!key || key.length === 0) return of(undefined);
    return this.list().pipe(
      map((sections: SectionModel[]) => {
        return sections.find((section: SectionModel) => section.bkey === key);
      }));
  }

  /**
   * Update an existing SectionModel with new values.
   * @param section the SectionModel with the new values
   * @param toastController 
   */
  public async update(section: SectionModel, currentUser?: UserModel, confirmMessage = '@content.section.operation.update'): Promise<string> {
    try {
      section.index = this.getSearchIndex(section);
      const _key = await updateModel(this.firestore, SectionCollection, section);
      await confirmAction(bkTranslate(`${confirmMessage}.conf`), true, this.toastController);
      await saveComment(this.firestore, this.tenantId, currentUser, SectionCollection, _key, '@comment.operation.update.conf');
      return _key;    
    }
    catch (error) {
      await confirmAction(bkTranslate(`${confirmMessage}.error`), true, this.toastController);
      throw error; // rethrow the error to be handled by the caller
    }
  }

  /**
   * Delete a section by setting its isArchived flag to true.
   * To physically delete a section, an admin user needs to delete it directly in the database.
   * @param section the section to be deleted
   */
  public async delete(section: SectionModel, currentUser?: UserModel): Promise<void> {
    section.isArchived = true;
    await this.update(section, currentUser, '@content.section.operation.delete');
  }

  /*-------------------------- LIST / QUERY  --------------------------------*/
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<SectionModel[]> {
    return searchData<SectionModel>(this.firestore, SectionCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }

  public query(dbQuery: DbQuery[], orderBy = 'name', sortOrder = 'asc'): Observable<SectionModel[]> {
    const _dbQuery = addSystemQueries(dbQuery, this.tenantId);
    return searchData<SectionModel>(this.firestore, SectionCollection, _dbQuery, orderBy, sortOrder);
  }

  /*-------------------------- SEARCH --------------------------------*/
  public searchByKeys(sectionKeys: string[]): Observable<SectionModel[]> {
    if (!sectionKeys || sectionKeys.length === 0) {
      return of([]);    // Return an empty array if no keys are provided
    }

    // read all sections
    // we need to use first() on each read() in order to make sure that each observable completes
    const _sectionObservables: Observable<SectionModel | undefined>[] = sectionKeys.map(key => this.read(key).pipe(first()));
   // Use forkJoin to wait for all read operations to complete
   return forkJoin(_sectionObservables).pipe(
    // After forkJoin emits the array of results (including potential undefined values)
    // filter out the undefined values
    map(results => results.filter((section): section is SectionModel => !!section))
  );
  }

  public getSearchIndex(item: SectionModel): string {
    return 'n:' + item.name + ' cn:' + getCategoryName(SectionTypes, item.type);
  }

  public getSearchIndexInfo(): string {
    return 'n:ame cn:categoryName';
  }
}

