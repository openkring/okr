import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { VatCodeCollection, VatCodeModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { PFX } from './scope';

// Standard Swiss VAT codes seeded on tenant creation
export const CH_STANDARD_VAT_CODES: Omit<VatCodeModel, 'bkey' | 'tenants' | 'isArchived' | 'accountingTenantId'>[] = [
  { name: 'MWST 8.1% Umsatzsteuer',  code: 'UST_81',  rate: 8.1,  validFrom: '20240101', validTo: '', accountKey: '2200', method: 'effective', direction: 'output' },
  { name: 'MWST 2.6% Sondersteuer',  code: 'UST_26',  rate: 2.6,  validFrom: '20240101', validTo: '', accountKey: '2200', method: 'effective', direction: 'output' },
  { name: 'MWST 3.8% Beherbergung',  code: 'UST_38',  rate: 3.8,  validFrom: '20240101', validTo: '', accountKey: '2200', method: 'effective', direction: 'output' },
  { name: 'Vorsteuer 8.1%',          code: 'VST_81',  rate: 8.1,  validFrom: '20240101', validTo: '', accountKey: '1170', method: 'effective', direction: 'input'  },
  { name: 'Vorsteuer 2.6%',          code: 'VST_26',  rate: 2.6,  validFrom: '20240101', validTo: '', accountKey: '1170', method: 'effective', direction: 'input'  },
  { name: 'Steuerbefreit',           code: 'EXEMPT',  rate: 0,    validFrom: '19900101', validTo: '', accountKey: '',     method: 'exempt',    direction: 'output' },
];

@Injectable({ providedIn: 'root' })
export class VatCodeService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public async create(code: VatCodeModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<VatCodeModel>(
      VatCodeCollection, code,
      PFX + 'create.conf', PFX + 'create.error', currentUser
    );
  }

  public read(key: string, accountingTenantId: string): Observable<VatCodeModel | undefined> {
    return findByKey<VatCodeModel>(this.list(accountingTenantId), key);
  }

  public async update(code: VatCodeModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<VatCodeModel>(
      VatCodeCollection, code, false,
      PFX + 'update.conf', PFX + 'update.error', currentUser
    );
  }

  public async delete(code: VatCodeModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.deleteModel<VatCodeModel>(
      VatCodeCollection, code,
      PFX + 'delete.conf', PFX + 'delete.error', currentUser
    );
  }

  public list(accountingTenantId: string, orderBy = 'code', sortOrder = 'asc'): Observable<VatCodeModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<VatCodeModel>(VatCodeCollection, query, orderBy, sortOrder);
  }

  public async seedStandardCodes(tenantId: string, accountingTenantId: string, currentUser?: UserModel): Promise<void> {
    for (const template of CH_STANDARD_VAT_CODES) {
      const code = new VatCodeModel(tenantId, accountingTenantId);
      Object.assign(code, template);
      code.bkey = `${accountingTenantId}-${template.code}`;
      await this.create(code, currentUser);
    }
  }
}
