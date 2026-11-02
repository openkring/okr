import { Component, computed, effect, inject, input, model, output, untracked } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular';

import { AccountingConfigModel, AccountModel, AvatarInfo, CostCenterModel, CourseEligible, CourseFinanceModel, MoneyModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { AmountInput, AmountInputI18n, Checkbox, CheckboxI18n, ErrorNote, StringSelect, StringSelectI18n } from '@okr/shared-ui';
import { MODEL_SELECTOR, validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean, fill, getAvatarName } from '@okr/shared-util-core';

import { AccountSelect, AccountSelectI18n } from '@okr/finance-account-ui';
import { CostCenterSelect, CostCenterSelectI18n } from '@okr/finance-cost-center-ui';
import { CourseI18n, courseFinanceValidations } from '@okr/calendar-course-util';

/** The currency of a course without readable books: the platform default. */
const FALLBACK_CURRENCY = 'CHF';

/**
 * The protected finance document of a course (spec 1.132 §5.2): the books, the expense account, the rate per session
 * and who is entitled, each with an optional own rate.
 *
 * The caller decides whether this form is shown at all (only people who may read the document get it), and passes
 * the accounts and cost centres of the CHOSEN books — the form never derives the books from the app tenant.
 * Amounts are typed in francs and held as integer minor units (`AmountInput`), in the functional currency of the
 * chosen books. Changing the books clears the account and cost centre (they belong to the old books) and restamps
 * the currency on every rate.
 */
@Component({
  selector: 'okr-course-finance-form',
  standalone: true,
  imports: [
    StringSelect, AmountInput, Checkbox, ErrorNote, AccountSelect, CostCenterSelect, SvgIconPipe,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonItem, IonLabel, IonNote, IonButton, IonIcon
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ i18n().finance_title() }}</ion-card-title>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <ion-note class="intro">{{ i18n().finance_intro() }}</ion-note>
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  @if (bookKeys().length > 0) {
                    <okr-string-select [i18n]="booksI18n()" [stringList]="bookKeys()"
                      [selectedString]="accountingTenantId()" (selectedStringChange)="onBooksChange($event)" [readOnly]="isReadOnly()" />
                  } @else {
                    <ion-item lines="none"><ion-note>{{ i18n().finance_books_none() }}</ion-note></ion-item>
                  }
                  <okr-error-note [errors]="booksErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-amount-input [i18n]="defaultRateI18n()" [value]="defaultRateMinor()" (valueChange)="onDefaultRateChange($event)" [readOnly]="isReadOnly()" />
                  <ion-note class="helper">{{ i18n().finance_defaultRate_helper() }}</ion-note>
                  <okr-error-note [errors]="defaultRateErrors()" />
                </ion-col>
              </ion-row>
              @if (accountingTenantId()) {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-account-select [i18n]="accountI18n()" [accounts]="accounts()" [allowEmpty]="true"
                      [selectedKey]="accountKey()" (selectedKeyChange)="onFieldChange('accountKey', $event)" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="accountKeyErrors()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-cost-center-select [i18n]="costCenterI18n()" [costCenters]="costCenters()" [allowEmpty]="true" [emptyIsFallback]="true"
                      [selectedKey]="costCenterKey()" (selectedKeyChange)="onFieldChange('costCenterKey', $event)" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="costCenterKeyErrors()" />
                  </ion-col>
                </ion-row>
              }
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ i18n().finance_eligible_title() }}</ion-card-title>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-item lines="none">
              <ion-label class="ion-text-wrap">{{ i18n().finance_eligible_description() }}</ion-label>
              @if (!isReadOnly()) {
                <ion-button slot="end" fill="clear" color="secondary" size="small" (click)="addEligible()">
                  <ion-icon slot="start" src="{{ 'add' | svgIcon }}" />
                  {{ i18n().form_person_add() }}
                </ion-button>
              }
            </ion-item>
            <ion-grid>
              @for (entry of eligible(); track $index) {
                <ion-row class="ion-align-items-center">
                  <ion-col size="12" size-md="4">
                    <ion-item lines="none">
                      <ion-label>{{ personName(entry.person) }}</ion-label>
                      @if (!isReadOnly()) {
                        <ion-icon slot="end" src="{{ 'cancel' | svgIcon }}" (click)="removeEligible($index)" />
                      }
                    </ion-item>
                  </ion-col>
                  <ion-col size="12" size-md="4">
                    <okr-checkbox [i18n]="ownRateI18n()" [checked]="!!entry.rate" (checkedChange)="onOwnRateToggle($index, $event)" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="4">
                    @if (entry.rate; as rate) {
                      <okr-amount-input [i18n]="ownRateAmountI18n()" [value]="rate.amount" (valueChange)="onOwnRateChange($index, $event)" [readOnly]="isReadOnly()" />
                      <okr-error-note [errors]="rateErrors($index)" />
                    }
                  </ion-col>
                </ion-row>
              }
            </ion-grid>
            @if (eligible().length > 0) {
              <ion-item lines="none"><ion-note>{{ i18n().finance_ownRate_helper() }}</ion-note></ion-item>
            }
            <okr-error-note [errors]="eligibleErrors()" />
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class CourseFinanceForm {
  private readonly modelSelector = inject(MODEL_SELECTOR);

  // inputs
  public readonly formData = model.required<CourseFinanceModel>();
  public readonly i18n = input.required<CourseI18n>();
  /** the books the tenant may use (accounting-configs whose `tenants` contain the tenant) */
  public readonly books = input<AccountingConfigModel[]>([]);
  /** the expense accounts of the CHOSEN books */
  public readonly accounts = input<AccountModel[]>([]);
  /** every cost centre of the CHOSEN books */
  public readonly costCenters = input<CostCenterModel[]>([]);
  /**
   * `appConfig().defaultAccountingTenantId`: offered as the books while none is chosen yet — but only when it is one
   * of `books`. Never the app tenant; empty = no default.
   */
  public readonly defaultBooks = input('');
  public readonly readOnly = input(true);
  public readonly showForm = input(true);   // toggled by the parent to reset the Vest state on cancel

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  protected readonly bookKeys = computed(() => this.books().map(b => b.accountingTenantId));
  // the suite also judges the books against the list the tenant may use: a closure adds it
  private readonly suiteWithContext = (model: CourseFinanceModel) => courseFinanceValidations(model, this.bookKeys());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly financeForm = form(this.formData, (path) => validateVestTree(path, this.suiteWithContext as any));
  private readonly validationResult = vestErrors(this.financeForm);
  protected readonly booksErrors = computed(() => this.validationResult().getErrors('accountingTenantId'));
  protected readonly defaultRateErrors = computed(() => this.validationResult().getErrors('defaultRate'));
  protected readonly accountKeyErrors = computed(() => this.validationResult().getErrors('accountKey'));
  protected readonly costCenterKeyErrors = computed(() => this.validationResult().getErrors('costCenterKey'));
  protected readonly eligibleErrors = computed(() => this.validationResult().getErrors('eligible'));
  protected rateErrors(index: number): string[] {
    return this.validationResult().getErrors(`eligible[${index}].rate`);
  }

  // fields (raw Firestore documents: coalesce)
  protected readonly accountingTenantId = computed(() => this.formData().accountingTenantId ?? '');
  protected readonly accountKey = computed(() => this.formData().accountKey ?? '');
  protected readonly costCenterKey = computed(() => this.formData().costCenterKey ?? '');
  protected readonly defaultRateMinor = computed(() => this.formData().defaultRate?.amount ?? 0);
  protected readonly eligible = computed(() => this.formData().eligible ?? []);

  /** functional currency of the chosen books; a config from before the field existed falls back to CHF */
  protected readonly currency = computed(() =>
    this.books().find(b => b.accountingTenantId === this.accountingTenantId())?.functionalCurrency || FALLBACK_CURRENCY);

  protected readonly booksI18n = computed(() => ({
    name: 'accountingTenantId', label: this.i18n().finance_books_label(), helper: this.i18n().finance_books_helper(),
  } as StringSelectI18n));
  protected readonly accountI18n = computed(() => ({
    name: 'accountKey', label: this.i18n().finance_account_label(), helper: this.i18n().finance_account_helper(),
  } as AccountSelectI18n));
  protected readonly costCenterI18n = computed(() => ({
    name: 'costCenterKey', label: this.i18n().finance_costCenter_label(), helper: this.i18n().finance_costCenter_helper(),
  } as CostCenterSelectI18n));
  protected readonly defaultRateI18n = computed(() => ({
    name: 'defaultRate', label: fill(this.i18n().finance_defaultRate_label(), { currency: this.currency() }),
  } as AmountInputI18n));
  protected readonly ownRateI18n = computed(() => ({
    name: 'ownRate', label: this.i18n().finance_ownRate_label(), helper: '',
  } as CheckboxI18n));
  protected readonly ownRateAmountI18n = computed(() => ({
    name: 'ownRateAmount', label: fill(this.i18n().finance_ownRate_amount(), { currency: this.currency() }),
  } as AmountInputI18n));

  private defaultApplied = false;

  constructor() {
    effect(() => this.valid.emit(this.financeForm().valid()));
    // Preselect the default books once, and only while none are chosen. It is a suggestion, not an edit: the form
    // does not turn dirty, so nothing is saved unless the user changes something.
    effect(() => {
      const defaultBooks = this.defaultBooks();
      if (this.defaultApplied || this.isReadOnly() || !defaultBooks || this.accountingTenantId()) return;
      if (!this.bookKeys().includes(defaultBooks)) return;
      this.defaultApplied = true;
      untracked(() => this.applyBooks(defaultBooks));
    });
  }

  protected personName(person: AvatarInfo): string {
    return getAvatarName(person);
  }

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: 'accountKey' | 'costCenterKey', fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }

  /** The user chose other books (or the same again). */
  protected onBooksChange(accountingTenantId: string): void {
    if (accountingTenantId === this.accountingTenantId()) return;
    this.dirty.emit(true);
    this.applyBooks(accountingTenantId);
  }

  /**
   * New books: the account and cost centre belonged to the old ones, and the rates must be in the new
   * functional currency (the callable refuses any other).
   */
  private applyBooks(accountingTenantId: string): void {
    const currency = this.books().find(b => b.accountingTenantId === accountingTenantId)?.functionalCurrency || FALLBACK_CURRENCY;
    this.formData.update(vm => ({
      ...vm,
      accountingTenantId, accountKey: '', costCenterKey: '',
      defaultRate: this.money(vm.defaultRate, vm.defaultRate?.amount ?? 0, currency),
      eligible: (vm.eligible ?? []).map(e => e.rate ? { ...e, rate: this.money(e.rate, e.rate.amount, currency) } : e),
    }));
  }

  protected onDefaultRateChange(minor: number): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, defaultRate: this.money(vm.defaultRate, minor, this.currency()) }));
  }

  protected async addEligible(): Promise<void> {
    const current = this.eligible();
    // free-text names cannot be paid: only persons of the person list, and each only once
    const avatar = await this.modelSelector.selectPersonAvatar(undefined, undefined, false, false, { excludeKeys: current.map(e => e.person.key) });
    if (!avatar) return;
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, eligible: [...(vm.eligible ?? []), { person: avatar }] }));
  }

  protected removeEligible(index: number): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, eligible: (vm.eligible ?? []).filter((_, i) => i !== index) }));
  }

  /** On: start from the default rate. Off: no `rate` at all, so the default applies (never a stored 0). */
  protected onOwnRateToggle(index: number, own: boolean): void {
    this.updateEligible(index, entry => {
      if (!own) {
        const { rate: _dropped, ...rest } = entry;   // eslint-disable-line @typescript-eslint/no-unused-vars
        return rest;
      }
      return { ...entry, rate: this.money(this.formData().defaultRate, this.defaultRateMinor(), this.currency()) };
    });
  }

  protected onOwnRateChange(index: number, minor: number): void {
    this.updateEligible(index, entry => ({ ...entry, rate: this.money(entry.rate, minor, this.currency()) }));
  }

  private updateEligible(index: number, change: (entry: CourseEligible) => CourseEligible): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, eligible: (vm.eligible ?? []).map((e, i) => i === index ? change(e) : e) }));
  }

  /** A MoneyModel in the given currency that keeps the periodicity of the one it replaces (`once` = per session). */
  private money(previous: MoneyModel | undefined, minor: number, currency: string): MoneyModel {
    return new MoneyModel(minor, currency, previous?.periodicity);
  }
}
