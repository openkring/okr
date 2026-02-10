import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { OrgSelectModalComponent } from '@bk2/shared-feature';
import { isOrg } from '@bk2/shared-util-core';

import { convertFormToNewPerson, createNewMemberFormModel, MemberNewFormModel } from '@bk2/relationship-membership-util';
import { MemberNewForm } from '@bk2/relationship-membership-ui';

import { MembershipStore } from './membership.store';

@Component({
  selector: 'bk-member-new-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent, MemberNewForm,
    IonContent
  ],
  template: `
    <bk-header title="@membership.operation.createMember.label" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
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
          [membershipCategories]="mcat()"
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
  protected readonly membershipStore = inject(MembershipStore);

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => {
    const org = this.membershipStore.org();
    console.log('MemberNewModal formData init, org:', org);
    const model = createNewMemberFormModel(org);
    console.log('MemberNewModal formData model:', model);
    return model;
  });

  // derived signals and fields
  protected currentUser = computed(() => this.membershipStore.currentUser());
  protected mcat = computed(() => this.membershipStore.membershipCategory());
  protected tags = computed(() => this.membershipStore.getTags());
  protected tenantId = computed(() => this.membershipStore.tenantId());
  protected genders = computed(() => this.membershipStore.appStore.getCategory('gender'));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(convertFormToNewPerson(this.formData(), this.tenantId()), 'confirm');  
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(createNewMemberFormModel(this.membershipStore.org()));  // reset the form
  }

  protected onFormDataChange(formData: MemberNewFormModel): void {
    this.formData.set(formData);
  }

  protected async selectOrg(): Promise<void> {
    const modal = await this.modalController.create({
      component: OrgSelectModalComponent,
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
        this.membershipStore.setOrgId(data.bkey); // Use newly selected org
        this.formData.update((vm) => ({
          ...vm,
          orgKey: data.bkey,
          orgName: data.name,
        }));
      }
    }
  }
}
