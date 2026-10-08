import { Component, computed, effect, input, model, output, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular/standalone';

import { DEFAULT_NOTES, DEFAULT_TAGS, SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { AccountModel, BillLine, BillModel, CostCenterModel, ProjectModel, UserModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { DateInput, DateInputI18n, ErrorNote, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean, getFullName } from '@okr/shared-util-core';

import { BILL_IBAN_LENGTH, BILL_REFERENCE_LENGTH, BillI18n, billValidations, isBillPaymentDataEditable } from '@okr/finance-bill-util';

import { BillLinesForm } from './bill-lines.form';

/**
 * A native draft bill (spec 1.85 phase 3): vendor, number, title, dates, the QR-bill reference and
 * IBAN, the lines, notes. State, total, payments and payment date are set by the server. The vendor
 * picker lives in the parent (feature layer): `vendorSelect` asks for it. Valid when the header and
 * the lines are valid; a draft may still lack its vendor.
 */
@Component({
  selector: 'okr-bill-edit-form',
  standalone: true,
  imports: [
    SvgIconPipe, ErrorNote, TextInput, DateInput, NotesInput, BillLinesForm,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonItem, IonLabel, IonNote, IonButton, IonIcon,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if(showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none">
                    @if(!structureLocked()) {
                      <ion-button slot="start" fill="clear" (click)="vendorSelect.emit()" [attr.aria-label]="i18n().vendor_select()">
                        <ion-icon slot="icon-only" src="{{ 'search' | svgIcon }}" />
                      </ion-button>
                    }
                    <ion-label>
                      <ion-note>{{ i18n().vendor() }}</ion-note>
                      <div>{{ vendorName() || i18n().vendor_none() }}</div>
                    </ion-label>
                  </ion-item>
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="4">
                  <okr-text-input [i18n]="billIdI18n()" [value]="billId()" (valueChange)="onFieldChange('billId', $event)"
                    [autofocus]="!structureLocked()" [maxLength]="shortNameLength" [readOnly]="structureLocked()" />
                  <okr-error-note [errors]="billIdErrors()" />
                </ion-col>
                <ion-col size="12" size-md="8">
                  <okr-text-input [i18n]="titleI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)"
                    [autofocus]="structureLocked() && !isReadOnly()" [maxLength]="shortNameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="titleErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="billDateI18n()" [storeDate]="billDate()" (storeDateChange)="onFieldChange('billDate', $event)" [readOnly]="structureLocked()" />
                  <okr-error-note [errors]="billDateErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="dueDateI18n()" [storeDate]="dueDate()" (storeDateChange)="onFieldChange('dueDate', $event)" [readOnly]="paymentDataLocked()" />
                  <okr-error-note [errors]="dueDateErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="referenceI18n()" [value]="paymentReference()" (valueChange)="onFieldChange('paymentReference', $event)"
                    [maxLength]="referenceLength" [readOnly]="paymentDataLocked()" />
                  <okr-error-note [errors]="paymentReferenceErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="ibanI18n()" [value]="creditorIban()" (valueChange)="onFieldChange('creditorIban', $event)"
                    [maxLength]="ibanLength" [readOnly]="paymentDataLocked()" />
                  <okr-error-note [errors]="creditorIbanErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <okr-bill-lines-form [i18n]="i18n()" [lines]="lines()" (linesChange)="onLinesChange($event)" [accounts]="accounts()"
          [defaultAccountKey]="defaultAccountKey()" [costCenters]="costCenters()" [costCentersEnabled]="costCentersEnabled()"
          [bookDefaultCostCenterKey]="bookDefaultCostCenterKey()" [projects]="projects()" [readOnly]="isReadOnly()" [mode]="mode()" (dirty)="dirty.emit($event)" (valid)="linesValid.set($event)" />

        <okr-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
      </form>
    }
  `
})
export class BillEditForm {
  /** kept in step with the caps the Vest suite enforces on these fields */
  protected readonly shortNameLength = SHORT_NAME_LENGTH;
  protected readonly referenceLength = BILL_REFERENCE_LENGTH;
  protected readonly ibanLength = BILL_IBAN_LENGTH;

  // inputs
  /** a model (not input + output) so the signal form can wrap it; its formDataChange output is what the parent binds */
  public readonly formData = model.required<BillModel>();
  public readonly lines = model.required<BillLine[]>();
  public readonly accounts = input<AccountModel[]>([]);
  public readonly defaultAccountKey = input('');
  /** Kostenstellen / Kostenträger for the line pickers (spec 1.92); passed through to the lines form */
  public readonly costCenters = input<CostCenterModel[]>([]);
  public readonly costCentersEnabled = input(false);
  public readonly bookDefaultCostCenterKey = input('');
  public readonly projects = input<ProjectModel[]>([]);
  public readonly currentUser = input<UserModel | undefined>();
  public readonly allTags = input(DEFAULT_TAGS);
  public readonly readOnly = input(true);
  public readonly isNew = input(false);
  /** 'details' = a booked or paid bill (spec 1.92): vendor, number and bill date stay as booked; due date, reference and IBAN only while unpaid */
  public readonly mode = input<'draft' | 'details'>('draft');
  public readonly showForm = input(true);
  public readonly i18n = input.required<BillI18n>();

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  /** the parent opens the person/org picker and writes the vendor back into formData */
  public readonly vendorSelect = output<void>();

  protected readonly linesValid = signal(false);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  /** vendor, bill number and bill date: draft only */
  protected readonly structureLocked = computed(() => this.isReadOnly() || this.mode() === 'details');
  /** due date, reference and IBAN: draft, or booked but not yet paid */
  protected readonly paymentDataLocked = computed(() => this.isReadOnly() || (this.mode() === 'details' && !isBillPaymentDataEditable(this.formData())));
  // The suite needs the tags, which validateVestTree does not pass — so the bridge calls it
  // through a closure that adds them.
  private readonly suiteWithContext = (model: BillModel) =>
    billValidations(model, '', this.allTags());
  protected readonly billForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, this.suiteWithContext as any));

  private readonly validationResult = vestErrors(this.billForm);
  protected billDateErrors = computed(() => this.validationResult().getErrors('billDate'));
  protected dueDateErrors = computed(() => this.validationResult().getErrors('dueDate'));
  protected billIdErrors = computed(() => this.validationResult().getErrors('billId'));
  protected titleErrors = computed(() => this.validationResult().getErrors('title'));
  protected paymentReferenceErrors = computed(() => this.validationResult().getErrors('paymentReference'));
  protected creditorIbanErrors = computed(() => this.validationResult().getErrors('creditorIban'));

  constructor() {
    effect(() => this.valid.emit(this.billForm().valid() && this.linesValid()));
  }

  // field accessors
  protected readonly title = computed(() => this.formData()?.title ?? '');
  protected readonly billId = computed(() => this.formData()?.billId ?? '');
  protected readonly billDate = computed(() => this.formData()?.billDate ?? '');
  protected readonly dueDate = computed(() => this.formData()?.dueDate ?? '');
  protected readonly paymentReference = computed(() => this.formData()?.paymentReference ?? '');
  protected readonly creditorIban = computed(() => this.formData()?.creditorIban ?? '');
  protected readonly notes = computed(() => this.formData()?.notes ?? DEFAULT_NOTES);
  protected readonly vendorName = computed(() => {
    const v = this.formData()?.vendor;
    return v ? v.label || getFullName(v.name1, v.name2) : '';
  });

  // i18n for the shared/ui primitives
  protected billIdI18n = computed(() => ({
    name: 'billId', label: this.i18n().id_label(), placeholder: this.i18n().id_placeholder(), helper: this.i18n().id_helper()
  } as TextInputI18n));
  protected titleI18n = computed(() => ({
    name: 'title', label: this.i18n().title_label(), placeholder: this.i18n().title_placeholder(), helper: this.i18n().title_helper()
  } as TextInputI18n));
  protected referenceI18n = computed(() => ({
    name: 'paymentReference', label: this.i18n().reference_label(), placeholder: this.i18n().reference_placeholder(), helper: this.i18n().reference_helper()
  } as TextInputI18n));
  protected ibanI18n = computed(() => ({
    name: 'creditorIban', label: this.i18n().iban_label(), placeholder: this.i18n().iban_placeholder(), helper: this.i18n().iban_helper()
  } as TextInputI18n));
  protected notesI18n = computed(() => ({
    name: 'notes', label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder()
  } as NotesInputI18n));
  protected billDateI18n = computed(() => ({ name: 'billDate', label: this.i18n().bill_date_label(), placeholder: this.i18n().bill_date_placeholder(), helper: this.i18n().bill_date_helper() } as DateInputI18n));
  protected dueDateI18n = computed(() => ({ name: 'dueDate', label: this.i18n().due_date_label(), placeholder: this.i18n().due_date_placeholder(), helper: this.i18n().due_date_helper() } as DateInputI18n));

  protected onFieldChange(fieldName: string, fieldValue: string | string[]): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onLinesChange(lines: BillLine[]): void {
    this.lines.set(lines);
  }
}
