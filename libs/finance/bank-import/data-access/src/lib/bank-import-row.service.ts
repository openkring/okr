import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc } from 'firebase/firestore';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { BankImportRowCollection, BankImportRowModel, UserModel } from '@okr/shared-models';
import { getSystemQuery, removeKeyFromOkrModel, removeUndefinedFields } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';

import { BANK_IMPORT_I18N_KEYS, PostJournalImportPayload, PostJournalImportResult, withFee } from '@okr/finance-bank-import-util';

export interface PostBankImportPayload { accountingTenantId: string; rowKeys?: string[]; }
export interface PostBankImportResult { posted: number; failed: { rowKey: string; reason: string }[]; }

@Injectable({ providedIn: 'root' })
export class BankImportRowService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18nService = inject(I18nService);
  private readonly tenantId = this.env.tenantId;

  // i18n
  protected readonly i18n = this.i18nService.translateAll({
    create_error: BANK_IMPORT_I18N_KEYS.create_error,
    update_conf: BANK_IMPORT_I18N_KEYS.update_conf,
    update_error: BANK_IMPORT_I18N_KEYS.update_error,
  });

  private query(accountingTenantId: string) {
    return [...getSystemQuery(this.tenantId), { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId }];
  }

  public list(accountingTenantId: string): Observable<BankImportRowModel[]> {
    return this.firestoreService
      .searchData<BankImportRowModel>(BankImportRowCollection, this.query(accountingTenantId), 'date', 'desc')
      .pipe(map(rows => rows.map(row => withFee(row))));
  }

  /** Which of the given import keys already exist (any status). Firestore `in` takes ≤ 30 values. */
  public async existingKeys(accountingTenantId: string, keys: string[]): Promise<Set<string>> {
    const found = new Set<string>();
    for (let i = 0; i < keys.length; i += 30) {
      const chunk = keys.slice(i, i + 30);
      const rows = await this.firestoreService.getDataOnce<BankImportRowModel>(
        BankImportRowCollection,
        [{ key: 'accountingTenantId', operator: '==', value: accountingTenantId }, { key: 'importKey', operator: 'in', value: chunk }],
        'none');
      rows.forEach(r => found.add(r.importKey));
    }
    return found;
  }

  /** Batch create; okey == importKey so the document id is the key. */
  public createMany(rows: BankImportRowModel[]): Promise<boolean> {
    return this.firestoreService.createModels<BankImportRowModel>(BankImportRowCollection, rows, this.i18n.create_error());
  }

  public async update(row: BankImportRowModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<BankImportRowModel>(BankImportRowCollection, row, false,
      this.i18n.update_conf(), this.i18n.update_error(), currentUser);
  }

  /**
   * Silent batch update for bulk row changes (e.g. "Regeln anwenden"): no per-row toast/comment,
   * commits in chunks of <= 400 (Firestore caps a batch at 500 writes). Mirrors
   * FirestoreService.createModels/forkModel field preparation (strip okey, drop undefined fields).
   * @return true if all chunks committed.
   */
  public async updateMany(rows: BankImportRowModel[]): Promise<boolean> {
    if (rows.length === 0) return true;
    try {
      for (let i = 0; i < rows.length; i += 400) {
        const batch = this.firestoreService.getBatch();
        for (const row of rows.slice(i, i + 400)) {
          const key = row.okey;
          const storedModel = removeKeyFromOkrModel(structuredClone(row));
          const fields = removeUndefinedFields(storedModel);
          batch.update(doc(this.firestoreService.firestore, `${BankImportRowCollection}/${key}`), fields);
        }
        await batch.commit();
      }
      return true;
    } catch (ex) {
      console.error(`BankImportRowService.updateMany(${rows.length}) -> ERROR:`, ex);
      return false;
    }
  }

  /** Hard delete: a staging row is not a record worth archiving. */
  public async delete(row: BankImportRowModel): Promise<string | undefined> {
    return await this.firestoreService.deleteObject(BankImportRowCollection, row.okey);
  }

  public async postViaFunction(payload: PostBankImportPayload): Promise<PostBankImportResult> {
    const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'postBankImport');
    const result = await fn(payload);
    return result.data as PostBankImportResult;
  }

  /** Spec §12.3: mapped bexio journal entries → bookings; ≤ 100 entries per call, the store chunks. */
  public async postJournalViaFunction(payload: PostJournalImportPayload): Promise<PostJournalImportResult> {
    const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'postJournalImport');
    const result = await fn(payload);
    return result.data as PostJournalImportResult;
  }
}
