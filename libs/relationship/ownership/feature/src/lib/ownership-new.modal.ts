import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { OwnershipModel, RoleName, UserModel } from '@bk2/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@bk2/shared-ui';
import { hasRole, safeStructuredClone } from '@bk2/shared-util-core';

import { OwnershipNewForm } from './ownership-new.form';
import { OwnershipStore } from './ownership.store';

@Component({
  selector: 'bk-ownership-new-modal',
  standalone: true,
  imports: [
    Header, OwnershipNewForm,
    ChangeConfirmation,
    IonContent
  ],
  providers: [OwnershipStore],
  template: `
    <bk-header [i18n]="{ title: store.i18n.create_label() }" [isModal]="true" />
    @if(showConfirmation()) {
      <bk-change-confirmation [showCancel]=true [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (okClicked)="save()" />
    }
    <ion-content>
      @if(formData(); as formData) {
        <bk-ownership-new-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="currentUser()"
          [readOnly]="readOnly()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class OwnershipNewModal {
  private readonly modalController = inject(ModalController);
  protected readonly store = inject(OwnershipStore);

  // inputs
  public ownership = input.required<OwnershipModel>();
  public currentUser = input<UserModel | undefined>();

   // signals
  protected formDirty = signal(false);
  protected formValid = signal(true);   // default to true as the form is prefilled
  protected formData = linkedSignal(() => safeStructuredClone(this.ownership()));
  protected showForm = signal(true);

  // derived signals
  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ok: this.store.i18n.ok(), cancel: this.store.i18n.cancel(), confirmation: this.store.i18n.save()} as ChangeConfirmationI18n));

 /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.ownership()));  // reset the form
    // This destroys and recreates the <form scVestForm> → Vest fully resets
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: OwnershipModel): void {
    this.formData.set(formData);
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}
