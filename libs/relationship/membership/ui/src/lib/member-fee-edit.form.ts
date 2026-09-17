import { ChangeDetectionStrategy, Component, computed, effect, input, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';

import { CategoryListModel, INVOICE_STATE_VALUES, MemberFeeModel, MemberFeePosition, UserModel } from '@okr/shared-models';
import { NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n , ErrorNote} from '@okr/shared-ui';
import { getAgeFromBirthYear } from '@okr/shared-util-core';

import { MembershipI18n, getFeeTotal, memberFeeValidations, positionAmountField } from '@okr/relationship-membership-util';

/** One rendered fee line: the position itself plus the i18n object and errors belonging to it. */
interface PositionRow {
  index: number;
  amount: number;
  i18n: NumberInputI18n;
  errors: string[];
}

@Component({
  selector: 'okr-member-fee-edit-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ErrorNote,
    NumberInput, StringSelect, NotesInput,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonItem, IonLabel,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (showForm() && formData(); as fd) {
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
                      (valueChange)="onPositionAmountChange(row.index, $event, fd)"
                      [readOnly]="readOnly()" />
                    <okr-error-note [errors]="row.errors" />
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
                    [selectedString]="fd.state"
                    (selectedStringChange)="onFieldChange('state', $event, fd)"
                    [readOnly]="readOnly()"
                    [stringList]="invoiceStateList" />
                  <okr-error-note [errors]="stateErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
        <okr-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event, fd)" [readOnly]="false" />
      </form>
    }
  `
})
export class MemberFeeEditForm {
  // i18n — all translations come from the i18n input
  protected notesI18n        = computed(() => ({ name: 'notes',        label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder() } as NotesInputI18n));
  protected invoiceStateI18n = computed(() => ({ name: 'invoiceState', label: this.i18n().invoice_state()                                           } as StringSelectI18n));

  // inputs
  public readonly i18n = input.required<MembershipI18n>();
  public formData = input<MemberFeeModel | undefined>(undefined);
  public currentUser = input<UserModel | undefined>(undefined);
  public showForm = input(true);
  public readOnly = input(false);
  public membershipCategories = input<CategoryListModel | undefined>(undefined);

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  public formDataChange = output<MemberFeeModel>();

  // computed
  protected age = computed(() => {
    const age = getAgeFromBirthYear(this.formData()?.memberBirthYear);
    return age >= 0 ? age : '';
  });
  protected category = computed(() => this.formData()?.category ?? '');
  protected bexioId = computed(() => this.formData()?.memberBexioId ?? '');
  protected notes = computed(() => this.formData()?.notes ?? '');
  protected positions = computed((): MemberFeePosition[] => this.formData()?.positions ?? []);
  protected total = computed(() => getFeeTotal(this.positions()).toFixed(2));

  private readonly validationResult = computed(() => {
    const fd = this.formData();
    return fd ? memberFeeValidations(fd, '', '') : null;
  });
  protected stateErrors = computed(() => this.validationResult()?.getErrors('state') ?? []);

  /**
   * The suite files a position's failures under `positions[<i>].amount`, so each note has to read
   * its own indexed name — a plain `getErrors('positions')` would always be empty and the missing
   * banner would be the only symptom.
   */
  protected positionRows = computed((): PositionRow[] => {
    const allErrors = this.validationResult()?.getErrors() ?? {};
    return this.positions().map((position, index) => {
      const field = positionAmountField(index);
      return {
        index,
        amount: position.amount,
        i18n: { name: field, label: position.label, placeholder: position.label, helper: '' } as NumberInputI18n,
        errors: Object.entries(allErrors)
          .filter(([name]) => name === field)
          .flatMap(([, messages]) => messages),
      };
    });
  });

  protected readonly invoiceStateList = [...INVOICE_STATE_VALUES];

  constructor() {
    effect(() => this.valid.emit(this.validationResult()?.isValid() ?? true));
  }

  protected onFieldChange(field: keyof MemberFeeModel, value: unknown, fd: MemberFeeModel): void {
    this.dirty.emit(true);
    this.formDataChange.emit({ ...fd, [field]: value });
  }

  /** Never mutate the array in place — a new array is what makes the computeds (and the banner) refresh. */
  protected onPositionAmountChange(index: number, value: number, fd: MemberFeeModel): void {
    this.dirty.emit(true);
    const positions = (fd.positions ?? []).map((p, i) => i === index ? { ...p, amount: Number(value) } : p);
    this.formDataChange.emit({ ...fd, positions });
  }
}
