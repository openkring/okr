import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular';

import { TrainerBillingI18n, WORK_ENTRY_LABEL_LENGTH, WORK_ENTRY_MAX_DAYS, WORK_ENTRY_MAX_HOURS, workEntryValidations } from '@okr/finance-trainer-billing-util';
import { TrainerAgreementModel, WorkEntryModel } from '@okr/shared-models';
import { DateInput, DateInputI18n, ErrorNote, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';

/**
 * A work entry of a trainer (spec 1.167 §7.3): date, service, quantity and the text for the invoice. No rate and no
 * amount (D4): both are frozen only when the invoice is sent.
 *
 * `agreements` are the caller's agreements the entry may be booked on. A new entry with more than one shows a choice;
 * choosing one copies its tenants, books and person into the entry (the rules require them to match). A stored entry
 * keeps its agreement. The services offered are the live ones of the entry's agreement; the unit of the chosen service
 * decides whether the quantity is in hours (quarter hours, up to 24) or days (half days, up to 1).
 */
@Component({
  selector: 'okr-work-entry-form',
  standalone: true,
  imports: [DateInput, StringSelect, NumberInput, TextInput, ErrorNote, IonGrid, IonRow, IonCol, IonCard, IonCardContent],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              @if (canChooseAgreement()) {
                <ion-row>
                  <ion-col size="12">
                    <okr-string-select [i18n]="agreementI18n()" [stringList]="agreementKeys()" [labels]="agreementLabels()"
                      [selectedString]="agreementKey()" (selectedStringChange)="onAgreementChange($event)" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="agreementKeyErrors()" />
                  </ion-col>
                </ion-row>
              }
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="dateI18n()" [storeDate]="date()" (storeDateChange)="onFieldChange('date', $event)"
                    [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="dateErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="serviceI18n()" [stringList]="serviceKeys()" [labels]="serviceLabels()"
                    [selectedString]="serviceKey()" (selectedStringChange)="onFieldChange('serviceKey', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="serviceKeyErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="quantityI18n()" [value]="quantity()" (valueChange)="onFieldChange('quantity', $event)"
                    [min]="0" [max]="maxQuantity()" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="quantityErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="labelI18n()" [value]="label()" (valueChange)="onFieldChange('label', $event)"
                    [maxLength]="labelLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="labelErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class WorkEntryForm {
  // inputs
  public readonly i18n = input.required<TrainerBillingI18n>();
  public readonly formData = model.required<WorkEntryModel>();
  /** the caller's agreements the entry may be booked on (active, valid on the date) */
  public readonly agreements = input<TrainerAgreementModel[]>([]);
  /** display names of the books by `accountingTenantId` (for the agreement choice); a missing one shows the id */
  public readonly booksLabels = input<Record<string, string>>({});
  public readonly readOnly = input(true);
  public readonly showForm = input(true);   // toggled by the parent to reset the Vest state on cancel

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  /** the agreement of the entry; undefined when it is not among `agreements` */
  protected readonly agreement = computed(() => this.agreements().find(a => a.okey === this.formData().agreementKey));
  /** the services of the agreement; undefined (no service check) when the agreement is not known here */
  private readonly allServices = computed(() => this.agreement()?.services);

  // the suite needs the services of the entry's agreement: a closure adds them
  private readonly suiteWithContext = (m: WorkEntryModel) => workEntryValidations(m, this.allServices());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly entryForm = form(this.formData, (path) => validateVestTree(path, this.suiteWithContext as any));
  private readonly validationResult = vestErrors(this.entryForm);
  protected readonly agreementKeyErrors = computed(() => this.validationResult().getErrors('agreementKey'));
  protected readonly dateErrors = computed(() => this.validationResult().getErrors('date'));
  protected readonly serviceKeyErrors = computed(() => this.validationResult().getErrors('serviceKey'));
  protected readonly quantityErrors = computed(() => this.validationResult().getErrors('quantity'));
  protected readonly labelErrors = computed(() => this.validationResult().getErrors('label'));

  /** kept in step with the cap the Vest suite enforces */
  protected readonly labelLength = WORK_ENTRY_LABEL_LENGTH;

  // fields (raw Firestore documents: coalesce)
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly agreementKey = computed(() => this.formData().agreementKey ?? '');
  protected readonly date = computed(() => this.formData().date ?? '');
  protected readonly serviceKey = computed(() => this.formData().serviceKey ?? '');
  protected readonly quantity = computed(() => this.formData().quantity ?? 0);
  protected readonly label = computed(() => this.formData().label ?? '');

  /** a stored entry keeps its agreement (the rules deny moving it); a new one may choose among several */
  protected readonly canChooseAgreement = computed(() => !this.formData().okey && this.agreements().length > 1);
  protected readonly agreementKeys = computed(() => this.agreements().map(a => a.okey));
  protected readonly agreementLabels = computed(() => this.agreements().map(a => this.booksLabels()[a.accountingTenantId] || a.accountingTenantId));

  /** live services, plus the entry's own service when it was archived meanwhile (so the value stays visible) */
  private readonly offeredServices = computed(() =>
    (this.allServices() ?? []).filter(s => !s.isArchived || s.key === this.serviceKey()));
  protected readonly serviceKeys = computed(() => this.offeredServices().map(s => s.key));
  protected readonly serviceLabels = computed(() => this.offeredServices().map(s => s.name));
  protected readonly unit = computed(() => (this.allServices() ?? []).find(s => s.key === this.serviceKey())?.unit ?? 'hour');
  protected readonly maxQuantity = computed(() => this.unit() === 'day' ? WORK_ENTRY_MAX_DAYS : WORK_ENTRY_MAX_HOURS);

  protected readonly agreementI18n = computed(() => ({ name: 'agreementKey', label: this.i18n().entry_agreement_label() } as StringSelectI18n));
  protected readonly dateI18n = computed(() => ({
    name: 'date', label: this.i18n().entry_date_label(), placeholder: '', helper: this.i18n().entry_date_helper(),
  } as DateInputI18n));
  protected readonly serviceI18n = computed(() => ({
    name: 'serviceKey', label: this.i18n().entry_service_label(), helper: this.i18n().entry_service_helper(),
  } as StringSelectI18n));
  protected readonly quantityI18n = computed(() => this.unit() === 'day'
    ? { name: 'quantity', label: this.i18n().entry_quantity_days_label(), placeholder: '', helper: this.i18n().entry_quantity_days_helper() } as NumberInputI18n
    : { name: 'quantity', label: this.i18n().entry_quantity_hours_label(), placeholder: '', helper: this.i18n().entry_quantity_hours_helper() } as NumberInputI18n);
  protected readonly labelI18n = computed(() => ({
    name: 'label', label: this.i18n().entry_label_label(), placeholder: this.i18n().entry_label_placeholder(), helper: this.i18n().entry_label_helper(),
  } as TextInputI18n));

  constructor() {
    effect(() => this.valid.emit(this.entryForm().valid()));
  }

  protected onFieldChange(fieldName: 'date' | 'serviceKey' | 'quantity' | 'label', fieldValue: string | number): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }

  /** Another agreement: its tenants, books and person; a service it does not offer is cleared. */
  protected onAgreementChange(agreementKey: string): void {
    const agreement = this.agreements().find(a => a.okey === agreementKey);
    if (!agreement || agreementKey === this.agreementKey()) return;
    this.dirty.emit(true);
    const offered = (agreement.services ?? []).some(s => s.key === this.serviceKey() && !s.isArchived);
    this.formData.update(vm => ({
      ...vm,
      agreementKey,
      tenants: [...(agreement.tenants ?? [])],
      accountingTenantId: agreement.accountingTenantId ?? '',
      personKey: agreement.personKey ?? '',
      serviceKey: offered ? vm.serviceKey : '',
    }));
  }
}
