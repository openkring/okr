import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryChangeForm } from '@bk2/relationship-membership-ui';
import { CategoryChangeFormModel, convertMembershipToCategoryChangeForm } from '@bk2/relationship-membership-util';
import { AvatarInfo, CategoryListModel, MembershipModel, UserModel } from '@bk2/shared-models';
import { I18nService } from '@bk2/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { PFX } from './scope';
import { getFullName, newAvatarInfo } from '@bk2/shared-util-core';

import { RelationshipToolbar } from '@bk2/avatar-ui';

@Component({
  selector: 'bk-category-change-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, CategoryChangeForm, RelationshipToolbar,
    IonContent
],
  template: `
    <bk-header [i18n]="{ title: title() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [i18n]="changeConfirmationI18n()" [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    } 
    <ion-content class="ion-no-padding">
      @if (currentUser(); as currentUser) {
        @if (memberAvatar(); as memberAvatar) {
          @if (orgAvatar(); as orgAvatar) {
            <bk-relationship-toolbar
              relType="membership"
              [subjectAvatar]="memberAvatar"
              [objectAvatar]="orgAvatar"
              [currentUser]="currentUser"
            />

            <bk-category-change-form
              [formData]="formData()"
              [membershipCategory]="membershipCategory()"
              [readOnly]=false
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
  private readonly i18nService = inject(I18nService);
  private readonly confirmI18n = this.i18nService.translateAll({
    changeConfirmation_ok:           PFX + 'changeConfirmation.ok',
    changeConfirmation_cancel:       PFX + 'changeConfirmation.cancel',
    changeConfirmation_confirmation: PFX + 'changeConfirmation.confirmation',
  });
  protected readonly changeConfirmationI18n = computed(() => ({
    ok: this.confirmI18n.changeConfirmation_ok(),
    cancel: this.confirmI18n.changeConfirmation_cancel(),
    confirmation: this.confirmI18n.changeConfirmation_confirmation(),
  } as ChangeConfirmationI18n));

  // inputs
  public membership = input.required<MembershipModel>();
  public membershipCategory = input.required<CategoryListModel>();
  public currentUser = input<UserModel>();
  public title = input('@membership.operation.catChange.label');

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
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
