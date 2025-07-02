import { inject, Injectable } from "@angular/core";
import { ModalController } from "@ionic/angular/standalone";

import { AppStore } from "@bk2/shared/feature";
import { CategoryItemModel, CategoryListModel, MembershipModel, ModelType, OrgModel, PersonModel } from "@bk2/shared/models";
import { convertDateFormatToString, DateFormat, isMembership } from "@bk2/shared/util-core";
import { selectDate } from "@bk2/shared/ui";

import { MembershipService } from "@bk2/membership/data-access";
import { convertFormToNewMembership, MembershipNewFormModel, newMembershipForPerson } from "@bk2/membership/util";
import { MembershipNewModalComponent } from "./membership-new.modal";
import { MembershipEditModalComponent } from "./membership-edit.modal";
import { CategoryChangeModalComponent } from "./membership-category-change.modal";

@Injectable({
    providedIn: 'root'
})
export class MembershipModalsService {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);
  private readonly membershipService = inject(MembershipService);
  
  private readonly tenantId = this.appStore.tenantId();

  /**
   * Show a modal to add a new membership.
   * @param member to add as a member to an org (Person or Org)
   * @param org the organization to add a membership to
   * @param modelType the type of the member (Person or Org)
   */
  public async add(member?: PersonModel | OrgModel, org?: OrgModel, modelType?: ModelType): Promise<void> {
    if (org && member && modelType) {
      const _modal = await this.modalController.create({
        component: MembershipNewModalComponent,
        cssClass: 'small-modal',
        componentProps: {
          member: member,
          org: org,
          modelType: modelType,
        }
      });
      _modal.present();
      const { data, role } = await _modal.onDidDismiss();
      if (role === 'confirm') {
        const _membership = convertFormToNewMembership(data as MembershipNewFormModel, this.tenantId);
        await this.membershipService.create(_membership, this.appStore.currentUser());
      }
    }
  }  

  /**
   * Show a modal to edit an existing membership.
   * @param membership the membership to edit
   */
  public async edit(membership?: MembershipModel): Promise<void> {
    let _membership = membership;
    _membership ??= new MembershipModel(this.tenantId);
    const _modal = await this.modalController.create({
      component: MembershipEditModalComponent,
      componentProps: {
        membership: _membership,
        currentUser: this.appStore.currentUser()
      }
    });
    _modal.present();
    const { data, role } = await _modal.onDidDismiss();
    if (role === 'confirm') {
      if (isMembership(data, this.tenantId)) {
        await (!data.bkey ? 
          this.membershipService.create(data, this.appStore.currentUser()) : 
          this.membershipService.update(data, this.appStore.currentUser()));
      }
    }
  } 

  /*------------------------------ members ----------------------------------------------*/
  /**
   * Adds a new member to the given organization.
   * @param org the organization to add a member to
   */
   public async addPersonAsMember(person: PersonModel, org: OrgModel): Promise<void> {
      const _date = await selectDate(this.modalController);
      if (!_date) return;
      const _validFrom = convertDateFormatToString(_date, DateFormat.IsoDate, DateFormat.StoreDate);
      const _membership = newMembershipForPerson(person, org.bkey, org.name, new CategoryItemModel('active', 'A', 'member_active'), _validFrom);
      _membership.index = this.membershipService.getSearchIndex(_membership);
      await this.membershipService.create(_membership, this.appStore.currentUser());
  } 
    
  public async changeMembershipCategory(oldMembership: MembershipModel, membershipCategory: CategoryListModel): Promise<void> {
    const _modal = await this.modalController.create({
      component: CategoryChangeModalComponent,
      componentProps: {
        membership: oldMembership,
        membershipCategory: membershipCategory
      }
    });
    _modal.present();
    const { data, role } = await _modal.onDidDismiss();
    if (role === 'confirm' && data !== undefined) {   // result is vm: CategoryChangeFormModel
      await this.membershipService.saveMembershipCategoryChange(oldMembership, data, membershipCategory, this.appStore.currentUser());
    }
  }
}