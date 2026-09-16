import { Component, computed, effect, input, model, output, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonRow } from '@ionic/angular/standalone';

import { AccountModel, AvatarInfo, RoleName, UserModel, VatCodeModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { DateInput, DateInputI18n, ErrorNote, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree } from '@okr/shared-util-angular';
import { coerceBoolean, hasRole } from '@okr/shared-util-core';

import { AvatarSelect } from '@okr/avatar-ui';
import { AccountSelect, AccountSelectI18n } from '@okr/finance-account-ui';
import { BookingFormData, BookingI18n, BookingPair, bookingValidations, emptyBookingPair, formatMinorAmount, pairsTotal } from '@okr/finance-booking-util';

/**
 * The booking form: date, name, counterparty, then one row per debit/credit pair
 * (Haben-Konto · Soll-Konto · Betrag). Foreign currency and VAT sit behind the row's detail
 * toggle — rarely used, so they do not widen the row. Amounts are edited in major units and
 * stored in minor units. The counterparty picker lives in the parent (feature layer).
 */
@Component({
  selector: 'okr-booking-form',
  standalone: true,
  imports: [
    SvgIconPipe, DateInput, TextInput, NumberInput, StringSelect, NotesInput, ErrorNote, AvatarSelect, AccountSelect,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonButton, IonIcon,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .line-header ion-col { font-size: 0.8rem; color: var(--ion-color-medium); padding-left: 1rem; }
    .line-tools { display: flex; justify-content: flex-end; gap: 0.25rem; }
    .line-tools ion-button { --padding-start: 4px; --padding-end: 4px; }
    .line-tools ion-icon { font-size: 1.3rem; }
    .details-row { background: rgba(var(--ion-color-light-rgb), 0.5); }
    .total { text-align: end; font-weight: 600; padding: 0.5rem 1rem; }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="4">
                  <okr-date-input [i18n]="dateI18n()" [storeDate]="date()" (storeDateChange)="onFieldChange('date', $event)" [locale]="locale()" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="dateErrors()" />
                </ion-col>
                <ion-col size="12" size-md="8">
                  <okr-text-input [i18n]="nameI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)" [autofocus]="true" [maxLength]="100" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="titleErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-avatar-select name="counterparty" [title]="i18n().form_counterparty_label()" [selectLabel]="i18n().counterparty_select()"
                    [avatar]="counterparty()" [clearable]="true" [readOnly]="isReadOnly()"
                    (selectClicked)="counterpartySelect.emit()" (clearClicked)="onFieldChange('counterparty', undefined)" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row class="line-header ion-hide-sm-down">
                <ion-col size-md="4">{{ i18n().form_credit_label() }}</ion-col>
                <ion-col size-md="4">{{ i18n().form_debit_label() }}</ion-col>
                <ion-col size-md="3">{{ i18n().form_amount_label() }}</ion-col>
                <ion-col size-md="1"></ion-col>
              </ion-row>
              @for (pair of pairs(); track $index; let i = $index) {
                <ion-row class="ion-align-items-center">
                  <ion-col size="12" size-md="4">
                    <okr-account-select [i18n]="creditI18n()" [accounts]="accounts()" [allowEmpty]="false"
                      [selectedKey]="pair.creditAccountKey" (selectedKeyChange)="onPairChange(i, 'creditAccountKey', $event)" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="4">
                    <okr-account-select [i18n]="debitI18n()" [accounts]="accounts()" [allowEmpty]="false"
                      [selectedKey]="pair.debitAccountKey" (selectedKeyChange)="onPairChange(i, 'debitAccountKey', $event)" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <ion-col size="8" size-md="3">
                    <okr-number-input [i18n]="amountI18n()" [value]="pair.amount / 100" (valueChange)="onPairChange(i, 'amount', toMinor($event))" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <ion-col size="4" size-md="1">
                    <div class="line-tools">
                      <ion-button fill="clear" size="small" (click)="toggleDetails(i)" [title]="i18n().form_details_toggle()">
                        <ion-icon slot="icon-only" src="{{ (isExpanded(i) ? 'chevron-up' : 'chevron-down') | svgIcon }}" />
                      </ion-button>
                      @if (!isReadOnly() && pairs().length > 1) {
                        <ion-button fill="clear" size="small" color="danger" (click)="removePair(i)" [title]="i18n().form_line_remove()">
                          <ion-icon slot="icon-only" src="{{ 'trash' | svgIcon }}" />
                        </ion-button>
                      }
                    </div>
                  </ion-col>
                </ion-row>
                @if (isExpanded(i)) {
                  <ion-row class="details-row ion-align-items-center">
                    <ion-col size="12" size-md="4">
                      <okr-number-input [i18n]="fxAmountI18n()" [value]="pair.amountFx / 100" (valueChange)="onPairChange(i, 'amountFx', toMinor($event))" [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="12" size-md="4">
                      <okr-text-input [i18n]="fxCurrencyI18n()" [value]="pair.fxCurrency" (valueChange)="onPairChange(i, 'fxCurrency', $event.toUpperCase())" [maxLength]="3" [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="12" size-md="4">
                      <okr-string-select [i18n]="vatI18n()" [stringList]="vatCodeKeys()" [labels]="vatCodeLabels()"
                        [selectedString]="pair.vatCodeKey" (selectedStringChange)="onPairChange(i, 'vatCodeKey', $event)" [readOnly]="isReadOnly()" />
                    </ion-col>
                  </ion-row>
                }
              }
              <ion-row class="ion-align-items-center">
                <ion-col size="6">
                  @if (!isReadOnly()) {
                    <ion-button fill="clear" size="small" (click)="addPair()">
                      <ion-icon slot="start" src="{{ 'add' | svgIcon }}" />{{ i18n().form_line_add() }}
                    </ion-button>
                  }
                </ion-col>
                <ion-col size="6" class="total">{{ i18n().form_total_label() }}: {{ total() }}</ion-col>
              </ion-row>
            </ion-grid>
            <okr-error-note [errors]="pairsErrors()" />
          </ion-card-content>
        </ion-card>

        @if (hasRole('treasurer')) {
          <okr-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
        }
      </form>
    }
  `,
})
export class BookingForm {
  public readonly i18n = input.required<BookingI18n>();
  public formData = model.required<BookingFormData>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly accounts = input<AccountModel[]>([]);
  public readonly vatCodes = input<VatCodeModel[]>([]);
  public readonly locale = input('de-ch');
  public readonly readOnly = input(true);
  public readonly showForm = input(true);

  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  /** The parent picks the counterparty (the person/org picker is a feature-layer service). */
  public readonly counterpartySelect = output<void>();

  protected readonly bookingForm = form(this.formData, (path) => validateVestTree(path, bookingValidations as any));

  constructor() {
    effect(() => this.valid.emit(this.bookingForm().valid()));
  }

  private readonly expanded = signal<Set<number>>(new Set());

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly date = computed(() => this.formData()?.date ?? '');
  protected readonly title = computed(() => this.formData()?.title ?? '');
  protected readonly notes = computed(() => this.formData()?.notes ?? '');
  protected readonly counterparty = computed(() => this.formData()?.counterparty);
  protected readonly pairs = computed(() => this.formData()?.pairs ?? []);
  protected readonly total = computed(() => formatMinorAmount(pairsTotal(this.pairs())));

  protected readonly dateErrors = computed(() => this.bookingForm.date().errors().map(e => e.message ?? ''));
  protected readonly titleErrors = computed(() => this.bookingForm.title().errors().map(e => e.message ?? ''));
  protected readonly pairsErrors = computed(() => this.bookingForm.pairs().errors().map(e => e.message ?? ''));

  protected readonly vatCodeKeys = computed(() => ['', ...this.vatCodes().map(v => v.okey)]);
  protected readonly vatCodeLabels = computed(() => ['—', ...this.vatCodes().map(v => `${v.code} — ${v.name}`)]);

  protected readonly dateI18n = computed(() => ({ name: 'date', label: this.i18n().form_date_label(), placeholder: this.i18n().form_date_placeholder() } as DateInputI18n));
  protected readonly nameI18n = computed(() => ({ name: 'title', label: this.i18n().form_name_label(), placeholder: this.i18n().form_name_placeholder(), helper: this.i18n().form_name_helper() } as TextInputI18n));
  protected readonly creditI18n = computed(() => ({ name: 'creditAccountKey', label: this.i18n().form_credit_label(), helper: '' } as AccountSelectI18n));
  protected readonly debitI18n = computed(() => ({ name: 'debitAccountKey', label: this.i18n().form_debit_label(), helper: '' } as AccountSelectI18n));
  protected readonly amountI18n = computed(() => ({ name: 'amount', label: this.i18n().form_amount_label(), placeholder: this.i18n().form_amount_placeholder(), helper: '' } as NumberInputI18n));
  protected readonly fxAmountI18n = computed(() => ({ name: 'amountFx', label: this.i18n().form_fx_amount_label(), placeholder: this.i18n().form_fx_amount_placeholder(), helper: '' } as NumberInputI18n));
  protected readonly fxCurrencyI18n = computed(() => ({ name: 'fxCurrency', label: this.i18n().form_fx_currency_label(), placeholder: 'EUR', helper: '' } as TextInputI18n));
  protected readonly vatI18n = computed(() => ({ name: 'vatCodeKey', label: this.i18n().form_vat_label(), helper: '' } as StringSelectI18n));
  protected readonly notesI18n = computed(() => ({ name: 'notes', label: this.i18n().form_notes_label(), placeholder: this.i18n().form_notes_placeholder() } as NotesInputI18n));

  protected isExpanded(i: number): boolean { return this.expanded().has(i); }
  protected toggleDetails(i: number): void {
    this.expanded.update(set => { const next = new Set(set); if (next.has(i)) next.delete(i); else next.add(i); return next; });
  }
  protected toMinor(value: number): number { return Math.round((Number(value) || 0) * 100); }

  protected onFieldChange(fieldName: 'date' | 'title' | 'notes' | 'counterparty', fieldValue: string | AvatarInfo | undefined): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onPairChange(index: number, field: keyof BookingPair, value: string | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, pairs: vm.pairs.map((p, i) => i === index ? { ...p, [field]: value } : p) }));
  }

  protected addPair(): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, pairs: [...vm.pairs, emptyBookingPair()] }));
  }

  protected removePair(index: number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, pairs: vm.pairs.filter((_, i) => i !== index) }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
