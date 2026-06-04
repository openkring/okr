import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryChangeForm } from '@bk2/relationship-membership-ui';
import { CategoryChangeFormModel, convertMembershipToCategoryChangeForm } from '@bk2/relationship-membership-util';
import { AvatarInfo, CategoryListModel, MembershipModel, UserModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { getFullName, newAvatarInfo } from '@bk2/shared-util-core';

import { RelationshipToolbar } from '@bk2/avatar-ui';
import { MembershipStore } from './membership.store';

@Component({
  selector: 'bk-category-change-modal',
  standalone: true,
  providers: [MembershipStore],
  imports: [
    Header, ChangeConfirmation, CategoryChangeForm, RelationshipToolbar,
    IonContent
],
  template: `
    <bk-header [i18n]="{ title: title() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (currentUser(); as currentUser) {
        @if (memberAvatar(); as memberAvatar) {
          @if (orgAvatar(); as orgAvatar) {
            <bk-relationship-toolbar
              relType="membership"
              [subjectAvatar]="memberAvatar"
              [objectAvatar]="orgAvatar"
              [relDesc1]="store.i18n.reldesc1()" [relDesc2]="store.i18n.reldesc2()"
              [currentUser]="currentUser"
            />

            <bk-category-change-form
              [formData]="formData()"
              [membershipCategory]="membershipCategory()"
              [readOnly]=false
              [i18n]="store.i18n"
              (formDataChange)="onFormDataChange($event)"
              (dirty)="formDirty.set($event)"
              (valid)="formValid.set($event)"
            />
          }
        }
      }
    </ion-content>
  `,
})
export class CategoryChangeModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(MembershipStore);

  // inputs
  public membership = input.required<MembershipModel>();
  public membershipCategory = input.required<CategoryListModel>();
  public currentUser = input<UserModel>();
  public title = input(this.store.i18n.category_change_label());

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => convertMembershipToCategoryChangeForm(this.membership()));

  // derived signals
  private readonly name = computed(() => getFullName(this.membership().memberName1, this.membership().memberName2, this.currentUser()?.nameDisplay));
  protected memberAvatar = computed<AvatarInfo>(() => {
    const m = this.membership();
      return newAvatarInfo(m.memberKey, m.memberName1, m.memberName2, m.memberModelType, '', '', this.name());
  });
  protected orgAvatar = computed<AvatarInfo>(() => {
    const m = this.membership();
      return newAvatarInfo(m.orgKey, '', m.orgName, m.orgModelType, '', '', m.orgName);
  });
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.store.i18n.cancel(), save: this.store.i18n.save()} as ChangeConfirmationI18n));


  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertMembershipToCategoryChangeForm(this.membership()));  // reset the form
  }

  protected onFormDataChange(formData: CategoryChangeFormModel): void {
    this.formData.set(formData);
  }
}
