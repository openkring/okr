import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { OwnershipModel, RoleName, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { hasRole, safeStructuredClone } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';
import { OWNERSHIP_I18N_KEYS, OwnershipI18n } from '@okr/relationship-ownership-util';

import { OwnershipNewForm } from './ownership-new.form';

@Component({
  selector: 'okr-ownership-new-modal',
  standalone: true,
  imports: [
    Header, OwnershipNewForm,
    ChangeConfirmation,
    IonContent
  ],
  template: `
    <okr-header [i18n]="{ title: i18n.create() }" [isModal]="true" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content>
      @if(formData(); as formData) {
        <okr-ownership-new-form
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
  protected readonly i18n = inject(I18nService).translateAll(OWNERSHIP_I18N_KEYS) as OwnershipI18n;

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
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save()} as ChangeConfirmationI18n));

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
