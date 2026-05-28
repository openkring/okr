import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { OrgSelectModal } from '@bk2/shared-feature';
import { getDefaultCategoryName, isOrg } from '@bk2/shared-util-core';
import { CategoryListModel, OrgModel, UserModel } from '@bk2/shared-models';

import { createNewMemberFormModel, MemberNewFormModel } from '@bk2/relationship-membership-util';
import { MemberNewForm } from '@bk2/relationship-membership-ui';

import { MembershipStore } from './membership.store';

@Component({
  selector: 'bk-member-new-modal',
  standalone: true,
  providers: [MembershipStore],
  imports: [
    Header, ChangeConfirmation, MemberNewForm,
    IonContent
  ],
  template: `
    <bk-header [i18n]="{ title: this.store.i18n.create_member()}" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(formData(); as formData) {
        <bk-member-new-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [genders]="genders()"
          [allTags]="tags()"
          [tenantId]="tenantId()"
          [readOnly]="false"
          [membershipCategories]="selectedMembershipCategory()"
          [i18n]="store.i18n"
          (selectClicked)="selectOrg()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      } @else {
        <div style="padding: 20px;">Loading form data...</div>
      }
    </ion-content>
  `
})
export class MemberNewModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(MembershipStore);

  // inputs
  public currentUser = input.required<UserModel>();
  public mcat = input.required<CategoryListModel>();
  public tags = input.required<string>();
  public tenantId = input.required<string>();
  public genders = input.required<CategoryListModel>();
  public org = input.required<OrgModel>();

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected selectedMembershipCategory = linkedSignal(() => this.mcat());

  // derived
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ok: this.store.i18n.ok(), cancel: this.store.i18n.cancel(), confirmation: this.store.i18n.save()} as ChangeConfirmationI18n));

  public formData = linkedSignal(() => {
    const org = this.org();
    return createNewMemberFormModel(org);
  });

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(createNewMemberFormModel(this.org()));  // reset the form
  }

  protected onFormDataChange(formData: MemberNewFormModel): void {
    this.formData.set(formData);
  }

  protected async selectOrg(): Promise<void> {
    const modal = await this.modalController.create({
      component: OrgSelectModal,
      cssClass: 'list-modal',
      componentProps: {
        selectedTag: 'selectable',
        currentUser: this.currentUser()
      }
    });
    modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm') {
      if (isOrg(data, this.tenantId())) {
        // Get the full org from AppStore to extract membershipCategoryKey
        const selectedOrg = this.store.appStore.getOrg(data.bkey);
        const membershipCategoryKey = selectedOrg?.membershipCategoryKey;

        // Get the CategoryListModel using AppStore.getCategory
        if (membershipCategoryKey) {
          const membershipCategory = this.store.appStore.getCategory(membershipCategoryKey);
          this.selectedMembershipCategory.set(membershipCategory);
        }

        this.formData.update((vm) => ({
          ...vm,
          orgKey: data.bkey,
          orgName: data.name,
          category: getDefaultCategoryName(this.selectedMembershipCategory()),
        }));
      }
    }
  }
}
