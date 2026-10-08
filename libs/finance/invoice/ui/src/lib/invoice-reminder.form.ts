import { Component, computed, effect, input, model, output, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import {
  IonCard, IonCardContent, IonCheckbox, IonCol, IonGrid, IonItem, IonLabel, IonList, IonNote, IonRow, IonSegment, IonSegmentButton, IonToggle,
} from '@ionic/angular/standalone';

import { DateInput, DateInputI18n, ErrorNote, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean, fill } from '@okr/shared-util-core';

import {
  applyTemplateDefaults, formatPaymentChf, InvoiceI18n, ReminderCandidate, ReminderChannel, ReminderDefaultField, ReminderFormModel,
  reminderFormValidations, ReminderTemplateLike,
} from '@okr/finance-invoice-util';

/**
 * The "Mahnung erstellen" form (spec 1.90 §6.2): dunning template, date, fee, channel and whether the invoice
 * is attached. Changing the template re-applies its defaults except for the fields the treasurer already changed
 * by hand (`touched`). With `candidates` (Mahnlauf) the due invoices are listed and at least one must be checked.
 */
@Component({
  selector: 'okr-invoice-reminder-form',
  standalone: true,
  imports: [
    ErrorNote, DateInput, NumberInput, StringSelect,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonSegment, IonSegmentButton, IonLabel, IonItem, IonNote, IonToggle,
    IonList, IonCheckbox,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  @if (templates().length > 0) {
                    <okr-string-select [i18n]="templateI18n()" [selectedString]="templateId()"
                      (selectedStringChange)="onTemplateChange($event)"
                      [stringList]="templateKeys()" [labels]="templateNames()" [readOnly]="isReadOnly()" />
                  } @else {
                    <ion-item lines="none">
                      <ion-note>{{ i18n().reminder_no_templates() }}</ion-note>
                    </ion-item>
                  }
                  <okr-error-note [errors]="templateIdErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="dateI18n()" [storeDate]="date()" (storeDateChange)="onDateChange($event)"
                    [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="dateErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="feeI18n()" [value]="feeChf()" (valueChange)="onFeeChange($event)"
                    [min]="0" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="feeChfErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <ion-segment [value]="channel()" (ionChange)="onChannelChange($event.detail.value)" [disabled]="isReadOnly()">
                    <ion-segment-button value="email"><ion-label>{{ i18n().reminder_channel_email() }}</ion-label></ion-segment-button>
                    <ion-segment-button value="post"><ion-label>{{ i18n().reminder_channel_post() }}</ion-label></ion-segment-button>
                  </ion-segment>
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-toggle [checked]="attachInvoice()" (ionChange)="onAttachChange($event.detail.checked)"
                      [disabled]="isReadOnly()">{{ i18n().reminder_attach_invoice() }}</ion-toggle>
                  </ion-item>
                </ion-col>
              </ion-row>
              @if (candidates().length === 0) {
                <ion-row>
                  <ion-col size="12">
                    <ion-item lines="none">
                      <ion-note>{{ openAfterText() }}</ion-note>
                    </ion-item>
                  </ion-col>
                </ion-row>
              } @else {
                <ion-row>
                  <ion-col size="12">
                    <ion-item lines="none">
                      <ion-note>{{ i18n().reminder_mahnlauf_select() }}</ion-note>
                    </ion-item>
                    <ion-list>
                      @for (c of candidates(); track c.key) {
                        <ion-item lines="none">
                          <ion-checkbox [checked]="isSelected(c.key)" (ionChange)="onSelectionChange(c.key, $event.detail.checked)"
                            [disabled]="isReadOnly()">{{ c.label }} · CHF {{ formatChf(c.openAmountChf) }}@if (c.lastReminder) { · {{ c.lastReminder }}}</ion-checkbox>
                        </ion-item>
                      }
                    </ion-list>
                    <okr-error-note [errors]="selectedKeysErrors()" />
                  </ion-col>
                </ion-row>
              }
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `
})
export class InvoiceReminderForm {
  // inputs
  public readonly i18n = input.required<InvoiceI18n>();
  public readonly formData = model.required<ReminderFormModel>();
  /** the dunning templates to choose from */
  public readonly templates = input<ReminderTemplateLike[]>([]);
  /** the default reminder fee in Rappen (the accounting config's) */
  public readonly configFeeRappen = input(0);
  /** the due invoices of a Mahnlauf; empty = reminder for one invoice */
  public readonly candidates = input<ReminderCandidate[]>([]);
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  /** the defaulted fields the treasurer changed by hand — a template change leaves those alone */
  private readonly touched = signal(new Set<ReminderDefaultField>());

  // signal form — the suite needs isMahnlauf, which validateVestTree does not pass, so a closure adds it
  private readonly suiteWithContext = (m: ReminderFormModel) => reminderFormValidations(m, this.candidates().length > 0);
  protected readonly reminderForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, this.suiteWithContext as any),
  );

  private readonly validationResult = vestErrors(this.reminderForm);
  protected readonly templateIdErrors = computed(() => this.validationResult().getErrors('templateId'));
  protected readonly dateErrors = computed(() => this.validationResult().getErrors('date'));
  protected readonly feeChfErrors = computed(() => this.validationResult().getErrors('feeChf'));
  protected readonly selectedKeysErrors = computed(() => this.validationResult().getErrors('selectedKeys'));

  constructor() {
    effect(() => this.valid.emit(this.reminderForm().valid()));
  }

  protected formatChf(chf: number): string {
    return formatPaymentChf(Math.round(chf * 100));
  }

  // field accessors
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly templateId = computed(() => this.formData()?.templateId ?? '');
  protected readonly date = computed(() => this.formData()?.date ?? '');
  protected readonly feeChf = computed(() => this.formData()?.feeChf ?? 0);
  protected readonly channel = computed(() => this.formData()?.channel ?? 'email');
  protected readonly attachInvoice = computed(() => this.formData()?.attachInvoice ?? false);
  protected readonly templateKeys = computed(() => this.templates().map((t) => t.okey));
  protected readonly templateNames = computed(() => this.templates().map((t) => t.name));
  protected readonly openAfterText = computed(() => fill(this.i18n().reminder_open_after(), {
    open: formatPaymentChf(Math.round(((this.formData()?.openAmountChf ?? 0) + this.feeChf()) * 100)),
  }));

  // i18n for the shared/ui primitives
  protected readonly templateI18n = computed(() => ({ name: 'reminderTemplate', label: this.i18n().reminder_template() } as StringSelectI18n));
  protected readonly dateI18n = computed(() => ({
    name: 'reminderDate', label: this.i18n().reminder_date(), placeholder: '', helper: '',
  } as DateInputI18n));
  protected readonly feeI18n = computed(() => ({
    name: 'reminderFee', label: this.i18n().reminder_fee(), placeholder: '', helper: '',
  } as NumberInputI18n));

  protected isSelected(key: string): boolean {
    return (this.formData()?.selectedKeys ?? []).includes(key);
  }

  private touch(field: ReminderDefaultField): void {
    this.touched.update((s) => new Set(s).add(field));
  }

  protected onTemplateChange(id: string): void {
    const template = this.templates().find((t) => t.okey === id);
    this.dirty.emit(true);
    this.formData.update((vm) => applyTemplateDefaults({ ...vm, templateId: id }, template, this.configFeeRappen(), this.touched()));
  }

  protected onDateChange(date: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, date }));
  }

  protected onFeeChange(value: number | string | null): void {
    const fee = Number(value);
    this.touch('feeChf');
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, feeChf: Number.isFinite(fee) ? Math.round(fee * 100) / 100 : 0 }));
  }

  protected onChannelChange(value: unknown): void {
    const channel: ReminderChannel = value === 'post' ? 'post' : 'email';
    this.touch('channel');
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, channel }));
  }

  protected onAttachChange(attachInvoice: boolean): void {
    this.touch('attachInvoice');
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, attachInvoice }));
  }

  protected onSelectionChange(key: string, checked: boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => {
      const rest = (vm.selectedKeys ?? []).filter((k) => k !== key);
      return { ...vm, selectedKeys: checked ? [...rest, key] : rest };
    });
  }
}
