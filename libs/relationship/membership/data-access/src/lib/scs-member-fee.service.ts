import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { CategoryListModel, MembershipModel, ScsMemberFeesCollection, ScsMemberFeesModel, UserModel } from '@bk2/shared-models';
import { getCategoryAttribute, getFullName, getSystemQuery, getTodayStr, DateFormat, getYear } from '@bk2/shared-util-core';
import { ActivityService } from '@bk2/activity-data-access';
import { BEXIO_INVOICE_TEMPLATES } from '@bk2/relationship-membership-util';

@Injectable({
  providedIn: 'root'
})
export class ScsMemberFeeService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly activityService = inject(ActivityService);

  public list(): Observable<ScsMemberFeesModel[]> {
    return this.firestoreService.searchData<ScsMemberFeesModel>(
      ScsMemberFeesCollection,
      getSystemQuery(this.env.tenantId),
      'index',
      'asc'
    );
  }

  public async save(fee: ScsMemberFeesModel, currentUser?: UserModel, addActivity = true): Promise<string | undefined> {
    if (fee.bkey && fee.bkey.length > 0) {
      const key = await this.firestoreService.updateModel<ScsMemberFeesModel>(
        ScsMemberFeesCollection, fee, false, '@finance.scsMemberFee.operation.update', currentUser
      );
      void this.activityService.log('scs-member-fee', 'update', currentUser, fee.index);
      return key;
    } else {
      const key = await this.firestoreService.createModel<ScsMemberFeesModel>(
        ScsMemberFeesCollection, fee, '@finance.scsMemberFee.operation.create', currentUser
      );
      if (addActivity) {
        void this.activityService.log('scs-member-fee', 'create', currentUser, fee.index);
      }
      return key;
    }
  }

  public async delete(fee: ScsMemberFeesModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<ScsMemberFeesModel>(
      ScsMemberFeesCollection, fee, '@finance.scsMemberFee.operation.delete', currentUser
    );
    void this.activityService.log('scs-member-fee', 'delete', currentUser, fee.index);
  }
}

/**
 * Convert a MembershipModel into a ScsMemberFeesModel using the given category lists,
 * locker ownership information, and current year.
 */
export function convertMembershipToFee(
  membership: MembershipModel,
  srvMembership: MembershipModel | undefined,
  hasLocker: boolean,
  mcatScs: CategoryListModel | undefined,
  mcatSrv: CategoryListModel | undefined,
  tenantId: string
): ScsMemberFeesModel {
  const fee = new ScsMemberFeesModel(tenantId);

  fee.tenants = membership.tenants;
  fee.isArchived = membership.isArchived;
  fee.index = membership.index;
  fee.tags = membership.tags;
  fee.notes = membership.notes;
  fee.templateId = getTemplateId(membership.category);

  fee.member = {
    key: membership.memberKey,
    name1: membership.memberName1,
    name2: membership.memberName2,
    modelType: membership.memberModelType,
    type: membership.memberType,
    subType: '',
    label: getFullName(membership.memberName1, membership.memberName2),
  };
  fee.memberDateOfBirth = membership.memberDateOfBirth;
  fee.memberBexioId = membership.memberBexioId;
  fee.dateOfEntry = membership.dateOfEntry;
  fee.category = membership.category;
  fee.rebate = membership.rebate ?? 0;
  fee.rebateReason = membership.rebateReason ?? '';

  fee.jb = mcatScs ? (getCategoryAttribute(mcatScs, membership.category, 'price') as number || 0) : 0;
  fee.srv = (srvMembership && mcatSrv)
    ? (getCategoryAttribute(mcatSrv, srvMembership.category, 'price') as number || 0)
    : 0;
  fee.bev = 0;
  fee.entryFee = getEntryFee(membership);
  fee.locker = hasLocker ? 20 : 0;
  fee.hallenTraining = 0;
  fee.skiff = 0;
  fee.skiffInsurance = 0;

  fee.state = 'initial';
  return fee;
}

// tbd: this is a hardcoded interim workaround. It should be replaced with a user selection and dynamic template download from Bexio
export function getTemplateId(mcat: string): string {
  if (mcat === 'passive') {
    return BEXIO_INVOICE_TEMPLATES[3].id;
  } else {
    return BEXIO_INVOICE_TEMPLATES[1].id;
  }
}

export function getEntryFee(membership: MembershipModel): number {
  const currentYear = getYear();
  const entryYear = parseInt(membership.dateOfEntry.substring(0, 4));
  const birthYear = parseInt(membership.dateOfEntry.substring(0, 4));
  // tbd: we also need to check for entries in the last year that did not yet pay the entry fee
  // tbd: we also need to check for re-entries, e.g. 19940101:A1,20251231:X,20260215:P does not have to pay
  if (entryYear === currentYear && (currentYear - birthYear) > 25) return 750;
  return 0;
}

export function getFeeTotal(fee: ScsMemberFeesModel): number {
  return ((fee.jb ?? 0) + 
    (fee.srv ?? 0) + 
    (fee.bev ?? 0) + 
    (fee.entryFee ?? 0) + 
    (fee.locker ?? 0) + 
    (fee.hallenTraining ?? 0) + 
    (fee.skiff ?? 0) + 
    (fee.skiffInsurance ?? 0) - 
    (fee.rebate ?? 0));
}

export function getFeeIndex(fee: ScsMemberFeesModel): string {
  return fee.member
    ? `n:${fee.member.name2} n:${fee.member.name1}`
    : getTodayStr(DateFormat.StoreDate);
}
