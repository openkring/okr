import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular';

import { AccountSelect, AccountSelectI18n } from '@okr/finance-account-ui';
import { CostCenterSelect, CostCenterSelectI18n } from '@okr/finance-cost-center-ui';
import {
  isStoredServiceRow, renameServiceRow, storedRateCount, TRAINER_MAX_SERVICES, TRAINER_SERVICE_NAME_LENGTH, trainerAgreementValidations, TrainerBillingI18n
} from '@okr/finance-trainer-billing-util';
import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import {
  AccountModel, CostCenterModel, MoneyModel, RoleName, TrainerAgreementModel, TrainerRate, TrainerService, TrainerServiceUnit, UserModel, VatCodeModel
} from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { AmountInput, AmountInputI18n, Checkbox, CheckboxI18n, DateInput, DateInputI18n, ErrorNote, TextareaInput, TextareaInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { MODEL_SELECTOR, validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean, convertDateFormatToString, DateFormat, fill, getAvatarName, getTodayStr, hasRole } from '@okr/shared-util-core';

/** The currency of every rate: trainer invoices are in CHF (QR bill). */
const RATE_CURRENCY = 'CHF';

/**
 * The agreement between a set of books and a trainer (spec 1.167 §7.1): person, validity, the self-employment tick (D9)
 * and up to ten services, each with unit, rate history, account, cost centre and VAT code.
 *
 * Rates are typed in CHF and held in Rappen (`AmountInput`). A stored rate is never changed: its row is read-only, a
 * change is a new row with its own «valid from». A stored service keeps its key and unit (work entries point at the key
 * and were counted in the unit); it can only be archived. The key of a new service follows its name (`serviceKeyOf`).
 * The caller passes the accounts, cost centres and VAT codes of the agreement's books — never of the app tenant.
 */
@Component({
  selector: 'okr-trainer-agreement-form',
  standalone: true,
  imports: [
    TextInput, TextareaInput, DateInput, Checkbox, StringSelect, AmountInput, ErrorNote, AccountSelect, CostCenterSelect,
    SvgIconPipe, DecimalPipe, IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonItem, IonLabel, IonNote, IonButton, IonIcon
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .service { border-top: 1px solid var(--ion-color-light-shade); }
    .rate { padding: 0.25rem 1rem; }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-label class="ion-text-wrap">
                      <ion-note>{{ i18n().agreement_person_label() }}</ion-note>
                      <h2>{{ personName() }}</h2>
                    </ion-label>
                    @if (canChoosePerson()) {
                      <ion-button slot="end" fill="clear" color="secondary" (click)="choosePerson()">
                        <ion-icon slot="start" src="{{ 'person' | svgIcon }}" />
                        {{ i18n().agreement_person_choose() }}
                      </ion-button>
                    }
                  </ion-item>
                  <okr-error-note [errors]="personErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="validFromI18n()" [storeDate]="validFrom()" (storeDateChange)="onFieldChange('validFrom', $event)"
                    [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="validFromErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="validToI18n()" [storeDate]="validTo()" (storeDateChange)="onFieldChange('validTo', $event)"
                    [readOnly]="isReadOnly()" [showHelper]="true" />
                  <okr-error-note [errors]="validToErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-checkbox [i18n]="selfEmployedI18n()" [checked]="selfEmployedConfirmed()" (checkedChange)="onFieldChange('selfEmployedConfirmed', $event)"
                    [showHelper]="true" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-textarea-input [i18n]="payablesNoteI18n()" [value]="payablesNote()" (valueChange)="onFieldChange('payablesNote', $event)"
                    [maxLength]="descriptionLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="payablesNoteErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ i18n().agreement_services_title() }}</ion-card-title>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-item lines="none">
              <ion-label class="ion-text-wrap"><ion-note>{{ i18n().agreement_services_intro() }}</ion-note></ion-label>
            </ion-item>
            <okr-error-note [errors]="servicesErrors()" />
            <ion-grid>
              @for (service of services(); track $index; let i = $index) {
                <ion-row class="service">
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="serviceNameI18n()" [value]="service.name" (valueChange)="onServiceNameChange(i, $event)"
                      [maxLength]="serviceNameLength" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="serviceErrors(i, 'name', 'key')" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-string-select [i18n]="unitI18n()" [stringList]="units" [labels]="unitLabels()"
                      [selectedString]="service.unit" (selectedStringChange)="onServiceChange(i, 'unit', $event)" [readOnly]="isReadOnly() || isStored(i)" />
                    <okr-error-note [errors]="serviceErrors(i, 'unit')" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-account-select [i18n]="accountI18n()" [accounts]="accounts()" [allowEmpty]="true"
                      [selectedKey]="service.accountKey" (selectedKeyChange)="onServiceChange(i, 'accountKey', $event)" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="serviceErrors(i, 'accountKey')" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-cost-center-select [i18n]="costCenterI18n()" [costCenters]="costCenters()" [allowEmpty]="true" [emptyIsFallback]="true"
                      [selectedKey]="service.costCenterKey" (selectedKeyChange)="onServiceChange(i, 'costCenterKey', $event)" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-string-select [i18n]="vatCodeI18n()" [stringList]="vatCodeKeys()" [labels]="vatCodeLabels()"
                      [selectedString]="service.vatCodeKey" (selectedStringChange)="onServiceChange(i, 'vatCodeKey', $event)" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    @if (isStored(i)) {
                      <okr-checkbox [i18n]="archivedI18n()" [checked]="!!service.isArchived" (checkedChange)="onServiceChange(i, 'isArchived', $event)"
                        [showHelper]="true" [readOnly]="isReadOnly()" />
                    } @else if (!isReadOnly()) {
                      <ion-button fill="clear" size="small" color="danger" (click)="removeService(i)">
                        <ion-icon slot="start" src="{{ 'trash' | svgIcon }}" />{{ i18n().agreement_service_remove() }}
                      </ion-button>
                    }
                  </ion-col>

                  <ion-col size="12">
                    <ion-item lines="none">
                      <ion-label class="ion-text-wrap">
                        <h3>{{ i18n().service_rates_title() }}</h3>
                        <ion-note>{{ i18n().service_rates_helper() }}</ion-note>
                      </ion-label>
                    </ion-item>
                    @for (rate of service.rates; track $index; let r = $index) {
                      @if (isStoredRate(i, r)) {
                        <div class="rate">{{ rateFrom(rate) }}: CHF {{ rate.amount.amount / 100 | number:'1.2-2' }}</div>
                      } @else {
                        <ion-row class="ion-align-items-center">
                          <ion-col size="12" size-md="5">
                            <okr-date-input [i18n]="rateValidFromI18n()" [storeDate]="rate.validFrom" (storeDateChange)="onRateChange(i, r, 'validFrom', $event)"
                              [readOnly]="isReadOnly()" />
                          </ion-col>
                          <ion-col size="9" size-md="5">
                            <okr-amount-input [i18n]="rateAmountI18n()" [value]="rate.amount.amount" (valueChange)="onRateChange(i, r, 'amount', $event)"
                              [readOnly]="isReadOnly()" />
                          </ion-col>
                          <ion-col size="3" size-md="2">
                            @if (!isReadOnly()) {
                              <ion-button fill="clear" size="small" color="danger" (click)="removeRate(i, r)" [title]="i18n().rate_remove()">
                                <ion-icon slot="icon-only" src="{{ 'trash' | svgIcon }}" />
                              </ion-button>
                            }
                          </ion-col>
                        </ion-row>
                      }
                    }
                    <okr-error-note [errors]="serviceErrors(i, 'rates')" />
                    @if (!isReadOnly()) {
                      <ion-button fill="clear" size="small" (click)="addRate(i)">
                        <ion-icon slot="start" src="{{ 'add' | svgIcon }}" />{{ i18n().rate_add() }}
                      </ion-button>
                    }
                  </ion-col>
                </ion-row>
              }
            </ion-grid>
            @if (!isReadOnly()) {
              @if (services().length < maxServices) {
                <ion-button fill="clear" size="small" (click)="addService()">
                  <ion-icon slot="start" src="{{ 'add' | svgIcon }}" />{{ i18n().agreement_service_add() }}
                </ion-button>
              } @else {
                <ion-item lines="none"><ion-note>{{ i18n().agreement_services_max() }}</ion-note></ion-item>
              }
            }
          </ion-card-content>
        </ion-card>

        @if (hasRole('treasurer')) {
          <okr-textarea-input variant="card" [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)"
            [maxLength]="descriptionLength" [errors]="notesErrors()" [readOnly]="isReadOnly()" />
        }
      </form>
    }
  `,
})
export class TrainerAgreementForm {
  private readonly modelSelector = inject(MODEL_SELECTOR);

  // inputs
  public readonly i18n = input.required<TrainerBillingI18n>();
  public readonly formData = model.required<TrainerAgreementModel>();
  /** the services as stored (empty for a new agreement): their keys, units and rates are fixed */
  public readonly storedServices = input<TrainerService[]>([]);
  /** the expense accounts of the agreement's books */
  public readonly accounts = input<AccountModel[]>([]);
  /** the cost centres of the agreement's books */
  public readonly costCenters = input<CostCenterModel[]>([]);
  /** the VAT codes of the agreement's books */
  public readonly vatCodes = input<VatCodeModel[]>([]);
  /** `defaultCompensationAccountKey` of the books; '' = every service needs its own account */
  public readonly defaultAccountKey = input('');
  /** the other agreements of the books, for the overlap rule */
  public readonly otherAgreements = input<TrainerAgreementModel[]>([]);
  public readonly currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);
  public readonly showForm = input(true);   // toggled by the parent to reset the Vest state on cancel

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // the suite needs the books' default account and the other agreements: a closure adds them
  private readonly suiteWithContext = (m: TrainerAgreementModel) =>
    trainerAgreementValidations(m, { defaultAccountKey: this.defaultAccountKey(), otherAgreements: this.otherAgreements() });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly agreementForm = form(this.formData, (path) => validateVestTree(path, this.suiteWithContext as any));
  private readonly validationResult = vestErrors(this.agreementForm);
  protected readonly personErrors = computed(() => this.validationResult().getErrors('personKey'));
  protected readonly validFromErrors = computed(() => this.validationResult().getErrors('validFrom'));
  protected readonly validToErrors = computed(() => this.validationResult().getErrors('validTo'));
  protected readonly servicesErrors = computed(() => this.validationResult().getErrors('services'));
  protected readonly payablesNoteErrors = computed(() => this.validationResult().getErrors('payablesNote'));
  protected readonly notesErrors = computed(() => this.validationResult().getErrors('notes'));
  protected serviceErrors(index: number, ...fields: string[]): string[] {
    return fields.flatMap(field => this.validationResult().getErrors(`services[${index}].${field}`));
  }

  /** kept in step with the caps the Vest suite enforces */
  protected readonly serviceNameLength = TRAINER_SERVICE_NAME_LENGTH;
  protected readonly descriptionLength = DESCRIPTION_LENGTH;
  protected readonly maxServices = TRAINER_MAX_SERVICES;
  protected readonly units: TrainerServiceUnit[] = ['hour', 'day'];

  // fields (raw Firestore documents: coalesce)
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly personName = computed(() => getAvatarName(this.formData().person) || '—');
  /** the person is chosen once; a stored agreement keeps its trainer */
  protected readonly canChoosePerson = computed(() => !this.isReadOnly() && !this.formData().okey);
  protected readonly validFrom = computed(() => this.formData().validFrom ?? '');
  protected readonly validTo = computed(() => this.formData().validTo ?? '');
  protected readonly selfEmployedConfirmed = computed(() => this.formData().selfEmployedConfirmed ?? false);
  protected readonly payablesNote = computed(() => this.formData().payablesNote ?? '');
  protected readonly notes = computed(() => this.formData().notes ?? '');
  protected readonly services = computed(() => this.formData().services ?? []);
  private readonly storedCount = computed(() => (this.storedServices() ?? []).length);

  protected readonly vatCodeKeys = computed(() => ['', ...this.vatCodes().map(v => v.okey)]);
  protected readonly vatCodeLabels = computed(() => [this.i18n().service_vatCode_none(), ...this.vatCodes().map(v => `${v.code} — ${v.name}`)]);
  protected readonly unitLabels = computed(() => [this.i18n().service_unit_hour(), this.i18n().service_unit_day()]);

  protected readonly validFromI18n = computed(() => ({ name: 'validFrom', label: this.i18n().agreement_validFrom_label(), placeholder: '' } as DateInputI18n));
  protected readonly validToI18n = computed(() => ({
    name: 'validTo', label: this.i18n().agreement_validTo_label(), placeholder: '', helper: this.i18n().agreement_validTo_helper(),
  } as DateInputI18n));
  protected readonly selfEmployedI18n = computed(() => ({
    name: 'selfEmployedConfirmed', label: this.i18n().agreement_selfEmployed_label(), helper: this.i18n().agreement_selfEmployed_helper(),
  } as CheckboxI18n));
  protected readonly payablesNoteI18n = computed(() => ({
    name: 'payablesNote', label: this.i18n().agreement_payablesNote_label(), placeholder: this.i18n().agreement_payablesNote_placeholder(), helper: '',
  } as TextInputI18n));
  protected readonly notesI18n = computed(() => ({
    name: 'notes', label: this.i18n().agreement_notes_label(), placeholder: this.i18n().agreement_notes_placeholder(),
  } as TextareaInputI18n));
  protected readonly serviceNameI18n = computed(() => ({
    name: 'serviceName', label: this.i18n().service_name_label(), placeholder: this.i18n().service_name_placeholder(), helper: this.i18n().service_name_helper(),
  } as TextInputI18n));
  protected readonly unitI18n = computed(() => ({ name: 'unit', label: this.i18n().service_unit_label() } as StringSelectI18n));
  protected readonly accountI18n = computed(() => ({
    name: 'accountKey', label: this.i18n().service_account_label(), helper: this.i18n().service_account_helper(),
  } as AccountSelectI18n));
  protected readonly costCenterI18n = computed(() => ({
    name: 'costCenterKey', label: this.i18n().service_costCenter_label(), helper: this.i18n().service_costCenter_helper(),
  } as CostCenterSelectI18n));
  protected readonly vatCodeI18n = computed(() => ({
    name: 'vatCodeKey', label: this.i18n().service_vatCode_label(), helper: this.i18n().service_vatCode_helper(),
  } as StringSelectI18n));
  protected readonly archivedI18n = computed(() => ({
    name: 'isArchived', label: this.i18n().service_archived_label(), helper: this.i18n().service_archived_helper(),
  } as CheckboxI18n));
  protected readonly rateValidFromI18n = computed(() => ({ name: 'rateValidFrom', label: this.i18n().rate_validFrom_label(), placeholder: '' } as DateInputI18n));
  protected readonly rateAmountI18n = computed(() => ({ name: 'rateAmount', label: this.i18n().rate_amount_label() } as AmountInputI18n));

  constructor() {
    effect(() => this.valid.emit(this.agreementForm().valid()));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  /**
   * A stored service row: the stored services are the first rows (never removed, new ones are appended). Decided by
   * position, never by key — a new service whose name passes through a stored key must stay new. Its key and unit are
   * fixed, it is archived instead of removed.
   */
  protected isStored(index: number): boolean {
    return isStoredServiceRow(index, this.storedCount());
  }

  /** The first rates of a stored row are its stored history (new rates are appended): read-only. */
  protected isStoredRate(index: number, rateIndex: number): boolean {
    return rateIndex < storedRateCount(index, this.storedServices() ?? []);
  }

  protected rateFrom(rate: TrainerRate): string {
    const date = convertDateFormatToString(rate.validFrom, DateFormat.StoreDate, DateFormat.ViewDate, false);
    return fill(this.i18n().rate_from(), { date });
  }

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: 'validFrom' | 'validTo' | 'selfEmployedConfirmed' | 'payablesNote' | 'notes', fieldValue: string | boolean): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }

  /** Only persons of the tenant's person list (no free text): the rules check that the person belongs to the tenant. */
  protected async choosePerson(): Promise<void> {
    const avatar = await this.modelSelector.selectPersonAvatar(undefined, undefined, false, false);
    if (!avatar) return;
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, person: avatar, personKey: avatar.key }));
  }

  /** The name of a new service also sets its key; a stored service keeps its key. */
  protected onServiceNameChange(index: number, name: string): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, services: renameServiceRow(vm.services ?? [], index, name, this.storedCount()) }));
  }

  protected onServiceChange(index: number, field: 'unit' | 'accountKey' | 'costCenterKey' | 'vatCodeKey' | 'isArchived', value: string | boolean): void {
    this.updateService(index, s => ({ ...s, [field]: value }));
  }

  protected addService(): void {
    if (this.services().length >= TRAINER_MAX_SERVICES) return;
    this.dirty.emit(true);
    const service: TrainerService = {
      key: '', name: '', unit: 'hour', rates: [this.newRate()], accountKey: '', costCenterKey: '', vatCodeKey: '', isArchived: false,
    };
    this.formData.update(vm => ({ ...vm, services: [...(vm.services ?? []), service] }));
  }

  protected removeService(index: number): void {
    if (this.isStored(index)) return;   // stored services are archived, never removed
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, services: (vm.services ?? []).filter((_, i) => i !== index) }));
  }

  protected addRate(index: number): void {
    this.updateService(index, s => ({ ...s, rates: [...(s.rates ?? []), this.newRate()] }));
  }

  protected removeRate(index: number, rateIndex: number): void {
    this.updateService(index, s => this.isStoredRate(index, rateIndex) ? s : { ...s, rates: (s.rates ?? []).filter((_, r) => r !== rateIndex) });
  }

  protected onRateChange(index: number, rateIndex: number, field: 'validFrom' | 'amount', value: string | number): void {
    this.updateService(index, s => {
      if (this.isStoredRate(index, rateIndex)) return s;
      const rates = (s.rates ?? []).map((rate, r) => {
        if (r !== rateIndex) return rate;
        return field === 'amount'
          ? { ...rate, amount: new MoneyModel(value as number, RATE_CURRENCY, rate.amount?.periodicity) }
          : { ...rate, validFrom: value as string };
      });
      return { ...s, rates };
    });
  }

  private updateService(index: number, change: (service: TrainerService) => TrainerService): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, services: (vm.services ?? []).map((s, i) => i === index ? change(s) : s) }));
  }

  private newRate(): TrainerRate {
    return { validFrom: getTodayStr(DateFormat.StoreDate), amount: new MoneyModel(0, RATE_CURRENCY) };
  }
}
