import { Component, computed, effect, input, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';
import { InvoiceModel, UserModel } from '@bk2/shared-models';
import { Chips, DateInput, DateInputI18n, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean } from '@bk2/shared-util-core';

import { InvoiceI18n, invoiceValidations } from '@bk2/finance-invoice-util';

const INVOICE_STATES = ['draft', 'pending', 'paid', 'cancelled'];
const VAT_TYPES = ['included', 'excluded', 'exempt'];

@Component({
  selector: 'bk-invoice-edit-form',
  standalone: true,
  imports: [
    TextInput, DateInput, NumberInput,
    StringSelect, NotesInput, Chips,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if(showForm()) {
      <form novalidate>

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
  public readonly i18n = input.required<InvoiceI18n>();

  protected invoiceIdI18n = computed(() => ({
    name: 'invoiceId', label: this.i18n().invoiceId_label(), placeholder: this.i18n().invoiceId_placeholder(), helper: this.i18n().invoiceId_helper()
  } as TextInputI18n));

  protected titleI18n = computed(() => ({
    name: 'title', label: this.i18n().title_label(), placeholder: this.i18n().title_placeholder(), helper: this.i18n().title_helper()
  } as TextInputI18n));

  protected amountI18n = computed(() => ({
    name: 'amount', label: this.i18n().amount_label(), placeholder: this.i18n().amount_placeholder(), helper: this.i18n().amount_helper()
  } as NumberInputI18n));

  protected notesI18n = computed(() => ({
    name: 'notes', label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder()
  } as NotesInputI18n));

  protected invoiceDateI18n = computed(() => ({ name: 'invoiceDate', label: this.i18n().invoiceDate_label(), placeholder: this.i18n().invoiceDate_placeholder(), helper: this.i18n().invoiceDate_helper() } as DateInputI18n));
  protected dueDateI18n = computed(() => ({ name: 'dueDate', label: this.i18n().dueDate_label(), placeholder: this.i18n().dueDate_placeholder(), helper: this.i18n().dueDate_helper() } as DateInputI18n));
  protected paymentDateI18n = computed(() => ({ name: 'paymentDate', label: this.i18n().paymentDate_label(), placeholder: this.i18n().paymentDate_placeholder(), helper: this.i18n().paymentDate_helper() } as DateInputI18n));
  protected vatTypeI18n = computed(() => ({ name: 'vatType', label: this.i18n().vatType_label() } as StringSelectI18n));
  protected stateI18n   = computed(() => ({ name: 'state',   label: this.i18n().state_label()   } as StringSelectI18n));

  public readonly formDataChange = output<InvoiceModel>();
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  private readonly validationResult = computed(() =>
    invoiceValidations(this.formData(), '', this.allTags())
  );

  constructor() {
    effect(() => this.valid.emit(this.validationResult().isValid()));
  }

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
