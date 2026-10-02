import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { getApp } from 'firebase/app';
import { collection, getDocs, query } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { DbQuery, InvoiceCollection, InvoiceModel, InvoicePositionCollection, InvoicePositionModel, UserModel } from '@okr/shared-models';
import { findByKey, getQuery, getSystemQuery } from '@okr/shared-util-core';
import { ActivityService } from '@okr/activity-data-access';

import { InvoiceHeaderInput, InvoicePositionInput, toInvoiceHeaderInput } from '@okr/finance-invoice-util';

/** The `writeInvoice` callable's request (apps/functions/src/invoice/write-invoice.ts). */
export interface WriteInvoicePayload {
  mode: 'create' | 'update' | 'delete';
  invoiceKey?: string;
  accountingTenantId?: string;   // create only
  invoice?: InvoiceHeaderInput;
  positions?: InvoicePositionInput[];
}

/** The `issueInvoice` callable's result. */
export interface IssueInvoiceResult {
  invoiceNo: number;
  documentKey: string;
  bookingKey: string;
}

/**
 * Invoices and their positions are written by Cloud Functions only (firestore.rules: `allow write:
 * if false`): drafts through `writeInvoice`, issuing through `issueInvoice` (spec 1.76). Every write
 * method rejects with the callable's HttpsError; `details.reason` tells the caller why
 * (see `invoiceRefusalReasons` in @okr/finance-invoice-util). The caller shows the toast.
 */
@Injectable({
  providedIn: 'root'
})
export class InvoiceService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly activityService = inject(ActivityService);

  /** Creates a draft with its positions; returns the new invoice's key. */
  public async create(invoice: InvoiceModel, positions: InvoicePositionInput[], currentUser?: UserModel): Promise<string> {
    const { invoiceKey } = await this.writeViaFunction({
      mode: 'create',
      accountingTenantId: invoice.accountingTenantId,
      invoice: toInvoiceHeaderInput(invoice),
      positions,
    });
    void this.activityService.log('invoice', 'create', currentUser, `${invoiceKey}: draft`);
    return invoiceKey;
  }

  public read(key: string): Observable<InvoiceModel | undefined> {
    return findByKey<InvoiceModel>(this.list(), key);
  }

  /** Replaces header and positions of a draft (the server refuses anything but a draft). */
  public async update(invoice: InvoiceModel, positions: InvoicePositionInput[], currentUser?: UserModel): Promise<void> {
    await this.writeViaFunction({
      mode: 'update',
      invoiceKey: invoice.okey,
      invoice: toInvoiceHeaderInput(invoice),
      positions,
    });
    void this.activityService.log('invoice', 'update', currentUser, `${invoice.okey}: draft`);
  }

  /** Deletes a draft with its positions (the server refuses anything but a draft). */
  public async delete(invoice: InvoiceModel, currentUser?: UserModel): Promise<void> {
    await this.writeViaFunction({ mode: 'delete', invoiceKey: invoice.okey });
    void this.activityService.log('invoice', 'delete', currentUser, `${invoice.okey}: draft`);
  }

  /** Issues a draft: number, PDF, finance-document and the Debitoren booking — all on the server. */
  public async issue(invoiceKey: string, currentUser?: UserModel): Promise<IssueInvoiceResult> {
    const fn = httpsCallable<{ invoiceKey: string }, IssueInvoiceResult>(getFunctions(getApp(), 'europe-west6'), 'issueInvoice');
    const result = await fn({ invoiceKey });
    void this.activityService.log('invoice', 'issue', currentUser, `${invoiceKey}: ${result.data.invoiceNo}`);
    return result.data;
  }

  public async writeViaFunction(payload: WriteInvoicePayload): Promise<{ invoiceKey: string }> {
    const fn = httpsCallable<WriteInvoicePayload, { invoiceKey: string }>(getFunctions(getApp(), 'europe-west6'), 'writeInvoice');
    const result = await fn(payload);
    return result.data;
  }

  /** The positions of one invoice (live). */
  public listPositions(invoiceKey: string): Observable<InvoicePositionModel[]> {
    return this.firestoreService.searchData<InvoicePositionModel>(InvoicePositionCollection, this.positionsQuery(invoiceKey), 'none');
  }

  /**
   * One-shot, consistent read of an invoice's positions — what an edit form is seeded from. The live
   * stream may replay a cached snapshot from before the last server write.
   */
  public async listPositionsOnce(invoiceKey: string): Promise<InvoicePositionModel[]> {
    // Not FirestoreService.getDataOnce: it logs and returns [] on any error, which would look like
    // "no positions" — and saving the draft then would delete every stored position. Here a failed
    // read (permission, missing index, offline) rejects, so the caller can refuse to edit.
    const ref = query(
      collection(this.firestoreService.firestore, InvoicePositionCollection),
      ...getQuery(this.positionsQuery(invoiceKey), 'none'),
    );
    const snapshot = await getDocs(ref);
    return snapshot.docs.map((d) => ({ ...d.data(), okey: d.id }) as InvoicePositionModel);
  }

  private positionsQuery(invoiceKey: string): DbQuery[] {
    return [
      ...getSystemQuery(this.env.tenantId),
      { key: 'invoiceKey', operator: '==', value: invoiceKey },
    ];
  }

  private list(): Observable<InvoiceModel[]> {
    return this.firestoreService.searchData<InvoiceModel>(InvoiceCollection, getSystemQuery(this.env.tenantId), 'invoiceDate', 'desc');
  }
}
