import { Component, Signal, computed, effect, input, linkedSignal, model, output, signal } from '@angular/core';
import {
  IonButton, IonCol, IonGrid, IonIcon, IonItem, IonLabel,
  IonList, IonRow, IonSelect, IonSelectOption, IonTextarea,
} from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { ErrorNote, TextInput, TextInputI18n } from '@okr/shared-ui';
import { formatIban, IbanFormat } from '@okr/shared-util-angular';

import { ALLOWED_CURRENCIES, ExpenseFormValue, expenseValidations } from '@okr/finance-expense-util';

export interface ExpenseFormI18n {
  abstract_label: Signal<string>;
  amount_label: Signal<string>;
  currency_label: Signal<string>;
  transfer_label: Signal<string>;
  transfer_me: Signal<string>;
  transfer_issuer: Signal<string>;
  iban_label: Signal<string>;
  iban_on: Signal<string>;
  iban_profile_hint: Signal<string>;
  iban_change: Signal<string>;
  category_label: Signal<string>;
  costcenter_label: Signal<string>;
  note_label: Signal<string>;
  belege_label: Signal<string>;
  belege_pick: Signal<string>;
  belege_photo: Signal<string>;
}

@Component({
  selector: 'okr-expense-form',
  standalone: true,
  imports: [
    TextInput, ErrorNote,
    IonGrid, IonRow, IonCol, IonItem, IonLabel,
    IonSelect, IonSelectOption, IonTextarea, IonList,
    IonButton, IonIcon,
    SvgIconPipe,
  ],
  template: `
    <form novalidate>

      <ion-grid>
        <ion-row>
          <ion-col size="12">
            <okr-text-input [i18n]="abstractI18n()" [value]="abstract()"
              (valueChange)="onFieldChange('abstract', $event)" [autofocus]="true" [readOnly]="false" />
            <okr-error-note [errors]="abstractErrors()" />
          </ion-col>
        </ion-row>

        <ion-row>
          <ion-col size="8">
            <okr-text-input [i18n]="amountI18n()" [value]="amountCHFStr()"
              (valueChange)="onAmountChange($event)" [maxLength]="10" [readOnly]="false" />
            <okr-error-note [errors]="amountErrors()" />
          </ion-col>
          <ion-col size="4">
            <ion-item>
              <ion-label>{{ i18n().currency_label() }}</ion-label>
              <ion-select [value]="currency()" (ionChange)="onFieldChange('currency', $event.detail.value)">
                @for (c of currencies; track c) {
                  <ion-select-option [value]="c">{{ c }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
            <okr-error-note [errors]="currencyErrors()" />
          </ion-col>
        </ion-row>

        <ion-row>
          <ion-col size="12">
            <ion-item>
              <ion-label>{{ i18n().transfer_label() }}</ion-label>
              <ion-select [value]="transferTo()" (ionChange)="onFieldChange('transferTo', $event.detail.value)">
                <ion-select-option value="me">{{ i18n().transfer_me() }}</ion-select-option>
                <ion-select-option value="issuer">{{ i18n().transfer_issuer() }}</ion-select-option>
              </ion-select>
            </ion-item>
          </ion-col>
        </ion-row>

        @if (transferTo() === 'me') {
          <ion-row>
            <ion-col size="12">
              @if (hasFavoriteIban() && !editingIban()) {
                <ion-item lines="none">
                  <ion-label>
                    <h3>{{ i18n().iban_on() }} {{ formatIban(favoriteIban()) }}</h3>
                    <p class="hint">{{ i18n().iban_profile_hint() }}</p>
                  </ion-label>
                  <ion-button slot="end" fill="clear" (click)="startEditIban()" [title]="i18n().iban_change()">
                    <ion-icon slot="icon-only" color="medium" src="{{ 'cancel-circle' | svgIcon }}" />
                  </ion-button>
                </ion-item>
                <!-- Surface IBAN errors even while the saved favorite is shown read-only,
                     so an invalid stored IBAN can't silently block the save banner. -->
                <okr-error-note [errors]="ibanErrors()" />
              } @else {
                <okr-text-input [i18n]="ibanI18n()" [value]="iban()"
                  (valueChange)="onFieldChange('iban', $event)" [maxLength]="34" [readOnly]="false" />
                <okr-error-note [errors]="ibanErrors()" />
              }
            </ion-col>
          </ion-row>
        }

        <ion-row>
          <ion-col size="12">
            <ion-item>
              <ion-label>{{ i18n().belege_label() }}</ion-label>
            </ion-item>
            <ion-list>
              @for (f of files(); track f.name; let i = $index) {
                <ion-item>
                  <ion-label>{{ f.name }}</ion-label>
                  <ion-button slot="end" fill="clear" (click)="removeFile(i)">
                    <ion-icon src="{{ 'cancel' | svgIcon }}" slot="icon-only" />
                  </ion-button>
                </ion-item>
              }
            </ion-list>
            <ion-row>
              <ion-col>
                <ion-button fill="outline" (click)="pickFiles.emit()">
                  {{ i18n().belege_pick() }}
                </ion-button>
              </ion-col>
              <ion-col>
                <ion-button fill="outline" (click)="takePhoto.emit()">
                  {{ i18n().belege_photo() }}
                </ion-button>
              </ion-col>
            </ion-row>
          </ion-col>
        </ion-row>

        <ion-row>
          <ion-col size="12">
            <ion-item>
              <ion-label>{{ i18n().note_label() }}</ion-label>
              <ion-textarea [value]="note()" (ionInput)="onFieldChange('note', $event.detail.value)" [autoGrow]="true" />
            </ion-item>
          </ion-col>
        </ion-row>
      </ion-grid>
    </form>
  `,
})
export class ExpenseForm {
  public readonly i18n = input.required<ExpenseFormI18n>();
  /** The current user's favorite bank-account IBAN (''=none → the user must enter a new one). */
  public readonly favoriteIban = input<string>('');
  public formData = model.required<ExpenseFormValue>();
  public files = model<File[]>([]);

