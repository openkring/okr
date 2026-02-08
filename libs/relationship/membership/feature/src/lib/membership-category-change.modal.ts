import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryChangeFormComponent } from '@bk2/relationship-membership-ui';
import { CategoryChangeFormModel, convertMembershipToCategoryChangeForm } from '@bk2/relationship-membership-util';
import { AvatarInfo, CategoryListModel, MembershipModel, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { getFullName, newAvatarInfo } from '@bk2/shared-util-core';
import { RelationshipToolbarComponent } from '@bk2/avatar-ui';

@Component({
  selector: 'bk-category-change-modal',
  standalone: true,
  imports: [
    HeaderComponent, ChangeConfirmationComponent, CategoryChangeFormComponent, RelationshipToolbarComponent,
    IonContent
],
  template: `
    <bk-header [title]="title()" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
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
            />
          }
        }
      }
    </ion-content>
  `,
})
export class CategoryChangeModalComponent {
  private readonly modalController = inject(ModalController);

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
