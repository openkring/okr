import { inject, Injectable } from "@angular/core";
import { ModalController } from "@ionic/angular/standalone";

import { AppStore } from "@bk2/shared-feature";
import { CategoryItemModel, CategoryListModel, MembershipModel, OrgModel, PersonModel } from "@bk2/shared-models";
import { selectDate } from "@bk2/shared-ui";
import { convertDateFormatToString, DateFormat, isMembership } from "@bk2/shared-util-core";

import { MembershipService } from "@bk2/relationship-membership-data-access";
import { convertFormToNewMembership, getMembershipIndex, MembershipNewFormModel, newMembershipForPerson } from "@bk2/relationship-membership-util";

import { CategoryChangeModalComponent } from "./membership-category-change.modal";
import { MembershipEditModalComponent } from "./membership-edit.modal";
import { MembershipNewModalComponent } from "./membership-new.modal";

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
  public async add(member?: PersonModel | OrgModel, org?: OrgModel, modelType?: 'person' | 'org'): Promise<void> {
    if (org && member && modelType) {
      const modal = await this.modalController.create({
        component: MembershipNewModalComponent,
        cssClass: 'small-modal',
        componentProps: {
          member: member,
          org: org,
          modelType: modelType,
        }
      });
      modal.present();
      const { data, role } = await modal.onDidDismiss();
      if (role === 'confirm') {
        const membership = convertFormToNewMembership(data as MembershipNewFormModel, this.tenantId);
        await this.membershipService.create(membership, this.appStore.currentUser());
      }
    }
  }  

  /**
   * Show a modal to edit an existing membership.
   * @param membership the membership to edit
   */
  public async edit(membership?: MembershipModel, readOnly = true): Promise<void> {
    membership ??= new MembershipModel(this.tenantId);
    const modal = await this.modalController.create({
      component: MembershipEditModalComponent,
      componentProps: {
        membership: membership,
        currentUser: this.appStore.currentUser(),
        readOnly: readOnly
      }
    });
    modal.present();
    const { data, role } = await modal.onDidDismiss();
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
      const date = await selectDate(this.modalController);
      if (!date) return;
      const validFrom = convertDateFormatToString(date, DateFormat.IsoDate, DateFormat.StoreDate);
      const membership = newMembershipForPerson(person, org.bkey, org.name, new CategoryItemModel('active', 'A', 'member_active'), validFrom);
      membership.index = getMembershipIndex(membership);
      await this.membershipService.create(membership, this.appStore.currentUser());
  } 
    
  public async changeMembershipCategory(oldMembership: MembershipModel, membershipCategory: CategoryListModel): Promise<void> {
    const modal = await this.modalController.create({
      component: CategoryChangeModalComponent,
      componentProps: {
        membership: oldMembership,
        membershipCategory: membershipCategory,
        currentUser: this.appStore.currentUser()
      }
    });
    modal.present();
    const { data, role } = await modal.onDidDismiss();
    if (role === 'confirm' && data !== undefined) {   // result is vm: CategoryChangeFormModel
      await this.membershipService.saveMembershipCategoryChange(oldMembership, data, membershipCategory, this.appStore.currentUser());
    }
  }
}