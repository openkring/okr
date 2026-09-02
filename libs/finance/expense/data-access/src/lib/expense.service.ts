import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getDownloadURL, getMetadata, listAll, ref } from 'firebase/storage';

import { ENV, STORAGE } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import {
  BookingCollection, BookingLineCollection, BookingLineModel, BookingModel,
  ExpenseCollection, ExpenseModel, TaskCollection, TaskModel,
} from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

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

/** The wire shape of the updateExpense callable. Every field except the key is optional. */
export interface UpdateExpensePayload {
  expenseKey: string;
  abstract?: string;
  amountTotal?: number;
  currency?: string;
  transferTo?: 'me' | 'issuer';
  category?: string;
  costCenterId?: string;
  note?: string;
  status?: string;
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

  // No create/update/delete through FirestoreService here on purpose: 'expenses' is
  // `allow write: if false` in firestore.rules, so a direct client write can only fail.
  // The three *ViaFunction methods below are the complete set of write paths.

  // The 'expenses' collection is CF-write-only: creation goes through the 'createExpense'
  // callable, which derives accountingTenantId server-side (= tenantId) and owns the initial
  // 'processing' status. Do NOT write 'expenses' from the client SDK.
  public async createViaFunction(payload: CreateExpensePayload): Promise<string> {
    const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'createExpense');
    const result = await fn(payload);
    return (result.data as { expenseKey: string }).expenseKey;
  }

  public read(key: string): Observable<ExpenseModel | undefined> {
    return this.firestoreService.readModel<ExpenseModel>(ExpenseCollection, key);
  }

  /** Soft-delete an expense via the deleteExpense CF (client can't write the expenses collection). */
  public async deleteViaFunction(expenseKey: string): Promise<void> {
    const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'deleteExpense');
    await fn({ expenseKey });
  }

  /** Treasurer edit. `expenses` is CF-write-only, so the callable is the only update path. */
  public async updateViaFunction(payload: UpdateExpensePayload): Promise<void> {
    const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'updateExpense');
    await fn(payload);
  }

  /** Treasurer-only: re-run OCR for a failed (unbooked) expense. Returns the number of receipts re-processed. */
  public async redoOcrViaFunction(expenseKey: string): Promise<number> {
    const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'redoExpenseOcr');
    const result = await fn({ expenseKey });
    return (result.data as { reprocessed: number }).reprocessed;
  }

  /** Load the review TaskModel linked from expense.taskKey. */
  public readTask(taskKey: string): Observable<TaskModel | undefined> {
    return this.firestoreService.readModel<TaskModel>(TaskCollection, taskKey);
  }

  /** Load the BookingModel linked from expense.bookingKey. */
  public readBooking(bookingKey: string): Observable<BookingModel | undefined> {
    return this.firestoreService.readModel<BookingModel>(BookingCollection, bookingKey);
  }

  /** Load the booking's lines. */
  public listBookingLines(bookingKey: string): Observable<BookingLineModel[]> {
    const query = getSystemQuery(this.env.tenantId);
    query.push({ key: 'bookingKey', operator: '==', value: bookingKey });
    return this.firestoreService.searchData<BookingLineModel>(BookingLineCollection, query, 'none');
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