  public dirty = output<boolean>();
  public valid = output<boolean>();
  public pickFiles = output<void>();
  public takePhoto = output<void>();

  protected readonly currencies = ALLOWED_CURRENCIES;
  protected readonly formatIban = (iban: string) => formatIban(iban, IbanFormat.Friendly);

  private readonly result = computed(() => expenseValidations(this.formData()));
  protected readonly abstractErrors = computed(() => this.result().getErrors('abstract'));
  protected readonly amountErrors   = computed(() => this.result().getErrors('amountCHF'));
  protected readonly currencyErrors = computed(() => this.result().getErrors('currency'));
  protected readonly ibanErrors     = computed(() => this.result().getErrors('iban'));

  protected abstract    = linkedSignal(() => this.formData().abstract);
  protected amountCHF   = linkedSignal(() => this.formData().amountCHF);
  protected currency    = linkedSignal(() => this.formData().currency);
  protected transferTo  = linkedSignal(() => this.formData().transferTo);
  protected iban        = linkedSignal(() => this.formData().iban);
  protected note        = linkedSignal(() => this.formData().note);

  protected amountCHFStr  = computed(() => this.amountCHF() > 0 ? String(this.amountCHF()) : '');
  protected readonly hasFavoriteIban = computed(() => this.favoriteIban().trim().length > 0);
  /** True once the user chose to redirect the transfer to a different IBAN than their saved one. */
  protected readonly editingIban = signal(false);

  /** Switch from the saved-IBAN display to a blank input so the user can enter a different IBAN. */
  protected startEditIban(): void {
    this.editingIban.set(true);
    this.onFieldChange('iban', '');
  }

  constructor() {
    effect(() => this.valid.emit(this.result().isValid()));
  }

  protected abstractI18n = computed(() => ({
    name: 'abstract',
    label: this.i18n().abstract_label(),
    placeholder: '',
    helper: '',
  }) as TextInputI18n);

  protected amountI18n = computed(() => ({
    name: 'amountCHF',
    label: this.i18n().amount_label(),
    placeholder: '',
    helper: '',
  }) as TextInputI18n);

  protected ibanI18n = computed(() => ({
    name: 'iban',
    label: this.i18n().iban_label(),
    placeholder: '',
    helper: '',
  }) as TextInputI18n);

  protected onAmountChange(v: string): void {
    const parsed = parseFloat(v);
    this.onFieldChange('amountCHF', isNaN(parsed) ? 0 : parsed);
  }

  protected onFieldChange(field: string, value: unknown): void {
    this.dirty.emit(true);
    this.formData.update(d => ({ ...d, [field]: value }));
  }

  protected removeFile(index: number): void {
    this.dirty.emit(true);
    this.files.update(fs => fs.filter((_, i) => i !== index));
  }
}
