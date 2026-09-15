import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { AccountModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { safeStructuredClone } from '@okr/shared-util-core';

import { BANK_IMPORT_I18N_KEYS, BankImportI18n, JournalAccountMap } from '@okr/finance-bank-import-util';

import { JournalAccountMapForm } from './journal-account-map.form';

/**
 * Confirms the bexio-account → tenant-account mapping before a journal import posts anything
 * (spec 1.60 §12.2). The mapping is always a proposal, so the confirmation bar shows from the
 * start once every row is resolved; cancel or the header's close dismisses without a result.
 */
@Component({
  selector: 'okr-journal-account-map-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, JournalAccountMapForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n.journal_title() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-journal-account-map-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [accounts]="accounts()"
          [showForm]="showForm()"
          [i18n]="i18n"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class JournalAccountMapModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(BANK_IMPORT_I18N_KEYS) as BankImportI18n;

  public readonly mapping = input.required<JournalAccountMap>();
  public readonly accounts = input<AccountModel[]>([]);

  protected formDirty = signal(true);   // a proposal: confirming is the point, not editing
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.mapping()));
  protected showForm = signal(true);

  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n.changeConfirmation_cancel(),
    save: this.i18n.changeConfirmation_ok(),
  } as ChangeConfirmationI18n));

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    await dismissOverlay(this.modalController, undefined, 'cancel');
  }

  protected onFormDataChange(data: JournalAccountMap): void {
    this.formData.set(data);
  }
}
