import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { OwnershipModel, RoleName, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { hasRole, safeStructuredClone } from '@okr/shared-util-core';
import { I18nService } from '@okr/shared-i18n';
import { OWNERSHIP_I18N_KEYS, OwnershipI18n } from '@okr/relationship-ownership-util';
import { dismissOverlay } from '@okr/shared-util-angular';

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
  // a new ownership arrives complete (owner, resource, validFrom = today): it is an unsaved
  // change from the start, so the banner shows immediately and one tap saves it
  protected formDirty = signal(true);
  protected formValid = signal(true);
  protected formData = linkedSignal(() => safeStructuredClone(this.ownership()));

  // derived signals
  protected readOnly = computed(() => !hasRole('resourceAdmin', this.currentUser()));
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save()} as ChangeConfirmationI18n));

 /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  /** Reverting a new record would only restore the same prefilled data — cancel discards it. */
  public async cancel(): Promise<void> {
    await dismissOverlay(this.modalController, undefined, 'cancel');
  }

  protected onFormDataChange(formData: OwnershipModel): void {
    this.formData.set(formData);
  }

  protected hasRole(role: RoleName | undefined): boolean {
    return hasRole(role, this.currentUser());
  }
}
