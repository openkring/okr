import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';
import { InvoiceModel, UserModel } from '@bk2/shared-models';
import { ChipsComponent, DateInputComponent, NotesInputComponent, NumberInputComponent, StringSelectComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean } from '@bk2/shared-util-core';

import { invoiceValidations } from '@bk2/finance-invoice-util';

const INVOICE_STATES = ['draft', 'pending', 'paid', 'cancelled'];
const VAT_TYPES = ['included', 'excluded', 'exempt'];

@Component({
  selector: 'bk-invoice-edit-form',
  standalone: true,
  imports: [
    vestForms, FormsModule,
    TextInputComponent, DateInputComponent, NumberInputComponent,
    StringSelectComponent, NotesInputComponent, ChipsComponent,
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
                  <bk-text-input name="invoiceId" [value]="invoiceId()" (valueChange)="onFieldChange('invoiceId', $event)"
                    label="@finance.invoice.field.invoiceId.label" [maxLength]="30" [readOnly]="isReadOnly() || !isNew()" />
                </ion-col>
                <ion-col size="8">
                  <bk-text-input name="title" [value]="title()" (valueChange)="onFieldChange('title', $event)"
                    label="@finance.invoice.field.title.label" [maxLength]="100" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="6">
                  <bk-date-input name="invoiceDate" [storeDate]="invoiceDate()" (storeDateChange)="onFieldChange('invoiceDate', $event)"
                    label="@finance.invoice.field.invoiceDate.label" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="6">
                  <bk-date-input name="dueDate" [storeDate]="dueDate()" (storeDateChange)="onFieldChange('dueDate', $event)"
                    label="@finance.invoice.field.dueDate.label" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="6">
                  <bk-number-input name="amount" [value]="amountInCHF()" (valueChange)="onAmountChange($event)"
                    label="@finance.invoice.field.amount.label" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="6">
                  <bk-string-select name="vatType" [stringList]="vatTypes" [selectedString]="vatType()"
                    (selectedStringChange)="onFieldChange('vatType', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="6">
                  <bk-string-select name="state" [stringList]="states" [selectedString]="state()"
                    (selectedStringChange)="onFieldChange('state', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="6">
                  <bk-date-input name="paymentDate" [storeDate]="paymentDate()" (storeDateChange)="onFieldChange('paymentDate', $event)"
                    label="@finance.invoice.field.paymentDate.label" [readOnly]="isReadOnly()" />
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
                  <bk-notes name="notes" [value]="notes()" (valueChange)="onFieldChange('notes', $event)"
                    label="@finance.invoice.field.notes.label" [readOnly]="isReadOnly()" />
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
