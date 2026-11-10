// libs/finance/collection/ui/src/lib/billing-email.modal.ts
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { BillingEmailFormModel, COLLECTION_I18N_KEYS, CollectionI18n } from '@okr/finance-collection-util';

import { BillingEmailForm } from './billing-email.form';

/** Edits the billing e-mail; dismisses with the edited BillingEmailFormModel and role 'confirm'. */
@Component({
  selector: 'okr-billing-email-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, BillingEmailForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n.abo_email() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-billing-email-form [formData]="formData" (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n" [showForm]="showForm()"
          (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" />
      }
    </ion-content>
  `,
})
export class BillingEmailModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: the billing store opens this modal
  protected readonly i18n = inject(I18nService).translateAll(COLLECTION_I18N_KEYS) as CollectionI18n;

  /** the current billing e-mail ('' when none is saved) */
  public readonly email = input('');

  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showForm = signal(true);
  // email is set once, when the store creates the modal; it never changes afterwards
  protected readonly formData = linkedSignal<BillingEmailFormModel>(() => ({ email: this.email() ?? '' }));

  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(),
    save: this.i18n.save(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, { email: this.formData().email.trim() }, 'confirm');
  }

  protected onFormDataChange(formData: BillingEmailFormModel): void {
    this.formData.set(formData);
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set({ email: this.email() ?? '' });
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0); // fresh form → clears stale Vest state
  }
}
