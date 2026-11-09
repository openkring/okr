// libs/finance/collection/ui/src/lib/auto-top-up.modal.ts
import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { AutoTopUpFormModel, COLLECTION_I18N_KEYS, CollectionI18n } from '@okr/finance-collection-util';

import { AutoTopUpForm } from './auto-top-up.form';

const OFF: AutoTopUpFormModel = { enabled: false, threshold: 0, amount: 0 };

/** Edits the auto top-up settings; dismisses with the edited AutoTopUpFormModel and role 'confirm'. */
@Component({
  selector: 'okr-auto-top-up-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, AutoTopUpForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n.autotopup_title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (saveClicked)="save()" (cancelClicked)="cancel()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-auto-top-up-form [formData]="formData" (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n" [hasPaymentMethod]="hasPaymentMethod()" [showForm]="showForm()"
          (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" />
      }
    </ion-content>
  `,
})
export class AutoTopUpModal {
  private readonly modalController = inject(ModalController);
  // direct inject, no store: the billing store opens this modal
  protected readonly i18n = inject(I18nService).translateAll(COLLECTION_I18N_KEYS) as CollectionI18n;

  public readonly settings = input<AutoTopUpFormModel | undefined>(undefined);
  public readonly hasPaymentMethod = input(false);

  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showForm = signal(true);
  // settings is set once, when the store creates the modal; it never changes afterwards
  protected readonly formData = linkedSignal<AutoTopUpFormModel>(() => ({ ...OFF, ...(this.settings() ?? {}) }));

  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.cancel(),
    save: this.i18n.save(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  protected onFormDataChange(formData: AutoTopUpFormModel): void {
    this.formData.set(formData);
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set({ ...OFF, ...(this.settings() ?? {}) });
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0); // fresh form → clears stale Vest state
  }
}
