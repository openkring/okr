import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { MemberFeeCollection, MemberFeeModel, UserModel } from '@okr/shared-models';
import { getSystemQuery, getTodayStr, DateFormat } from '@okr/shared-util-core';
import { ActivityService } from '@okr/activity-data-access';
import { BEXIO_INVOICE_TEMPLATES } from '@okr/relationship-membership-util';

const PFX = '@relationship/membership/data-access.';

@Injectable({
  providedIn: 'root'
})
export class MemberFeeService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly activityService = inject(ActivityService);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    fee_create_conf:  PFX + 'fee.create.conf',
    fee_create_error: PFX + 'fee.create.error',
    fee_update_conf:  PFX + 'fee.update.conf',
    fee_update_error: PFX + 'fee.update.error',
    fee_delete_conf:  PFX + 'fee.delete.conf',
    fee_delete_error: PFX + 'fee.delete.error',
  });

  public list(): Observable<MemberFeeModel[]> {
    return this.firestoreService.searchData<MemberFeeModel>(
      MemberFeeCollection,
      getSystemQuery(this.env.tenantId),
      'index',
      'asc'
    );
  }

  public async save(fee: MemberFeeModel, currentUser?: UserModel, addActivity = true): Promise<string | undefined> {

    if (fee.okey && fee.okey.length > 0) {
      const key = await this.firestoreService.updateModel<MemberFeeModel>(MemberFeeCollection, fee, false, this.i18n.fee_update_conf(), this.i18n.fee_update_error(), currentUser);
      void this.activityService.log('member-fee', 'update', currentUser, fee.index);
      return key;
    } else {
      const key = await this.firestoreService.createModel<MemberFeeModel>(MemberFeeCollection, fee, this.i18n.fee_create_conf(), this.i18n.fee_create_error(), currentUser);
      if (addActivity) {
        void this.activityService.log('member-fee', 'create', currentUser, fee.index);
      }
      return key;
    }
  }

  public async delete(fee: MemberFeeModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<MemberFeeModel>(MemberFeeCollection, fee, this.i18n.fee_delete_conf(), this.i18n.fee_delete_error(), currentUser);
    void this.activityService.log('member-fee', 'delete', currentUser, fee.index);
  }
}

// tbd: this is a hardcoded interim workaround. It should be replaced with a user selection and dynamic template download from Bexio
export function getTemplateId(mcat: string): string {
  if (mcat === 'passive') {
    return BEXIO_INVOICE_TEMPLATES[3].id;
  } else {
    return BEXIO_INVOICE_TEMPLATES[1].id;
  }
}

export function getFeeIndex(fee: MemberFeeModel): string {
  return fee.member
    ? `n:${fee.member.name2} n:${fee.member.name1}`
    : getTodayStr(DateFormat.StoreDate);
}
