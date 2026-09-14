import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { BankImportRowCollection, BankImportRowModel, UserModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

import { BANK_IMPORT_I18N_KEYS } from '@okr/finance-bank-import-util';

export interface PostBankImportPayload { accountingTenantId: string; rowKeys?: string[]; }
export interface PostBankImportResult { posted: number; failed: { rowKey: string; reason: string }[]; }

@Injectable({ providedIn: 'root' })
export class BankImportRowService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  private query(accountingTenantId: string) {
    return [...getSystemQuery(this.tenantId), { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId }];
  }

  public list(accountingTenantId: string): Observable<BankImportRowModel[]> {
    return this.firestoreService.searchData<BankImportRowModel>(BankImportRowCollection, this.query(accountingTenantId), 'date', 'desc');
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
    return this.firestoreService.createModels<BankImportRowModel>(BankImportRowCollection, rows, BANK_IMPORT_I18N_KEYS.create_error);
  }

  public async update(row: BankImportRowModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<BankImportRowModel>(BankImportRowCollection, row, false,
      BANK_IMPORT_I18N_KEYS.update_conf, BANK_IMPORT_I18N_KEYS.update_error, currentUser);
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
}
