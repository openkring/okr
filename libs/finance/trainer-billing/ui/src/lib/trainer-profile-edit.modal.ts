import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { TRAINER_BILLING_I18N_KEYS, TrainerBillingI18n } from '@okr/finance-trainer-billing-util';
import { I18nService } from '@okr/shared-i18n';
import { AddressModel, TrainerProfileModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';

import { TrainerProfileForm } from './trainer-profile.form';

/** Dismiss role when the trainer wants to add an address first; the data is the unsaved draft of the profile. */
export const TRAINER_PROFILE_ADD_ADDRESS_ROLE = 'addAddress';

/**
 * The trainer's invoice profile («Rechnungsangaben», spec 1.167 §7.2). Presentational: dismisses with the edited copy
 * and role `confirm`; the caller saves it (`TrainerBillingService.saveProfile`). The caller passes the person's own
 * postal addresses and bank accounts. «Add an address» dismisses with role {@link TRAINER_PROFILE_ADD_ADDRESS_ROLE}
 * and the draft, so the caller can lead to the person's profile (and keep the draft if it wants).
 */
@Component({
  selector: 'okr-trainer-profile-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, TrainerProfileForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n.profile_edit_title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-trainer-profile-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [postalAddresses]="postalAddresses()"
          [bankAddresses]="bankAddresses()"
          [tenantId]="tenantId()"
          [personKey]="personKey()"
          [readOnly]="isReadOnly()"
          [showForm]="showForm()"
          [i18n]="i18n"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
          (addAddress)="addAddress()"
        />
      }
    </ion-content>
  `,
})
export class TrainerProfileEditModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: a store that opens this modal must not be imported back
  protected readonly i18n = inject(I18nService).translateAll(TRAINER_BILLING_I18N_KEYS) as TrainerBillingI18n;

  public readonly profile = input.required<TrainerProfileModel>();
  public readonly personKey = input.required<string>();
  public readonly tenantId = input.required<string>();
  public readonly postalAddresses = input<AddressModel[]>([]);
  public readonly bankAddresses = input<AddressModel[]>([]);
  public readonly readOnly = input(false);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected formDirty = signal(false);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.profile()));
  protected showForm = signal(true);

  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.changeConfirmation_cancel(),
    save: this.i18n.changeConfirmation_ok(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.profile()));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // fresh form → clears stale Vest state
  }

  protected async addAddress(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), TRAINER_PROFILE_ADD_ADDRESS_ROLE);
  }

  protected onFormDataChange(formData: TrainerProfileModel): void {
    this.formData.set(formData);
  }
}
