import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, OnInit, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { convertMemberAndOrgToNewForm, MembershipNewFormModel } from '@bk2/relationship-membership-util';
import { TranslatePipe } from '@bk2/shared-i18n';
import { OrgModel, PersonModel, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';
import { MembershipNewFormComponent } from './membership-new.form';
import { MembershipNewStore } from './membership-new.store';

@Component({
  selector: 'bk-membership-new-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    MembershipNewFormComponent, HeaderComponent,
    ChangeConfirmationComponent,
    IonContent
  ],
  providers: [MembershipNewStore],
  template: `
    <bk-header title="{{ '@membership.operation.create.label' | translate | async }}" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content>
      @if(mcat(); as mcat) {
        <bk-membership-new-form
          [formData]="formData()"
          [membershipCategories]="mcat"
          [currentUser]="currentUser()"
          [readOnly]="readOnly()"
          (formDataChange)="onFormDataChange($event)"
        />
      }
    </ion-content>
  `
})
export class MembershipNewModalComponent implements OnInit {
  private readonly modalController = inject(ModalController);
  protected readonly membershipNewStore = inject(MembershipNewStore);

  // inputs
  public member = input.required<PersonModel | OrgModel>();
  public org = input.required<OrgModel>(); 
  public currentUser = input<UserModel | undefined>();
  public modelType = input.required<'person' | 'org' | 'group'>();  

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  public formData = linkedSignal(() => convertMemberAndOrgToNewForm(this.member(), this.org(), this.membershipNewStore.currentUser(), this.modelType()));

  // derived signals
  protected mcat = computed(() => this.membershipNewStore.membershipCategory());
  protected readOnly = computed(() => !hasRole('memberAdmin', this.currentUser()));

  protected formIsValid = signal(false);

  ngOnInit() {
    // as we prepared everything with defaultMember and defaultOrg, we already have a valid form, so we need to signal this here.
    this.onValidChange(true);
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(this.formData(), 'confirm');  
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertMemberAndOrgToNewForm(this.member(), this.org(), this.membershipNewStore.currentUser(), this.modelType()));  // reset the form
  }

  protected onFormDataChange(formData: MembershipNewFormModel): void {
    this.formData.set(formData);
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.membershipNewStore.currentUser());
  }

  protected onValidChange(valid: boolean): void {
    this.formIsValid.set(valid);
    const _orgId = this.formData().orgKey;
    if (_orgId && _orgId !== this.membershipNewStore.orgId()) {
      this.membershipNewStore.setOrgId(_orgId);
    }
  }
}
