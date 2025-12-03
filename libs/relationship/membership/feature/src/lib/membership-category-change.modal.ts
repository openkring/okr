import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { CategoryChangeFormComponent } from '@bk2/relationship-membership-ui';
import { CategoryChangeFormModel, convertMembershipToCategoryChangeForm } from '@bk2/relationship-membership-util';
import { TranslatePipe } from '@bk2/shared-i18n';
import { CategoryListModel, MembershipModel, OrgModelName, PersonModelName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent, RelationshipToolbarComponent } from '@bk2/shared-ui';
import { getFullName } from '@bk2/shared-util-core';
import { AppStore } from '@bk2/shared-feature';

@Component({
  selector: 'bk-category-change-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent, ChangeConfirmationComponent, CategoryChangeFormComponent, RelationshipToolbarComponent,
    IonContent
],
  template: `
    <bk-header title="{{ title() | translate | async}}" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    } 
    <ion-content no-padding>
      <bk-relationship-toolbar [titleArguments]="titleArguments()" />

      <bk-category-change-form
        [formData]="formData()"
        [membershipCategory]="membershipCategory()"
        [readOnly]=false
        (formDataChange)="onFormDataChange($event)"
      />
    </ion-content>
  `,
})
export class CategoryChangeModalComponent {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

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
  private readonly subjectIcon = computed(() => this.appStore.getDefaultIcon(this.membership().memberModelType));
  private readonly orgIcon = computed(() => this.appStore.getDefaultIcon(OrgModelName));
  private readonly slug = computed(() => this.membership().memberModelType === 'person' ? PersonModelName : OrgModelName);
  protected titleArguments = computed(() => ({
    relationship: 'membership',
    subjectName: this.name(),
    subjectIcon: this.subjectIcon(),
    subjectUrl: `/${this.slug()}/${this.membership().memberKey}`,
    objectName: this.membership().orgName,
    objectIcon: this.orgIcon(),
    objectUrl: `/org/${this.membership().orgKey}`
  }));
  
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
