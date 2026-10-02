import { inject, Injectable } from '@angular/core';
import { deleteField } from 'firebase/firestore';
import { map, Observable, of } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { ContractCollection, ContractModel, DbQuery, UserModel } from '@okr/shared-models';
import { getTodayStr } from '@okr/shared-util-core';

import { applyDerivedFields, clearedContractFields, toContractCreatePayload, toContractUpdatePayload } from '@okr/business-contract-util';
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
      toContractCreatePayload(applyDerivedFields(c, getTodayStr())),
      this.i18n.create_conf(),
      this.i18n.create_error(),
      currentUser
    );
  }

  /**
   * documents[] and remindersSent are server-owned (register callable, scanner) and never sent — a
   * stale modal copy would wipe files registered meanwhile. updateModel drops undefined fields, so a
   * cleared optional field (responsible, notice, value, loan) is deleted in a second, merge-safe write.
   */
  public async update(c: ContractModel, currentUser?: UserModel): Promise<string | undefined> {
    const payload = toContractUpdatePayload(applyDerivedFields(c, getTodayStr()));
    const key = await this.firestoreService.updateModel<ContractModel>(
      ContractCollection,
      payload as ContractModel,
      false,
      this.i18n.update_conf(),
      this.i18n.update_error(),
      currentUser
    );
    const cleared = clearedContractFields(c);
    if (!key || cleared.length === 0) return key;
    // updateObject (not updateModel): the deleteField() sentinel must reach updateDoc un-cloned.
    const deletes = Object.fromEntries(cleared.map((f) => [f, deleteField()]));
    return await this.firestoreService.updateObject(ContractCollection, key, deletes);
  }

  /** Archive only — contracts are never deleted (GeBüV, spec §3.4). */
  public async archive(c: ContractModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.update({ ...c, isArchived: true }, currentUser);
  }

  /**
   * admin/treasurer: includeStrict = true; privileged/auditor: false (rules-provable filter, spec §5.1).
   * tenants array-contains the OWN tenant only: the staff rule leg is canWriteTenant (no 'system'), so
   * getSystemQuery's array-contains-any [tenant, 'system'] is unprovable and the whole list is denied.
   */
  public listStaff(includeStrict: boolean): Observable<ContractModel[]> {
    const q: DbQuery[] = [
      { key: 'isArchived', operator: '==', value: false },
      { key: 'tenants', operator: 'array-contains', value: this.env.tenantId },
    ];
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
