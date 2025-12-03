import { AsyncPipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { IonAccordionGroup, IonCard, IonCardContent, IonContent, ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { MembershipModel, MembershipModelName, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent, RelationshipToolbarComponent } from '@bk2/shared-ui';
import { coerceBoolean, getFullName, hasRole } from '@bk2/shared-util-core';

import { CommentsAccordionComponent } from '@bk2/comment-feature';

import { MembershipFormComponent } from '@bk2/relationship-membership-ui';
import { convertFormToMembership, convertMembershipToForm, MembershipFormModel } from '@bk2/relationship-membership-util';
import { MembershipEditStore } from './membership-edit.store';

@Component({
  selector: 'bk-membership-edit-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    CommentsAccordionComponent, MembershipFormComponent, RelationshipToolbarComponent, HeaderComponent,
    ChangeConfirmationComponent,
    IonContent, IonAccordionGroup, IonCard, IonCardContent
  ],
  providers: [MembershipEditStore],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <bk-header title="{{ headerTitle() | translate | async }}" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content no-padding>
      <bk-relationship-toolbar [titleArguments]="titleArguments()" />
      @if(mcat(); as mcat) {
        <bk-membership-form
          [formData]="formData()"
          [membershipCategories]="mcat"
          [allTags]="tags()"
          [readOnly]="isReadOnly()"
          [priv]="priv()"
          [currentUser]="currentUser()"
          (formDataChange)="onFormDataChange($event)"
        />
      }

      @if(hasRole('privileged') || !isReadOnly()) {
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-accordion-group value="comments">
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
  protected readonly membershipEditStore = inject(MembershipEditStore);

  // inputs
  public membership = input.required<MembershipModel>();
  public currentUser = input<UserModel | undefined>();
  public readOnly = input<boolean>(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => convertMembershipToForm(this.membership()));

  // derived signals
  protected headerTitle = computed(() => this.isReadOnly() ? '@membership.operation.view.label' : '@membership.operation.update.label');
  protected priv = computed(() => this.membershipEditStore.privacySettings());
  protected readonly parentKey = computed(() => `${MembershipModelName}.${this.memberKey()}`);
  protected readonly name = computed(() => getFullName(this.membership().memberName1, this.membership().memberName2, this.currentUser()?.nameDisplay));
  protected tags = computed(() => this.membershipEditStore.getTags());
  protected titleArguments = computed(() => ({
    relationship: 'membership',
    subjectName: this.name(),
    subjectIcon: this.membership().memberModelType === 'person' ? 'person' : 'org',
    subjectUrl: this.membership().memberModelType === 'person' ? `/person/${this.membership().memberKey}` : `/org/${this.membership().memberKey}`,
    objectName: this.membership().orgName,
    objectIcon: 'org',
    objectUrl: `/org/${this.membership().orgKey}`
  }));
  protected memberKey = computed(() => this.formData().memberKey ?? '');
  protected mcat = computed(() => this.membershipEditStore.membershipCategory());


  constructor() {
    effect(() => {
      this.membershipEditStore.setMembership(this.membership());
    });
  }

  /******************************* actions *************************************** */
  public async save(): Promise<boolean> {
    this.formDirty.set(false);
    return this.modalController.dismiss(convertFormToMembership(this.formData(), this.membership()), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertMembershipToForm(this.membership()));  // reset the form
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }

  protected onFormDataChange(formData: MembershipFormModel): void {
    this.formData.set(formData);
  }
}
