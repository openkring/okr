import { ChangeDetectionStrategy, Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular/standalone';

import { CategoryListModel, INVOICE_STATE_VALUES, MemberFeeModel, MemberFeePosition, UserModel } from '@okr/shared-models';
import { NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n , ErrorNote} from '@okr/shared-ui';
import { validateVestTree } from '@okr/shared-util-angular';
import { getAgeFromBirthYear } from '@okr/shared-util-core';

import { MembershipI18n, applyProRata, getFeeTotal, memberFeeValidations, positionAmountField } from '@okr/relationship-membership-util';

/** One rendered fee line: the position itself plus the i18n object and errors belonging to it. */
interface PositionRow {
  index: number;
  amount: number;
  i18n: NumberInputI18n;
  errors: string[];
  /** set only for a position of a pro-rata rule (spec 1.79): the months input is shown */
  yearlyAmount?: number;
  months: number;
  description: string;
}

@Component({
  selector: 'okr-member-fee-edit-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ErrorNote,
    NumberInput, StringSelect, NotesInput,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonItem, IonLabel, IonNote,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (showForm()) {
      <form novalidate>

        <ion-card>
          <ion-card-content class="ion-no-padding">
            <!-- read-only member info -->
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-label>Alter: {{ age() }}</ion-label>
                    <ion-label>MKat: {{ category() }}</ion-label>
                    <ion-label>Bexio ID: {{ bexioId() }}</ion-label>
                  </ion-item>
                </ion-col>
              </ion-row>

              <!-- fee positions: one line per position the fee schedule produced -->
              <ion-row>
                @for (row of positionRows(); track row.index) {
                  <ion-col size="12" size-md="6">
                    <okr-number-input [i18n]="row.i18n" [value]="row.amount"
                      (valueChange)="onPositionAmountChange(row.index, $event)"
                      [readOnly]="readOnly()" />
                    <okr-error-note [errors]="row.errors" />
                    @if (row.yearlyAmount !== undefined) {
                      <okr-number-input [i18n]="proRataMonthsI18n()" [value]="row.months"
                        (valueChange)="onPositionMonthsChange(row.index, $event)"
                        [min]="1" [max]="12" [showHelper]="true" [readOnly]="readOnly()" />
                      @if (row.description) {
                        <ion-item lines="none"><ion-note>{{ row.description }}</ion-note></ion-item>
                      }
                    }
                  </ion-col>
                }
              </ion-row>

              <!-- total -->
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-label class="ion-text-end">{{ total() }}</ion-label>
                  </ion-item>
                </ion-col>
              </ion-row>

              <!-- invoice state -->
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="invoiceStateI18n()"
                    [selectedString]="state()"
                    (selectedStringChange)="onFieldChange('state', $event)"
                    [readOnly]="readOnly()"
                    [stringList]="invoiceStateList" />
                  <okr-error-note [errors]="stateErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
        <okr-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="false" />
      </form>
    }
  `
})
export class MemberFeeEditForm {
  // i18n — all translations come from the i18n input
  protected notesI18n        = computed(() => ({ name: 'notes',        label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder() } as NotesInputI18n));
  protected proRataMonthsI18n = computed(() => ({ name: 'proRataMonths', label: this.i18n().memberFee_proRata_months_label(), helper: this.i18n().memberFee_proRata_months_helper() } as NumberInputI18n));
  protected invoiceStateI18n = computed(() => ({ name: 'invoiceState', label: this.i18n().invoice_state()                                           } as StringSelectI18n));

  // inputs
  public readonly i18n = input.required<MembershipI18n>();
  /** the parent always has a fee (its `fee` input is required), so the model is required too — form() needs a defined value */
  public readonly formData = model.required<MemberFeeModel>();
  public currentUser = input<UserModel | undefined>(undefined);
  public showForm = input(true);
  public readOnly = input(false);
  public membershipCategories = input<CategoryListModel | undefined>(undefined);

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // computed
  protected age = computed(() => {
    const age = getAgeFromBirthYear(this.formData().memberBirthYear);
    return age >= 0 ? age : '';
  });
  protected category = computed(() => this.formData().category ?? '');
  protected bexioId = computed(() => this.formData().memberBexioId ?? '');
  protected notes = computed(() => this.formData().notes ?? '');
  protected positions = computed((): MemberFeePosition[] => this.formData().positions ?? []);
  protected total = computed(() => getFeeTotal(this.positions()).toFixed(2));

  protected state = computed(() => this.formData().state ?? '');

  // The suite takes tenants and tags (for baseValidations), which validateVestTree does not pass —
  // so the bridge calls it through a closure. The fee form has always validated them as '' (it
  // neither edits tenants nor tags); keep that so validity is unchanged.
  private readonly suiteWithContext = (model: MemberFeeModel, field?: string) =>
    memberFeeValidations(model, '', '', field);
  protected readonly memberFeeForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, this.suiteWithContext as any));

  private readonly validationResult = computed(() => memberFeeValidations(this.formData(), '', ''));
  protected stateErrors = computed(() => this.validationResult().getErrors('state'));

  /**
   * The suite files a position's failures under `positions[<i>].amount`, so each note has to read
   * its own indexed name — a plain `getErrors('positions')` would always be empty and the missing
   * banner would be the only symptom.
   */
  protected positionRows = computed((): PositionRow[] => {
    const allErrors = this.validationResult().getErrors();
    return this.positions().map((position, index) => {
      const field = positionAmountField(index);
      return {
        index,
        amount: position.amount,
        i18n: { name: field, label: position.label, placeholder: position.label, helper: '' } as NumberInputI18n,
        errors: Object.entries(allErrors)
          .filter(([name]) => name === field)
          .flatMap(([, messages]) => messages),
        yearlyAmount: position.yearlyAmount,
        months: position.proRataMonths ?? 12,
        description: position.description ?? '',
      };
    });
  });

  protected readonly invoiceStateList = [...INVOICE_STATE_VALUES];

  constructor() {
    effect(() => this.valid.emit(this.memberFeeForm().valid()));
  }

  protected onFieldChange(field: keyof MemberFeeModel, value: unknown): void {
    this.dirty.emit(true);
    this.formData.update(fd => ({ ...fd, [field]: value }));
  }

  /** Never mutate the array in place — a new array is what makes the computeds (and the banner) refresh. */
  protected onPositionAmountChange(index: number, value: number): void {
    this.dirty.emit(true);
    this.formData.update(fd => ({
      ...fd,
      positions: (fd.positions ?? []).map((p, i) => i === index ? { ...p, amount: Number(value) } : p)
    }));
  }

  /**
   * Rescale a pro-rata position to the months the treasurer enters (spec 1.79 §3.4): 12 restores
   * the full year. A typed amount (onPositionAmountChange) is never overwritten here — it wins.
   */
  protected onPositionMonthsChange(index: number, value: number): void {
    const months = Math.min(12, Math.max(1, Math.round(Number(value) || 12)));
    this.dirty.emit(true);
    this.formData.update(fd => ({
      ...fd,
      positions: (fd.positions ?? []).map((p, i) => i === index ? applyProRata(p, months) : p)
    }));
  }
}
