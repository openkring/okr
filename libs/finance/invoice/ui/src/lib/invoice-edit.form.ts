import { Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';
import { InvoiceModel, UserModel } from '@bk2/shared-models';
import { Chips, DateInput, DateInputI18n, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { invoiceValidations } from '@bk2/finance-invoice-util';
import { PFX } from './scope';

const INVOICE_STATES = ['draft', 'pending', 'paid', 'cancelled'];
const VAT_TYPES = ['included', 'excluded', 'exempt'];

@Component({
  selector: 'bk-invoice-edit-form',
  standalone: true,
  imports: [
    vestForms, FormsModule,
    TextInput, DateInput, NumberInput,
    StringSelect, NotesInput, Chips,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if(showForm()) {
      <form scVestForm
        [formValue]="formData()"
        [suite]="suite"
        (dirtyChange)="dirty.emit($event)"
        (validChange)="valid.emit($event)"
        (formValueChange)="onFormChange($event)">

        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="4">
                  <bk-text-input [i18n]="invoiceIdI18n()" [value]="invoiceId()" (valueChange)="onFieldChange('invoiceId', $event)"
                    [maxLength]="30" [readOnly]="isReadOnly() || !isNew()" />
                </ion-col>
                <ion-col size="8">
                  <bk-text-input [i18n]="titleI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)"
                    [maxLength]="100" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="6">
                  <bk-date-input [i18n]="invoiceDateI18n()" [storeDate]="invoiceDate()" (storeDateChange)="onFieldChange('invoiceDate', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="6">
                  <bk-date-input [i18n]="dueDateI18n()" [storeDate]="dueDate()" (storeDateChange)="onFieldChange('dueDate', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="6">
                  <bk-number-input [i18n]="amountI18n()" [value]="amountInCHF()" (valueChange)="onAmountChange($event)"
                    [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="6">
                  <bk-string-select [i18n]="vatTypeI18n()" [stringList]="vatTypes" [selectedString]="vatType()"
                    (selectedStringChange)="onFieldChange('vatType', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="6">
                  <bk-string-select [i18n]="stateI18n()" [stringList]="states" [selectedString]="state()"
                    (selectedStringChange)="onFieldChange('state', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="6">
                  <bk-date-input [i18n]="paymentDateI18n()" [storeDate]="paymentDate()" (storeDateChange)="onFieldChange('paymentDate', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)"
                    [allChips]="allTags()" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <bk-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `
})
export class InvoiceEditForm {
  public readonly formData = input.required<InvoiceModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly allTags = input(DEFAULT_TAGS);
  public readonly readOnly = input(true);
  public readonly isNew = input(false);
  public readonly showForm = input(true);

  private readonly i18nService = inject(I18nService);
  protected readonly fieldI18n = this.i18nService.translateAll({
    invoiceId_label:      PFX + 'invoiceId.label',
    invoiceId_placeholder: PFX + 'invoiceId.placeholder',
    invoiceId_helper:     PFX + 'invoiceId.helper',
    title_label:          PFX + 'title.label',
    title_placeholder:    PFX + 'title.placeholder',
    title_helper:         PFX + 'title.helper',
    amount_label:         PFX + 'amount.label',
    amount_placeholder:   PFX + 'amount.placeholder',
    amount_helper:        PFX + 'amount.helper',
    notes_label:          PFX + 'notes.label',
    notes_placeholder:    PFX + 'notes.placeholder',
    invoiceDate_label:        PFX + 'invoiceDate.label',
    invoiceDate_placeholder:  PFX + 'invoiceDate.placeholder',
    invoiceDate_helper:       PFX + 'invoiceDate.helper',
    dueDate_label:            PFX + 'dueDate.label',
    dueDate_placeholder:      PFX + 'dueDate.placeholder',
    dueDate_helper:           PFX + 'dueDate.helper',
    paymentDate_label:        PFX + 'paymentDate.label',
    paymentDate_placeholder:  PFX + 'paymentDate.placeholder',
    paymentDate_helper:       PFX + 'paymentDate.helper',
    vatType_label:            PFX + 'vatType.label',
    state_label:              PFX + 'state.label',
  });

  protected invoiceIdI18n = computed(() => ({
    name: 'invoiceId', label: this.fieldI18n.invoiceId_label(), placeholder: this.fieldI18n.invoiceId_placeholder(), helper: this.fieldI18n.invoiceId_helper()
  } as TextInputI18n));

  protected titleI18n = computed(() => ({
    name: 'title', label: this.fieldI18n.title_label(), placeholder: this.fieldI18n.title_placeholder(), helper: this.fieldI18n.title_helper()
  } as TextInputI18n));

  protected amountI18n = computed(() => ({
    name: 'amount', label: this.fieldI18n.amount_label(), placeholder: this.fieldI18n.amount_placeholder(), helper: this.fieldI18n.amount_helper()
  } as NumberInputI18n));

  protected notesI18n = computed(() => ({
    name: 'notes', label: this.fieldI18n.notes_label(), placeholder: this.fieldI18n.notes_placeholder()
  } as NotesInputI18n));

  protected invoiceDateI18n = computed(() => ({ name: 'invoiceDate', label: this.fieldI18n.invoiceDate_label(), placeholder: this.fieldI18n.invoiceDate_placeholder(), helper: this.fieldI18n.invoiceDate_helper() } as DateInputI18n));
  protected dueDateI18n = computed(() => ({ name: 'dueDate', label: this.fieldI18n.dueDate_label(), placeholder: this.fieldI18n.dueDate_placeholder(), helper: this.fieldI18n.dueDate_helper() } as DateInputI18n));
  protected paymentDateI18n = computed(() => ({ name: 'paymentDate', label: this.fieldI18n.paymentDate_label(), placeholder: this.fieldI18n.paymentDate_placeholder(), helper: this.fieldI18n.paymentDate_helper() } as DateInputI18n));
  protected vatTypeI18n = computed(() => ({ name: 'vatType', label: this.fieldI18n.vatType_label() } as StringSelectI18n));
  protected stateI18n   = computed(() => ({ name: 'state',   label: this.fieldI18n.state_label()   } as StringSelectI18n));

  public readonly formDataChange = output<InvoiceModel>();
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly suite = invoiceValidations;

  protected readonly states = INVOICE_STATES;
  protected readonly vatTypes = VAT_TYPES;

  protected readonly title = computed(() => this.formData()?.title ?? '');
  protected readonly invoiceId = computed(() => this.formData()?.invoiceId ?? '');
  protected readonly invoiceDate = computed(() => this.formData()?.invoiceDate ?? '');
  protected readonly dueDate = computed(() => this.formData()?.dueDate ?? '');
  protected readonly amountInCHF = computed(() => (this.formData()?.totalAmount?.amount ?? 0) / 100);
  protected readonly vatType = computed(() => this.formData()?.vatType ?? 'exempt');
  protected readonly state = computed(() => this.formData()?.state ?? 'draft');
  protected readonly paymentDate = computed(() => this.formData()?.paymentDate ?? '');
  protected readonly tags = computed(() => this.formData()?.tags ?? DEFAULT_TAGS);
  protected readonly notes = computed(() => this.formData()?.notes ?? DEFAULT_NOTES);

  protected onFormChange(formData: InvoiceModel): void {
    this.formDataChange.emit(formData);
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[]): void {
    this.dirty.emit(true);
    this.formDataChange.emit({ ...this.formData(), [fieldName]: fieldValue });
  }

  protected onAmountChange(amountInCHF: number | null): void {
    const cents = Math.round((amountInCHF ?? 0) * 100);
    const current = this.formData();
    this.formDataChange.emit({
      ...current,
      totalAmount: {
        amount: cents,
        currency: current.totalAmount?.currency ?? 'CHF',
        periodicity: current.totalAmount?.periodicity ?? 'one-time',
      },
    });
    this.dirty.emit(true);
  }
}
