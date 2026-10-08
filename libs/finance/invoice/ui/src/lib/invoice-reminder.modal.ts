import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { safeStructuredClone } from '@okr/shared-util-core';

import {
  INVOICE_I18N_KEYS, InvoiceI18n, ReminderCandidate, ReminderFormModel, ReminderFormResult, ReminderTemplateLike,
} from '@okr/finance-invoice-util';

import { InvoiceReminderForm } from './invoice-reminder.form';

/**
 * The "Mahnung erstellen" dialog (spec 1.90): header + change-confirmation + InvoiceReminderForm. It only collects
 * the input and returns it as `ReminderFormResult` (role `confirm`); the store creates the reminder. The form starts
 * prefilled with the template defaults, which already is a complete reminder — so it starts dirty and "Speichern"
 * is offered at once. `candidates` is empty for one invoice and holds the due invoices for the Mahnlauf.
 */
@Component({
  selector: 'okr-invoice-reminder-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, InvoiceReminderForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: i18n.reminder_create() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-invoice-reminder-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n"
          [templates]="templates()"
          [configFeeRappen]="configFeeRappen()"
          [candidates]="candidates()"
          [readOnly]="false"
          [showForm]="showForm()"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `
})
export class InvoiceReminderModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(INVOICE_I18N_KEYS) as InvoiceI18n;

  // inputs
  public readonly model = input.required<ReminderFormModel>();
  public readonly templates = input<ReminderTemplateLike[]>([]);
  /** Rappen */
  public readonly configFeeRappen = input(0);
  /** the due invoices of a Mahnlauf; empty = one invoice */
  public readonly candidates = input<ReminderCandidate[]>([]);

  // signals
  protected formDirty = signal(true);
  protected formValid = signal(false);
  public formData = linkedSignal(() => safeStructuredClone(this.model()));
  protected showForm = signal(true);

  // derived
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save() } as ChangeConfirmationI18n));

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    const f = this.formData();
    if (!f) return;
    const template = this.templates().find((t) => t.okey === f.templateId);
    const result: ReminderFormResult = {
      templateId: f.templateId, templateName: template?.name ?? f.templateId, date: f.date, feeChf: f.feeChf,
      channel: f.channel, attachInvoice: f.attachInvoice, selectedKeys: f.selectedKeys,
    };
    await dismissOverlay(this.modalController, result, 'confirm');
  }

  public async cancel(): Promise<void> {
    await dismissOverlay(this.modalController, null, 'cancel');
  }

  protected onFormDataChange(formData: ReminderFormModel): void {
    this.formData.set(formData);
  }
}
