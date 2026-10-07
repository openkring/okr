import { Component, computed, effect, input, model, output, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular/standalone';

import { DEFAULT_NOTES, DEFAULT_TAGS, SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { AccountModel, InvoiceModel, UserModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { DateInput, DateInputI18n, ErrorNote, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';

import { INVOICE_NOTES_LENGTH, InvoiceI18n, InvoicePositionInput, invoiceValidations, positionsTotal } from '@okr/finance-invoice-util';

import { InvoicePositionsForm } from './invoice-positions.form';

/**
 * The invoice header plus its positions (spec 1.76). Only what `writeInvoice` accepts is editable:
 * title, dates, receiver and notes; number, state, total and payment date are set by the server and
 * shown read-only. The receiver picker lives in the parent (feature layer): `receiverSelect` asks for
 * it. A draft may still lack its receiver — that is checked when the invoice is issued, not here.
 */
@Component({
  selector: 'okr-invoice-edit-form',
  standalone: true,
  imports: [
    SvgIconPipe,
    ErrorNote, TextInput, DateInput, NotesInput, InvoicePositionsForm,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonItem, IonLabel, IonNote, IonButton, IonIcon,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .receiver { --min-height: 44px; }
    ion-note { font-size: 0.75rem; }
  `],
  template: `
    @if(showForm()) {
      <form novalidate>

        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="4">
                  <!-- the number is assigned when the invoice is issued -->
                  <okr-text-input [i18n]="invoiceIdI18n()" [value]="invoiceId()" [readOnly]="true" />
                </ion-col>
                <ion-col size="12" size-md="8">
                  <okr-text-input [i18n]="titleI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)"
                    [autofocus]="!isReadOnly()" [maxLength]="shortNameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="titleErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none" class="receiver">
                    @if (!isReadOnly()) {
                      <ion-button slot="start" fill="clear" (click)="receiverSelect.emit()" [attr.aria-label]="i18n().receiver_select()">
                        <ion-icon slot="icon-only" src="{{ 'person-add' | svgIcon }}" />
                      </ion-button>
                    }
                    <ion-label>
                      <ion-note>{{ i18n().receiver_label() }}</ion-note>
                      <div>{{ receiverName() || i18n().receiver_none() }}</div>
                    </ion-label>
                  </ion-item>
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="invoiceDateI18n()" [storeDate]="invoiceDate()" (storeDateChange)="onFieldChange('invoiceDate', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="invoiceDateErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="dueDateI18n()" [storeDate]="dueDate()" (storeDateChange)="onFieldChange('dueDate', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="dueDateErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none">
                    <ion-label>
                      <ion-note>{{ i18n().total_label() }}</ion-note>
                      <div>CHF {{ total() }}</div>
                    </ion-label>
                  </ion-item>
                </ion-col>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none">
                    <ion-label>
                      <ion-note>{{ i18n().state_label() }}</ion-note>
                      <div>{{ stateLabel() }}</div>
                    </ion-label>
                  </ion-item>
                </ion-col>
              </ion-row>
              @if (paymentDate()) {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-date-input [i18n]="paymentDateI18n()" [storeDate]="paymentDate()" [readOnly]="true" />
                  </ion-col>
                </ion-row>
              }
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <okr-invoice-positions-form
          [i18n]="i18n()"
          [positions]="positions()"
          (positionsChange)="onPositionsChange($event)"
          [accounts]="accounts()"
          [readOnly]="isReadOnly()"
          (dirty)="dirty.emit($event)"
          (valid)="positionsValid.set($event)"
          (positionAdd)="positionAdd.emit()"
        />

        <okr-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)"
          [maxLength]="notesLength" [readOnly]="isReadOnly()" [errors]="notesErrors()" />
      </form>
    }
  `
})
export class InvoiceEditForm {
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly shortNameLength = SHORT_NAME_LENGTH;
  /** kept in step with the cap the Vest suite enforces on the notes */
  protected readonly notesLength = INVOICE_NOTES_LENGTH;

  /** a model (not input + output) so the signal form can wrap it; its formDataChange output is what the parent binds */
  public readonly formData = model.required<InvoiceModel>();
  public readonly positions = model<InvoicePositionInput[]>([]);
  /** the chart of accounts of the invoice's books; the positions offer its revenue leaves */
  public readonly accounts = input<AccountModel[]>([]);
  public readonly currentUser = input<UserModel | undefined>();
  public readonly allTags = input(DEFAULT_TAGS);
  public readonly readOnly = input(true);
  public readonly showForm = input(true);
  public readonly i18n = input.required<InvoiceI18n>();

  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  /** the parent opens the person/org picker and writes the receiver back into formData */
  public readonly receiverSelect = output<void>();
  /** the parent opens the menu of position kinds and appends the new position */
  public readonly positionAdd = output<void>();

  protected readonly positionsValid = signal(false);

  protected invoiceIdI18n = computed(() => ({
    name: 'invoiceId', label: this.i18n().id_label(), placeholder: '', helper: this.i18n().id_helper()
  } as TextInputI18n));

  protected titleI18n = computed(() => ({
    name: 'title', label: this.i18n().title_label(), placeholder: this.i18n().title_placeholder(), helper: this.i18n().title_helper()
  } as TextInputI18n));

  protected notesI18n = computed(() => ({
    name: 'notes', label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder()
  } as NotesInputI18n));

  protected invoiceDateI18n = computed(() => ({ name: 'invoiceDate', label: this.i18n().invoice_date_label(), placeholder: this.i18n().invoice_date_placeholder(), helper: this.i18n().invoice_date_helper() } as DateInputI18n));
  protected dueDateI18n = computed(() => ({ name: 'dueDate', label: this.i18n().due_date_label(), placeholder: this.i18n().due_date_placeholder(), helper: this.i18n().due_date_helper() } as DateInputI18n));
  protected paymentDateI18n = computed(() => ({ name: 'paymentDate', label: this.i18n().payment_date_label(), placeholder: this.i18n().payment_date_placeholder(), helper: this.i18n().payment_date_helper() } as DateInputI18n));

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  // The suite needs the tags, which validateVestTree does not pass — so the bridge calls it
  // through a closure that adds them.
  private readonly suiteWithContext = (model: InvoiceModel, field?: string) =>
    invoiceValidations(model, '', this.allTags(), field);
  protected readonly invoiceForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, this.suiteWithContext as any));
  private readonly validationResult = computed(() =>
    invoiceValidations(this.formData(), '', this.allTags())
  );
  protected dueDateErrors = computed(() => this.validationResult().getErrors('dueDate'));
  protected invoiceDateErrors = computed(() => this.validationResult().getErrors('invoiceDate'));
  protected titleErrors = computed(() => this.validationResult().getErrors('title'));
  protected notesErrors = computed(() => this.validationResult().getErrors('notes'));

  constructor() {
    effect(() => this.valid.emit(this.invoiceForm().valid() && this.positionsValid()));
  }

  protected readonly title = computed(() => this.formData()?.title ?? '');
  protected readonly invoiceId = computed(() => this.formData()?.invoiceId ?? '');
  protected readonly invoiceDate = computed(() => this.formData()?.invoiceDate ?? '');
  protected readonly dueDate = computed(() => this.formData()?.dueDate ?? '');
  protected readonly paymentDate = computed(() => this.formData()?.paymentDate ?? '');
  protected readonly notes = computed(() => this.formData()?.notes ?? DEFAULT_NOTES);
  protected readonly receiverName = computed(() => {
    const r = this.formData()?.receiver;
    return r ? (r.label || `${r.name1 ?? ''} ${r.name2 ?? ''}`.trim()) : '';
  });
  /** a draft shows the running total of its positions; an invoice without positions its stored amount */
  protected readonly total = computed(() => {
    const positions = this.positions();
    const amount = positions.length > 0 ? positionsTotal(positions) : (this.formData()?.totalAmount?.amount ?? 0) / 100;
    return amount.toFixed(2);
  });
  protected readonly stateLabel = computed(() => {
    const i18n = this.i18n();
    switch (this.formData()?.state) {
      case 'paid': return i18n.state_paid();
      case 'pending': case 'issuing': return i18n.state_pending();
      case 'overdue': return i18n.state_overdue();
      case 'cancelled': return i18n.state_cancelled();
      default: return i18n.state_draft();
    }
  });

  protected onFieldChange(fieldName: string, fieldValue: string | string[]): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onPositionsChange(positions: InvoicePositionInput[]): void {
    this.positions.set(positions);
  }
}
