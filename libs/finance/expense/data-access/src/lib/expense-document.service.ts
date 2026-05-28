import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { ExpenseDocumentCollection, ExpenseDocumentModel, UserModel } from '@bk2/shared-models';
import { getSystemQuery } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class ExpenseDocumentService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18n = inject(I18nService).translateAll({
    create_conf:  PFX + 'expenseDoc.create.conf',
    create_error: PFX + 'expenseDoc.create.error',
    delete_conf:  PFX + 'expenseDoc.delete.conf',
    delete_error: PFX + 'expenseDoc.delete.error',
  });

  public async create(doc: ExpenseDocumentModel, currentUser?: UserModel): Promise<string | undefined> {
    return this.firestoreService.createModel<ExpenseDocumentModel>(
      ExpenseDocumentCollection, doc, this.i18n.create_conf(), this.i18n.create_error(), currentUser
    );
  }

  public async delete(doc: ExpenseDocumentModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<ExpenseDocumentModel>(
      ExpenseDocumentCollection, doc, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser
    );
  }

  public listForExpense(expenseKey: string): Observable<ExpenseDocumentModel[]> {
    const query = getSystemQuery(this.env.tenantId);
    query.push({ key: 'expenseKey', operator: '==', value: expenseKey });
    return this.firestoreService.searchData<ExpenseDocumentModel>(ExpenseDocumentCollection, query);
  }
}
