import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AccountModel, OrgModel, PersonModel, ResourceModel, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmationComponent, HeaderComponent } from '@bk2/shared-ui';
import { hasRole } from '@bk2/shared-util-core';

import { convertOwnershipToForm, newOwnership, OwnershipFormModel } from '@bk2/relationship-ownership-util';
import { OwnershipNewFormComponent } from './ownership-new.form';

@Component({
  selector: 'bk-ownership-new-modal',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe,
    HeaderComponent, OwnershipNewFormComponent,
    ChangeConfirmationComponent,
    IonContent
  ],
  template: `
    <bk-header title="{{ '@ownership.operation.create.label' | translate | async }}" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content>
      @if(formData(); as formData) {
        <bk-ownership-new-form
          [formData]="formData"
          [currentUser]="currentUser()"
          [readOnly]="readOnly()"
          (formDataChange)="onFormDataChange($event)"
        />
      }
    </ion-content>
  `
})
export class OwnershipNewModalComponent {
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);

  // inputs
  public owner = input.required<PersonModel | OrgModel>();
  public resource = input.required<ResourceModel | AccountModel>(); 
  public currentUser = input<UserModel | undefined>();

   // signals
  protected formDirty = signal(false);
  protected formValid = signal(true);   // default to true as the form is prefilled
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected formData = linkedSignal(() => convertOwnershipToForm(newOwnership(this.owner(), this.resource(), this.appStore.tenantId())));

  // derived signals
  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));

 /******************************* actions *************************************** */
  public async save(): Promise<void> {
    this.formDirty.set(false);
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(convertOwnershipToForm(newOwnership(this.owner(), this.resource(), this.appStore.tenantId())));  // reset the form
  }

  protected onFormDataChange(formData: OwnershipFormModel): void {
    this.formData.set(formData);
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.appStore.currentUser());
  }
}
