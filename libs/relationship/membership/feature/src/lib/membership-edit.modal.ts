import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { AvatarInfo, CategoryListModel, MembershipModel, MembershipModelName, PrivacySettings, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent, RelationshipToolbarComponent } from '@bk2/shared-ui';
import { coerceBoolean, getFullName, hasRole, newAvatarInfo } from '@bk2/shared-util-core';

import { CommentsAccordionComponent } from '@bk2/comment-feature';
import { DocumentsAccordionComponent } from '@bk2/document-feature';

import { MembershipFormComponent } from '@bk2/relationship-membership-ui';

@Component({
  selector: 'bk-membership-edit-modal',
  standalone: true,
  imports: [
    CommentsAccordionComponent, MembershipFormComponent, RelationshipToolbarComponent, HeaderComponent,
    ChangeConfirmationComponent, DocumentsAccordionComponent,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  // we are injecting the MembershipStore as a singleton, no need to provide it here
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-header [title]="headerTitle()" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(currentUser(); as currentUser) {
        <bk-relationship-toolbar
          relType="membership"
          [subjectAvatar]="memberAvatar()"
          [objectAvatar]="orgAvatar()"
          [currentUser]="currentUser"
        />
        @if(mcat(); as mcat) {
          <bk-membership-form
            [formData]="formData()"
            (formDataChange)="onFormDataChange($event)"
            [currentUser]="currentUser"
            [membershipCategories]="mcat"
            [allTags]="tags()"
            [readOnly]="isReadOnly()"
            [priv]="priv()"
            (dirty)="formDirty.set($event)"
            (valid)="formValid.set($event)"
          />
        }
      }

      @if(hasRole('privileged') && !isReadOnly() && !isNew()) {
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-accordion-group value="comments">
              <bk-documents-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
              <bk-comments-accordion [parentKey]="parentKey()" [readOnly]="isReadOnly()" />
            </ion-accordion-group>
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `
})
export class MembershipEditModalComponent {
  private readonly modalController = inject(ModalController);

  // inputs
  public membership = input.required<MembershipModel>();
  public currentUser = input.required<UserModel>();
  public tags = input.required<string>();
  public priv = input.required<PrivacySettings>();
  public mcat = input.required<CategoryListModel>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => structuredClone(this.membership()));
  protected showForm = signal(true);

  // derived signals
  protected headerTitle = computed(() => this.isReadOnly() ? '@membership.operation.view.label' : '@membership.operation.update.label');
  protected readonly parentKey = computed(() => `${MembershipModelName}.${this.memberKey()}`);
  protected readonly name = computed(() => getFullName(this.membership().memberName1, this.membership().memberName2, this.currentUser()?.nameDisplay));
  protected memberAvatar = computed<AvatarInfo>(() => {
    const m = this.membership();
      return newAvatarInfo(m.memberKey, m.memberName1, m.memberName2, m.memberModelType, '', '', this.name());
  });
  protected orgAvatar = computed<AvatarInfo>(() => {
    const m = this.membership();
      return newAvatarInfo(m.orgKey, '', m.orgName, m.orgModelType, '', '', m.orgName);
  });
  protected memberKey = computed(() => this.formData().memberKey ?? '');
  protected isNew = computed(() => !this.formData().bkey);

  /******************************* actions *************************************** */
  public async save(): Promise<boolean> {
    return this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(structuredClone(this.membership()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: MembershipModel): void {
    this.formData.set(formData);
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}
