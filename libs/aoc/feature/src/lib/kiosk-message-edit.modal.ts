import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { safeStructuredClone } from '@okr/shared-util-core';
import { AOC_I18N_KEYS, AocI18n, KioskMessageFormData } from '@okr/aoc-util';
import { I18nService } from '@okr/shared-i18n';

import { KioskMessageForm } from './kiosk-message.form';

/**
 * Compose the message that is popped on a kiosk device. Standard edit-modal structure:
 * header + change-confirmation (valid AND dirty) + content. No submit button — the store
 * writes what `save()` returns onto `kiosk-status/{uid}`.
 */
@Component({
  selector: 'okr-kiosk-message-edit-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation,
    KioskMessageForm,
    IonContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <okr-header [i18n]="{ title: labels().title }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-kiosk-message-form
          [formData]="formData" (formDataChange)="onFormDataChange($event)"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class KioskMessageEditModal {
  private readonly modalController = inject(ModalController);

  // inputs
  public kioskMessage = input.required<KioskMessageFormData>();
  public title = input<string>();
  public okLabel = input<string>();
  public cancelLabel = input<string>();

  private readonly i18n = inject(I18nService).translateAll(AOC_I18N_KEYS) as AocI18n;
  protected readonly labels = computed(() => ({
    title:  this.title()  ?? this.i18n.kiosk_message_title(),
    ok:     this.okLabel() ?? this.i18n.kiosk_message_send(),
    cancel: this.cancelLabel() ?? this.i18n.cancel(),
  }));

  // signals
  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.cancelLabel(), save: this.okLabel() } as ChangeConfirmationI18n));

  protected formData = linkedSignal(() => safeStructuredClone(this.kioskMessage()));
  protected showForm = signal(true);

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    await this.modalController.dismiss(this.formData(), 'confirm');
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.kioskMessage()));  // reset the form
    // destroy and recreate the form so Vest state is fully reset
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: KioskMessageFormData): void {
    this.formData.set(formData);
  }
}
