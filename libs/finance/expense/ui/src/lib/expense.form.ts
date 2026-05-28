import { Component, Signal, computed, input, linkedSignal, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton, IonCol, IonGrid, IonIcon, IonItem, IonLabel,
  IonList, IonRow, IonSelect, IonSelectOption, IonTextarea,
} from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { AddressModel } from '@bk2/shared-models';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { ErrorNote, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { formatIban, IbanFormat } from '@bk2/shared-util-angular';

import { ALLOWED_CURRENCIES, ExpenseFormValue, expenseValidations } from '@bk2/finance-expense-util';

export interface ExpenseFormI18n {
  abstract_label: Signal<string>;
  amount_label: Signal<string>;
  currency_label: Signal<string>;
  iban_label: Signal<string>;
  iban_new: Signal<string>;
  category_label: Signal<string>;
  costcenter_label: Signal<string>;
  note_label: Signal<string>;
  belege_label: Signal<string>;
  belege_pick: Signal<string>;
  belege_photo: Signal<string>;
}

@Component({
  selector: 'bk-expense-form',
  standalone: true,
  imports: [
    FormsModule,
    vestForms,
    TextInput, ErrorNote,
    IonGrid, IonRow, IonCol, IonItem, IonLabel,
    IonSelect, IonSelectOption, IonTextarea, IonList,
    IonButton, IonIcon,
    SvgIconPipe,
  ],
  template: `
    <form scVestForm
      [formValue]="formData()"
      [suite]="suite"
      (dirtyChange)="dirty.emit($event)"
      (validChange)="valid.emit($event)"
      (formValueChange)="onFormChange($event)">

      <ion-grid>
        <ion-row>
          <ion-col size="12">
            <bk-text-input [i18n]="abstractI18n()" [value]="abstract()"
              (valueChange)="onFieldChange('abstract', $event)" [autofocus]="true" [readOnly]="false" />
            <bk-error-note [errors]="abstractErrors()" />
          </ion-col>
        </ion-row>

        <ion-row>
          <ion-col size="8">
            <bk-text-input [i18n]="amountI18n()" [value]="amountCHFStr()"
              (valueChange)="onAmountChange($event)" [readOnly]="false" />
            <bk-error-note [errors]="amountErrors()" />
          </ion-col>
          <ion-col size="4">
            <ion-item>
              <ion-label>{{ i18n().currency_label() }}</ion-label>
              <ion-select [(ngModel)]="currencyModel" name="currency">
                @for (c of currencies; track c) {
                  <ion-select-option [value]="c">{{ c }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
          </ion-col>
        </ion-row>

        <ion-row>
          <ion-col size="12">
            <ion-item>
              <ion-label>{{ i18n().iban_label() }}</ion-label>
              <ion-select [(ngModel)]="ibanSelectModel" name="ibanSelect">
                @for (addr of ibans(); track addr.bkey) {
                  <ion-select-option [value]="addr.iban">
                    {{ addr.isFavorite ? '★ ' : '' }}{{ formatIban(addr.iban) }}
                  </ion-select-option>
                }
                <ion-select-option value="__new__">{{ i18n().iban_new() }}</ion-select-option>
              </ion-select>
            </ion-item>
            @if (showIbanInput()) {
              <bk-text-input [i18n]="ibanI18n()" [value]="iban()"
                (valueChange)="onFieldChange('iban', $event)" [readOnly]="false" />
              <bk-error-note [errors]="ibanErrors()" />
            }
          </ion-col>
        </ion-row>

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
                    <ion-icon src="{{ 'close' | svgIcon }}" slot="icon-only" />
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
              <ion-textarea [(ngModel)]="noteModel" name="note" [autoGrow]="true" />
            </ion-item>
          </ion-col>
        </ion-row>
      </ion-grid>
    </form>
  `,
})
export class ExpenseForm {
  public readonly i18n = input.required<ExpenseFormI18n>();
  public readonly ibans = input<AddressModel[]>([]);
  public formData = model.required<ExpenseFormValue>();
  public files = model<File[]>([]);

  public dirty = output<boolean>();
  public valid = output<boolean>();
  public pickFiles = output<void>();
  public takePhoto = output<void>();

  protected readonly suite = expenseValidations;
  protected readonly currencies = ALLOWED_CURRENCIES;
  protected readonly formatIban = (iban: string) => formatIban(iban, IbanFormat.Friendly);

  private readonly result = computed(() => expenseValidations(this.formData()));
  protected readonly abstractErrors = computed(() => this.result().getErrors('abstract'));
  protected readonly amountErrors   = computed(() => this.result().getErrors('amountCHF'));
  protected readonly ibanErrors     = computed(() => this.result().getErrors('iban'));

  protected abstract    = linkedSignal(() => this.formData().abstract);
  protected amountCHF   = linkedSignal(() => this.formData().amountCHF);
  protected currency    = linkedSignal(() => this.formData().currency);
  protected iban        = linkedSignal(() => this.formData().iban);
  protected note        = linkedSignal(() => this.formData().note);

  protected amountCHFStr  = computed(() => this.amountCHF() > 0 ? String(this.amountCHF()) : '');
  protected showIbanInput = computed(() => this.ibans().length === 0 || this.iban() === '' || !this.ibans().some(a => a.iban === this.iban()));

  protected get ibanSelectModel(): string {
    const saved = this.ibans().find(a => a.iban === this.iban());
    return saved ? this.iban() : (this.iban() ? '__new__' : '');
  }
  protected set ibanSelectModel(v: string) {
    if (v === '__new__') {
      this.onFieldChange('iban', '');
    } else {
      this.onFieldChange('iban', v);
    }
  }

  protected get currencyModel(): string { return this.currency(); }
  protected set currencyModel(v: string) { this.onFieldChange('currency', v); }

  protected get noteModel(): string { return this.note(); }
  protected set noteModel(v: string) { this.onFieldChange('note', v); }

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

  protected onFormChange(value: ExpenseFormValue): void {
    this.formData.update(d => ({ ...d, ...value }));
  }

  protected removeFile(index: number): void {
    this.files.update(fs => fs.filter((_, i) => i !== index));
  }
}
