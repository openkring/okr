import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getDownloadURL, getMetadata, listAll, ref } from 'firebase/storage';

import { ENV, STORAGE } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { ExpenseCollection, ExpenseModel, UserModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';

import { PFX } from './scope';

export interface CreateExpensePayload {
  tenantId: string;
  abstract: string;
  amountTotal: number;
  currency: string;
  transferTo: 'me' | 'issuer';
  iban: string;
  category: string;
  costCenterId: string;
  note: string;
  receiptCount: number;
}

/** A receipt file uploaded for an expense, read straight from Firebase Storage. */
export interface ExpenseReceipt {
  name: string;
  url: string;
  contentType: string;
}

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private readonly env = inject(ENV);
  private readonly storage = inject(STORAGE);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18n = inject(I18nService).translateAll({
    create_conf:  PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf:  PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf:  PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
  });

  public async create(expense: ExpenseModel, currentUser?: UserModel): Promise<string | undefined> {
    return this.firestoreService.createModel<ExpenseModel>(
      ExpenseCollection, expense, this.i18n.create_conf(), this.i18n.create_error(), currentUser
    );
  }

  // The 'expenses' collection is CF-write-only: creation goes through the 'createExpense'
  // callable, which derives accountingTenantId server-side (= tenantId) and owns the initial
  // 'processing' status. Do NOT write 'expenses' from the client SDK.
  public async createViaFunction(payload: CreateExpensePayload): Promise<string> {
    const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'createExpense');
    const result = await fn(payload);
    return (result.data as { expenseKey: string }).expenseKey;
  }

  public async update(expense: ExpenseModel, currentUser?: UserModel): Promise<string | undefined> {
    return this.firestoreService.updateModel<ExpenseModel>(
      ExpenseCollection, expense, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser
    );
  }

  public async delete(expense: ExpenseModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<ExpenseModel>(
      ExpenseCollection, expense, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser
    );
  }

  public read(key: string): Observable<ExpenseModel | undefined> {
    return this.firestoreService.readModel<ExpenseModel>(ExpenseCollection, key);
  }

  // Order by creationDateTime (StoreDateTime, yyyyMMddHHmmss — lexicographically = chronologically
  // sortable), NOT by 'okey'. okey is the document id, stripped before write and re-attached on read
  // (idField), so no expense doc stores an 'okey' field — and Firestore's orderBy silently EXCLUDES
  // documents missing the ordering field, which is why orderBy('okey') returned an empty list.
  public listAll(orderBy = 'creationDateTime', sortOrder = 'desc'): Observable<ExpenseModel[]> {
    return this.firestoreService.searchData<ExpenseModel>(
      ExpenseCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder
    );
  }

  public listForUser(userId: string, orderBy = 'creationDateTime', sortOrder = 'desc'): Observable<ExpenseModel[]> {
    const query = getSystemQuery(this.env.tenantId);
    query.push({ key: 'userId', operator: '==', value: userId });
    return this.firestoreService.searchData<ExpenseModel>(ExpenseCollection, query, orderBy, sortOrder);
  }

  public listForTenant(accountingTenantId: string, orderBy = 'creationDateTime', sortOrder = 'desc'): Observable<ExpenseModel[]> {
    const query = getSystemQuery(this.env.tenantId);
    query.push({ key: 'accountingTenantId', operator: '==', value: accountingTenantId });
    return this.firestoreService.searchData<ExpenseModel>(ExpenseCollection, query, orderBy, sortOrder);
  }

  /**
   * List the receipt files uploaded for an expense. The submit flow uploads receipts straight to
   * Storage under tenant/{tenantId}/ocr/expense/{expenseKey}/ with NO Firestore record per file,
   * so we read them directly from that Storage folder. Returns [] if the folder is empty/absent.
   */
  public async listReceipts(expenseKey: string): Promise<ExpenseReceipt[]> {
    if (!expenseKey) return [];
    const dir = `tenant/${this.env.tenantId}/ocr/expense/${expenseKey}`;
    try {
      const listing = await listAll(ref(this.storage, dir));
      return await Promise.all(
        listing.items.map(async item => {
          const [url, metadata] = await Promise.all([getDownloadURL(item), getMetadata(item)]);
          return { name: item.name, url, contentType: metadata.contentType ?? '' };
        })
      );
    } catch (e) {
      console.error(`ExpenseService.listReceipts: failed to list ${dir}`, e);
      return [];
    }
  }
}
