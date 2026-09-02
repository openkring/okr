import { Component, computed, effect, input, linkedSignal, model, output, signal, Signal, untracked } from '@angular/core';
import {
  IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonNote, IonRow, IonSelect, IonSelectOption,
} from '@ionic/angular/standalone';

import { CategoryListModel } from '@okr/shared-models';
import { CategorySelect, ErrorNote, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';

import {
  ALLOWED_CURRENCIES, centsToCHF, chfToCents, ExpenseEditFormValue, expenseEditValidations,
} from '@okr/finance-expense-util';

export type { ExpenseEditFormValue };

/** The labels this form needs. A subset of ExpenseI18n, adapted at the shared/ui boundary. */
export interface ExpenseEditFormI18n {
  abstract_label: Signal<string>;
  amount_label: Signal<string>;
  currency_label: Signal<string>;
  transfer_label: Signal<string>;
  transfer_me: Signal<string>;
  transfer_issuer: Signal<string>;
  category_label: Signal<string>;
  costcenter_label: Signal<string>;
  note_label: Signal<string>;
  field_status: Signal<string>;
  edit_locked_hint: Signal<string>;
}

/**
 * The treasurer's edit form for an expense. Unlike `okr-expense-form` (the create form) it owns
 * no receipt picker and no IBAN flow — a submitted expense's receipts and bank details are fixed.
 * Once the expense is booked, `lockedFields` renders the accounting controls read-only; the
 * `updateExpense` CF refuses a changed locked field, so this is a UI mirror of a server rule.
 */
@Component({
  selector: 'okr-expense-edit-form',
  standalone: true,
  imports: [
    TextInput, NotesInput, ErrorNote, CategorySelect,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol, IonItem, IonLabel, IonNote,
    IonSelect, IonSelectOption,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            @if (isLockedForm()) {
              <ion-item lines="none">
                <ion-note color="warning">{{ i18n().edit_locked_hint() }}</ion-note>
              </ion-item>
            }
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <okr-text-input [i18n]="abstractI18n()" [value]="abstract()"
                    (valueChange)="onFieldChange('abstract', $event)"
                    [autofocus]="true" [maxLength]="200" [readOnly]="false" />
                  <okr-error-note [errors]="abstractErrors()" />
                </ion-col>
              </ion-row>

              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="amountI18n()" [value]="amountInput()"
                    (valueChange)="onAmountChange($event)"
                    [maxLength]="10" [readOnly]="isLocked('amountTotal')" />
                  <okr-error-note [errors]="amountErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none">
                    <ion-label>{{ i18n().currency_label() }}</ion-label>
                    <ion-select [value]="currency()" [disabled]="isLocked('currency')"
                      (ionChange)="onFieldChange('currency', $event.detail.value)">
                      @for (c of currencies; track c) {
                        <ion-select-option [value]="c">{{ c }}</ion-select-option>
                      }
                    </ion-select>
                  </ion-item>
                  <okr-error-note [errors]="currencyErrors()" />
                </ion-col>
              </ion-row>

              <ion-row>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none">
                    <ion-label>{{ i18n().transfer_label() }}</ion-label>
                    <ion-select [value]="transferTo()" [disabled]="isLocked('transferTo')"
                      (ionChange)="onFieldChange('transferTo', $event.detail.value)">
                      <ion-select-option value="me">{{ i18n().transfer_me() }}</ion-select-option>
                      <ion-select-option value="issuer">{{ i18n().transfer_issuer() }}</ion-select-option>
                    </ion-select>
                  </ion-item>
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-cat-select [selectedItemName]="status()"
                    (selectedItemNameChange)="onFieldChange('status', $event)"
                    [category]="statuses()" [readOnly]="isLocked('status')"
                    [fieldStyle]="true" [label]="i18n().field_status()" [showIcons]="false" />
                </ion-col>
              </ion-row>

              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="categoryI18n()" [value]="category()"
                    (valueChange)="onFieldChange('category', $event)" [readOnly]="false" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="costCenterI18n()" [value]="costCenterId()"
                    (valueChange)="onFieldChange('costCenterId', $event)" [readOnly]="false" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <okr-notes-input [i18n]="noteI18n()" [value]="note()"
          (valueChange)="onFieldChange('note', $event)" [readOnly]="false" />
      </form>
    }
  `,
})
export class ExpenseEditForm {
  // inputs
  public formData = model.required<ExpenseEditFormValue>();
  public readonly i18n = input.required<ExpenseEditFormI18n>();
  /** from lockedExpenseFields() — these controls render read-only */
  public readonly lockedFields = input<string[]>([]);
  public readonly statuses = input.required<CategoryListModel>();
  /** toggled by the parent on cancel to recreate the form and clear the Vest state */
  public readonly showForm = input(true);

  // outputs
  public readonly valid = output<boolean>();
  public readonly dirty = output<boolean>();

  protected readonly currencies = ALLOWED_CURRENCIES;

  constructor() {
    effect(() => this.valid.emit(this.validationResult().isValid()));
    // Seed the amount field from the model ONCE per form instance (and again when the parent
    // toggles showForm to reset it). It must NEVER be re-derived from `amountTotal` while the
    // user types: cents -> string is not idempotent ('2' would snap to '2.00', and the next
    // keystroke would produce a DOM value NgModel refuses to write back), so the field would
    // silently drift from the stored amount. `untracked` keeps formData out of the dependency set.
    effect(() => {
      this.showForm();
      const cents = untracked(() => this.formData().amountTotal ?? 0);
      // `.toFixed(2)` is safe HERE and only here — this runs once per form instance, so
      // CHF 42.50 loads as '42.50' instead of '42.5' without ever reformatting mid-typing.
      this.amountInput.set(cents > 0 ? centsToCHF(cents).toFixed(2) : '');
    });
  }

  // validation and errors
  private readonly validationResult = computed(() => expenseEditValidations(this.formData()));
  protected readonly abstractErrors = computed(() => this.validationResult().getErrors('abstract'));
  protected readonly amountErrors   = computed(() => this.validationResult().getErrors('amountTotal'));
  protected readonly currencyErrors = computed(() => this.validationResult().getErrors('currency'));

  // fields
  protected abstract     = linkedSignal(() => this.formData().abstract ?? '');
  protected currency     = linkedSignal(() => this.formData().currency ?? 'CHF');
  protected transferTo   = linkedSignal(() => this.formData().transferTo ?? 'me');
  protected category     = linkedSignal(() => this.formData().category ?? '');
  protected costCenterId = linkedSignal(() => this.formData().costCenterId ?? '');
  protected note         = linkedSignal(() => this.formData().note ?? '');
  protected status       = linkedSignal(() => this.formData().status ?? 'draft');

  /**
   * The raw text the treasurer typed. The single source of truth for what the amount field shows;
   * cents are derived FROM it in onAmountChange, never the other way round while editing.
   */
  protected readonly amountInput = signal('');

  /** A booked expense locks the accounting fields — the status stays editable. */
  protected isLocked(field: string): boolean {
    return this.lockedFields().includes(field);
  }
  protected readonly isLockedForm = computed(() => this.lockedFields().length > 0);

  protected readonly abstractI18n = computed(() => ({
    name: 'abstract', label: this.i18n().abstract_label(), placeholder: '', helper: '',
  } as TextInputI18n));

  protected readonly amountI18n = computed(() => ({
    name: 'amountTotal', label: this.i18n().amount_label(), placeholder: '', helper: '',
  } as TextInputI18n));

  protected readonly categoryI18n = computed(() => ({
    name: 'category', label: this.i18n().category_label(), placeholder: '', helper: '',
  } as TextInputI18n));

  protected readonly costCenterI18n = computed(() => ({
    name: 'costCenterId', label: this.i18n().costcenter_label(), placeholder: '', helper: '',
  } as TextInputI18n));

  protected readonly noteI18n = computed(() => ({
    name: 'note', label: this.i18n().note_label(), placeholder: '',
  } as NotesInputI18n));

  /******************************* actions *************************************** */
  protected onAmountChange(value: string): void {
    this.amountInput.set(value);   // keep the typed text verbatim — see the seeding effect
    const parsed = parseFloat(value.replace(',', '.'));
    this.onFieldChange('amountTotal', isNaN(parsed) ? 0 : chfToCents(parsed));
  }

  protected onFieldChange(fieldName: string, fieldValue: string | number): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }
}
