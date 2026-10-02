import { inject, Injectable } from '@angular/core';
import { map, Observable, of } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { ContractCollection, ContractModel, DbQuery, UserModel } from '@okr/shared-models';
import { getSystemQuery, getTodayStr } from '@okr/shared-util-core';

import { applyDerivedFields } from '@okr/business-contract-util';
import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class ContractService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18n = inject(I18nService).translateAll({
    create_conf: PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf: PFX + 'update.conf',
    update_error: PFX + 'update.error',
  });

  public async create(c: ContractModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<ContractModel>(
      ContractCollection,
      applyDerivedFields(c, getTodayStr()),
      this.i18n.create_conf(),
      this.i18n.create_error(),
      currentUser
    );
  }

  public async update(c: ContractModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<ContractModel>(
      ContractCollection,
      applyDerivedFields(c, getTodayStr()),
      false,
      this.i18n.update_conf(),
      this.i18n.update_error(),
      currentUser
    );
  }

  /** Archive only — contracts are never deleted (GeBüV, spec §3.4). */
  public async archive(c: ContractModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.update({ ...c, isArchived: true }, currentUser);
  }

  /** admin/treasurer: includeStrict = true; privileged/auditor: false (rules-provable filter, spec §5.1). */
  public listStaff(includeStrict: boolean): Observable<ContractModel[]> {
    const q: DbQuery[] = [...getSystemQuery(this.env.tenantId)];
    if (!includeStrict) q.push({ key: 'isStrictlyConfidential', operator: '==', value: false });
    return this.firestoreService.searchData<ContractModel>(ContractCollection, q, 'name', 'asc');
  }

  /** Own-party list: ONE array filter (partyPersonKeys); tenant filtered client-side. */
  public listMine(personKey: string): Observable<ContractModel[]> {
    if (!personKey) return of([]);
    return this.firestoreService
      .searchData<ContractModel>(
        ContractCollection,
        [
          { key: 'partyPersonKeys', operator: 'array-contains', value: personKey },
          { key: 'isArchived', operator: '==', value: false },
        ],
        'name',
        'asc'
      )
      .pipe(map((list) => list.filter((c) => (c.tenants ?? []).includes(this.env.tenantId))));
  }
}
