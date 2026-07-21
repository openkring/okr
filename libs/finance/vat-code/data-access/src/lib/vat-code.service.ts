import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { VatCodeCollection, VatCodeModel, UserModel } from '@okr/shared-models';
import { findByKey, getSystemQuery } from '@okr/shared-util-core';

import { PFX } from './scope';

// Standard Swiss VAT codes seeded on tenant creation.
// accountKey is a reference to an AccountModel by its okey (a random per-tenant
// document id), so it can't be hardcoded here — the chart of accounts doesn't
// exist yet at seed time. It is left empty and linked per tenant via the UI once
// the accounts exist. The intended standard link is noted per row (USt → 2200
// Umsatzsteuer, VST → 1170 Vorsteuer).
export const CH_STANDARD_VAT_CODES: Omit<VatCodeModel, 'okey' | 'tenants' | 'isArchived' | 'accountingTenantId'>[] = [
  { name: 'MWST 8.1% Umsatzsteuer',  code: 'UST_81',  rate: 8.1,  validFrom: '20240101', validTo: '', accountKey: '', method: 'effective', direction: 'output' }, // → acct 2200
  { name: 'MWST 2.6% Sondersteuer',  code: 'UST_26',  rate: 2.6,  validFrom: '20240101', validTo: '', accountKey: '', method: 'effective', direction: 'output' }, // → acct 2200
  { name: 'MWST 3.8% Beherbergung',  code: 'UST_38',  rate: 3.8,  validFrom: '20240101', validTo: '', accountKey: '', method: 'effective', direction: 'output' }, // → acct 2200
  { name: 'Vorsteuer 8.1%',          code: 'VST_81',  rate: 8.1,  validFrom: '20240101', validTo: '', accountKey: '', method: 'effective', direction: 'input'  }, // → acct 1170
  { name: 'Vorsteuer 2.6%',          code: 'VST_26',  rate: 2.6,  validFrom: '20240101', validTo: '', accountKey: '', method: 'effective', direction: 'input'  }, // → acct 1170
  { name: 'Steuerbefreit',           code: 'EXEMPT',  rate: 0,    validFrom: '19900101', validTo: '', accountKey: '', method: 'exempt',    direction: 'output' },
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

  /** One-shot, consistent read (no cache-first race). Promise counterpart to {@link list}. */
  public listOnce(accountingTenantId: string, orderBy = 'code', sortOrder = 'asc'): Promise<VatCodeModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.getDataOnce<VatCodeModel>(VatCodeCollection, query, orderBy, sortOrder);
  }

  public async seedStandardCodes(tenantId: string, accountingTenantId: string, currentUser?: UserModel): Promise<void> {
    for (const template of CH_STANDARD_VAT_CODES) {
      const code = new VatCodeModel(tenantId, accountingTenantId);
      Object.assign(code, template);
      code.okey = `${accountingTenantId}-${template.code}`;
      await this.create(code, currentUser);
    }
  }
}
