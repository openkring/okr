import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryChangeForm } from '@okr/relationship-membership-ui';
import { CategoryChangeFormModel, convertMembershipToCategoryChangeForm, MEMBERSHIP_I18N_KEYS, MembershipI18n } from '@okr/relationship-membership-util';
import { AvatarInfo, CategoryListModel, MembershipModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { getFullName, newAvatarInfo } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';

import { RelationshipToolbar } from '@okr/avatar-ui';
import { dismissOverlay } from '@okr/shared-util-angular';

@Component({
  selector: 'okr-category-change-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, CategoryChangeForm, RelationshipToolbar,
    IonContent
],
  template: `
    <okr-header [i18n]="{ title: title() }" [isModal]="true" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (currentUser(); as currentUser) {
        @if (memberAvatar(); as memberAvatar) {
          @if (orgAvatar(); as orgAvatar) {
            <okr-relationship-toolbar
              relType="membership"
              [subjectAvatar]="memberAvatar"
              [objectAvatar]="orgAvatar"
              [relDesc1]="i18n.reldesc1()" [relDesc2]="i18n.reldesc2()"
              [currentUser]="currentUser"
            />

            <okr-category-change-form
              [formData]="formData()"
              [membershipCategory]="membershipCategory()"
              [readOnly]=false
              [i18n]="i18n"
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
  protected readonly i18n = inject(I18nService).translateAll(MEMBERSHIP_I18N_KEYS) as MembershipI18n;

  // inputs
  public membership = input.required<MembershipModel>();
  public membershipCategory = input.required<CategoryListModel>();
  public currentUser = input<UserModel>();
  public title = input(this.i18n.category_change_label());

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
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save()} as ChangeConfirmationI18n));


  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertMembershipToCategoryChangeForm(this.membership()));  // reset the form
  }

  protected onFormDataChange(formData: CategoryChangeFormModel): void {
    this.formData.set(formData);
  }
}
