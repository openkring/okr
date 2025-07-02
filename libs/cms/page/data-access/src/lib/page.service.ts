import { Injectable, inject } from "@angular/core";
import { map, Observable, of } from "rxjs";
import { AlertController, ToastController } from "@ionic/angular/standalone";

import { ENV, FIRESTORE } from "@bk2/shared/config";
import { PageCollection, PageModel, UserModel } from "@bk2/shared/models";
import { createModel, getSystemQuery, searchData, updateModel } from "@bk2/shared/util-core";
import { bkPrompt, confirmAction } from "@bk2/shared/util-angular";

import { saveComment } from "@bk2/comment/util";
import { bkTranslate } from "@bk2/shared/i18n";

@Injectable({
    providedIn: 'root'
})
export class PageService {
  private readonly env = inject(ENV);
  private readonly firestore = inject(FIRESTORE);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new page in the database.
   * @param page the PageModel to store in the database
   * @param currentUser the current user (used as the author of the initial comment)
   * @returns the document id of the newly created page
   */
  public async create(page: PageModel, currentUser: UserModel | undefined): Promise<string> {
    try {
      page.index = this.getSearchIndex(page);
      const _key = await createModel(this.firestore, PageCollection, page, this.tenantId);
      await confirmAction(bkTranslate('@content.page.operation.create.conf'), true, this.toastController);
      await saveComment(this.firestore, this.tenantId, currentUser, PageCollection, _key, '@comment.operation.initial.conf');
      return _key;    
    }
    catch (error) {
      await confirmAction(bkTranslate('@calEvent.operation.create.error'), true, this.toastController);
      throw error; // rethrow the error to be handled by the caller
    }
  }

  /**
   * Lookup a page in the cached list by its document id and return it as an Observable.
   * @param key the document id of the page
   * @returns an Observable of the PageModel
   */
    public read(key: string | undefined): Observable<PageModel | undefined> {
      if (!key || key.length === 0) return of(undefined);
      return this.list().pipe(
        map((pages: PageModel[]) => {
          return pages.find((page: PageModel) => page.bkey === key);
        }));  
    }

  /**
   * Update a page in the database with new values.
   * @param page the PageModel with the new values. Its key must be valid (in order to find it in the database)
   */
  public async update(page: PageModel, currentUser?: UserModel, confirmMessage = '@content.page.operation.update'): Promise<string> {
    try {
      page.index = this.getSearchIndex(page);
      const _key = await updateModel(this.firestore, PageCollection, page);
      await confirmAction(bkTranslate(`${confirmMessage}.conf`), true, this.toastController);
      await saveComment(this.firestore, this.tenantId, currentUser, PageCollection, _key, '@comment.operation.update.conf');
      return _key;    
    }
    catch (error) {
      await confirmAction(bkTranslate(`${confirmMessage}.error`), true, this.toastController);
      throw error; // rethrow the error to be handled by the caller
    }
  }

  /**
   * Delete a page.
   * We are not actually deleting a page. We are just archiving it.
   * @param key 
   */
  public async delete(page: PageModel, currentUser?: UserModel): Promise<void> {
    page.isArchived = true;
    await this.update(page, currentUser, '@content.page.operation.delete');
  }
  
  /*-------------------------- LIST / QUERY  --------------------------------*/
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<PageModel[]> {
    return searchData<PageModel>(this.firestore, PageCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }

  /*-------------------------- SEARCH --------------------------------*/
  public getSearchIndex(page: PageModel): string {
    return 'n:' + page.name + ' k:' + page.bkey;
  }

  public getSearchIndexInfo(): string {
    return 'n:ame k:ey';
  }

  /*-------------------------- section handling --------------------------------*/
  public async addPage(currentUser?: UserModel): Promise<void> {
    const _pageName = await bkPrompt(this.alertController, '@content.page.operation.add.label', '@content.page.field.name');
    if (_pageName) {
      const _page = new PageModel(this.env.tenantId);
      _page.name = _pageName;
      _page.index = this.getSearchIndex(_page);
      await this.create(_page, currentUser);
    }
  }
}