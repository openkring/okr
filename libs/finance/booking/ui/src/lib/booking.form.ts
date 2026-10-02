import { Component, computed, effect, input, model, output, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonImg, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular/standalone';

import { AccountModel, AvatarInfo, CostCenterModel, RoleName, UserModel, VatCodeModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { AmountInput, AmountInputI18n, DateInput, DateInputI18n, ErrorNote, NotesInput, NotesInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree } from '@okr/shared-util-angular';
import { coerceBoolean, hasRole, isProfitAndLossAccountId } from '@okr/shared-util-core';

import { AvatarPipe } from '@okr/avatar-ui';
import { AccountSelect, AccountSelectI18n } from '@okr/finance-account-ui';
import { CostCenterSelect, CostCenterSelectI18n } from '@okr/finance-cost-center-ui';
import { accountDefaultCostCenterKey, addBookingPart, BOOKING_LINE_TEXT_LENGTH, BookingFormData, BookingI18n, BookingPair, bookingValidations, counterpartyLabel, formatMinorAmount, pairsTotal, removeBookingPart, withPairAccount, withSplitTitle } from '@okr/finance-booking-util';

/**
 * The booking form: date, name, counterparty, then one card per debit/credit pair
 * (Soll-Konto · Haben-Konto · [Text] · Betrag). A split booking (more than one pair) is named
 * 'Sammelbuchung · <Gegenpartei>' (read-only) and each part gets its own text field. Foreign
 * currency, VAT and the account swap sit behind the card's detail toggle — rarely used, so they do
 * not widen the row. Amounts are edited in major units and
 * stored in minor units. The counterparty picker lives in the parent (feature layer).
 */
@Component({
  selector: 'okr-booking-form',
  standalone: true,
  imports: [
    SvgIconPipe, DateInput, TextInput, AmountInput, StringSelect, NotesInput, ErrorNote, AccountSelect, CostCenterSelect,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonButton, IonIcon, IonItem, IonLabel, IonNote, IonAvatar, IonImg, AvatarPipe,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .line-header, .line-footer { margin: 0 10px; }
    .line-header ion-col { font-size: 0.8rem; color: var(--ion-color-medium); padding-left: 1rem; padding-bottom: 0; }
    ion-card.line-card { margin-top: 4px; margin-bottom: 4px; }
    @media (width <= 600px) { .line-header, .line-footer { margin: 0 5px; } }
    .line-tools { display: flex; justify-content: flex-end; gap: 0.25rem; }
    .line-tools ion-button { --padding-start: 4px; --padding-end: 4px; }
    .line-tools ion-icon { font-size: 1.3rem; }
    .details-row { background: rgba(var(--ion-color-light-rgb), 0.5); }
    .total { text-align: end; font-weight: 600; padding: 0.5rem 1rem; }
    .counterparty { --min-height: 44px; }
    .counterparty ion-note { font-size: 0.75rem; }
    .counterparty ion-avatar { width: 32px; height: 32px; }
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
                  <!-- a split booking is named after its counterparty ('Sammelbuchung · Migros'), not typed -->
                  <okr-text-input [i18n]="nameI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)" [autofocus]="!isSplit()" [maxLength]="100" [readOnly]="isReadOnly() || isSplit()" />
                  <okr-error-note [errors]="titleErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <!-- the counterparty is optional and rarely edited: one quiet line, not a card -->
                  <ion-item lines="none" class="counterparty">
                    <!-- the avatar shows the counterparty is linked to a person/org record, not just a name from the bank file -->
                    @if (counterpartyAvatarKey(); as avatarKey) {
                      <ion-avatar slot="start"><ion-img src="{{ avatarKey | avatar }}" alt="" /></ion-avatar>
                    }
                    <ion-label>
                      <ion-note>{{ i18n().form_counterparty_label() }}</ion-note>
                      <div>{{ counterpartyName() || '—' }}</div>
                    </ion-label>
                    @if (!isReadOnly()) {
                      @if (counterparty()) {
                        <ion-button slot="end" fill="clear" size="small" (click)="onFieldChange('counterparty', undefined)">
                          <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" />
                        </ion-button>
                      }
                      <ion-button slot="end" fill="clear" size="small" (click)="counterpartySelect.emit()">
                        <ion-icon slot="icon-only" src="{{ 'person' | svgIcon }}" />
                      </ion-button>
                    }
                  </ion-item>
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <!-- the Soll/Haben/Text/Betrag heads of the line cards below (md+ only; a phone stacks the fields) -->
        <ion-grid class="line-header ion-hide-sm-down">
          <ion-row>
            <ion-col [sizeMd]="accountColMd()">{{ i18n().form_debit_label() }}</ion-col>
            <ion-col [sizeMd]="accountColMd()">{{ i18n().form_credit_label() }}</ion-col>
            @if (isSplit()) { <ion-col size-md="3">{{ i18n().form_line_text_label() }}</ion-col> }
            <ion-col [sizeMd]="amountColMd()">{{ i18n().form_amount_label() }}</ion-col>
            <ion-col size-md="1"></ion-col>
          </ion-row>
        </ion-grid>
        @for (pair of pairs(); track $index; let i = $index) {
          <ion-card class="line-card">
            <ion-card-content class="ion-no-padding">
              <ion-grid>
                <ion-row class="ion-align-items-center">
                  <ion-col size="12" [sizeMd]="accountColMd()">
                    <okr-account-select [i18n]="debitI18n()" [accounts]="accounts()" [allowEmpty]="false" [compact]="true"
                      [selectedKey]="pair.debitAccountKey" (selectedKeyChange)="onAccountChange(i, 'debit', $event)" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <ion-col size="12" [sizeMd]="accountColMd()">
                    <okr-account-select [i18n]="creditI18n()" [accounts]="accounts()" [allowEmpty]="false" [compact]="true"
                      [selectedKey]="pair.creditAccountKey" (selectedKeyChange)="onAccountChange(i, 'credit', $event)" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <!-- a split booking's name is generated: each part carries its own text -->
                  @if (isSplit()) {
                    <ion-col size="12" size-md="3">
                      <okr-text-input [i18n]="lineTextI18n()" [value]="pair.description" (valueChange)="onPairChange(i, 'description', $event)"
                        [maxLength]="lineTextLength" [readOnly]="isReadOnly()" />
                    </ion-col>
                  }
                  <ion-col size="8" [sizeMd]="amountColMd()">
                    <okr-amount-input [i18n]="amountI18n()" [value]="pair.amount" (valueChange)="onPairChange(i, 'amount', $event)" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <ion-col size="4" size-md="1">
                    <div class="line-tools">
                      <ion-button fill="clear" size="small" (click)="toggleDetails(i)" [title]="i18n().form_details_toggle()">
                        <ion-icon slot="icon-only" src="{{ (isExpanded(i) ? 'chevron-up' : 'chevron-down') | svgIcon }}" />
                      </ion-button>
                      @if (!isReadOnly() && isSplit()) {
                        <ion-button fill="clear" size="small" color="danger" (click)="removePair(i)" [title]="i18n().form_line_remove()">
                          <ion-icon slot="icon-only" src="{{ 'trash' | svgIcon }}" />
                        </ion-button>
                      }
                    </div>
                  </ion-col>
                </ion-row>
                @if (isExpanded(i)) {
                  @if (showDebitCostCenter(pair) || showCreditCostCenter(pair)) {
                    <ion-row class="details-row ion-align-items-center">
                      <ion-col size="12" [sizeMd]="accountColMd()">
                        @if (showDebitCostCenter(pair)) {
                          <okr-cost-center-select [i18n]="costCenterI18n()" [costCenters]="costCenters()" [compact]="true"
                            [emptyLabel]="costCenterEmptyLabel(pair.debitAccountKey)"
                            [selectedKey]="pair.debitCostCenterKey" (selectedKeyChange)="onPairChange(i, 'debitCostCenterKey', $event)" [readOnly]="isReadOnly()" />
                        }
                      </ion-col>
                      <ion-col size="12" [sizeMd]="accountColMd()">
                        @if (showCreditCostCenter(pair)) {
                          <okr-cost-center-select [i18n]="costCenterI18n()" [costCenters]="costCenters()" [compact]="true"
                            [emptyLabel]="costCenterEmptyLabel(pair.creditAccountKey)"
                            [selectedKey]="pair.creditCostCenterKey" (selectedKeyChange)="onPairChange(i, 'creditCostCenterKey', $event)" [readOnly]="isReadOnly()" />
                        }
                      </ion-col>
                    </ion-row>
                  }
                  <ion-row class="details-row ion-align-items-center">
                    <ion-col size="12" size-md="1" class="ion-text-center">
                      @if (!isReadOnly()) {
                        <ion-button fill="clear" size="small" (click)="swapAccounts(i)" [title]="i18n().form_swap()">
                          <ion-icon slot="icon-only" src="{{ 'swap-horizontal' | svgIcon }}" />
                        </ion-button>
                      }
                    </ion-col>
                    <ion-col size="12" size-md="4">
                      <okr-amount-input [i18n]="fxAmountI18n()" [value]="pair.amountFx" (valueChange)="onPairChange(i, 'amountFx', $event)" [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="12" size-md="3">
                      <okr-text-input [i18n]="fxCurrencyI18n()" [value]="pair.fxCurrency" (valueChange)="onPairChange(i, 'fxCurrency', $event.toUpperCase())" [maxLength]="3" [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="12" size-md="4">
                      <okr-string-select [i18n]="vatI18n()" [stringList]="vatCodeKeys()" [labels]="vatCodeLabels()"
                        [selectedString]="pair.vatCodeKey" (selectedStringChange)="onPairChange(i, 'vatCodeKey', $event)" [readOnly]="isReadOnly()" />
                    </ion-col>
                  </ion-row>
                }
              </ion-grid>
            </ion-card-content>
          </ion-card>
        }
        <ion-grid class="line-footer">
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
          <okr-error-note [errors]="pairsErrors()" />
        </ion-grid>

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
  public readonly costCenters = input<CostCenterModel[]>([]);
  /** Kostenstellen only exist on the native ledger; a bexio ledger gets no picker. */
  public readonly costCentersEnabled = input(false);
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
  protected readonly counterpartyName = computed(() => counterpartyLabel(this.counterparty()));
  /** 'person.<okey>' / 'org.<okey>' once the counterparty is linked to a record; '' for a bare name (e.g. a bank payee). */
  protected readonly counterpartyAvatarKey = computed(() => {
    const c = this.counterparty();
    return c?.key && (c.modelType === 'person' || c.modelType === 'org') ? `${c.modelType}.${c.key}` : '';
  });
  protected readonly pairs = computed(() => this.formData()?.pairs ?? []);
  protected readonly isSplit = computed(() => this.pairs().length > 1);
  // md+ column widths of a line card: a split makes room for the part's text
  protected readonly accountColMd = computed(() => this.isSplit() ? '3' : '4');
  protected readonly amountColMd = computed(() => this.isSplit() ? '2' : '3');
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
  protected readonly amountI18n = computed(() => ({ name: 'amount', placeholder: this.i18n().form_amount_placeholder() } as AmountInputI18n));
  protected readonly fxAmountI18n = computed(() => ({ name: 'amountFx', label: this.i18n().form_fx_amount_label(), placeholder: this.i18n().form_fx_amount_placeholder() } as AmountInputI18n));
  protected readonly fxCurrencyI18n = computed(() => ({ name: 'fxCurrency', label: this.i18n().form_fx_currency_label(), placeholder: 'EUR', helper: '' } as TextInputI18n));
  protected readonly lineTextI18n = computed(() => ({ name: 'description', label: this.i18n().form_line_text_label(), placeholder: '', helper: '' } as TextInputI18n));
  protected readonly costCenterI18n = computed(() => ({ name: 'costCenterKey', label: this.i18n().form_cost_center_label() } as CostCenterSelectI18n));
  protected readonly vatI18n = computed(() => ({ name: 'vatCodeKey', label: this.i18n().form_vat_label(), helper: '' } as StringSelectI18n));
  protected readonly notesI18n = computed(() => ({ name: 'notes', label: this.i18n().form_notes_label(), placeholder: this.i18n().form_notes_placeholder() } as NotesInputI18n));

  /** kept in step with the cap writeBooking applies to a line text */
  protected readonly lineTextLength = BOOKING_LINE_TEXT_LENGTH;

  protected isExpanded(i: number): boolean { return this.expanded().has(i); }
  protected toggleDetails(i: number): void {
    this.expanded.update(set => { const next = new Set(set); if (next.has(i)) next.delete(i); else next.add(i); return next; });
  }

  protected onFieldChange(fieldName: 'date' | 'title' | 'notes' | 'counterparty', fieldValue: string | AvatarInfo | undefined): void {
    this.dirty.emit(true);
    // a split booking's name follows its counterparty
    this.formData.update((vm) => withSplitTitle({ ...vm, [fieldName]: fieldValue }, this.i18n().split_title()));
  }

  /** An account change keeps the side's Kostenstelle consistent (P&L default prefilled, balance-sheet cleared). */
  protected onAccountChange(index: number, side: 'debit' | 'credit', accountKey: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, pairs: vm.pairs.map((p, i) => i === index ? withPairAccount(p, side, accountKey, this.accounts()) : p) }));
  }

  protected showDebitCostCenter(pair: BookingPair): boolean { return this.showCostCenter(pair.debitAccountKey); }
  protected showCreditCostCenter(pair: BookingPair): boolean { return this.showCostCenter(pair.creditAccountKey); }
  private showCostCenter(accountKey: string): boolean {
    return this.costCentersEnabled() && isProfitAndLossAccountId(this.accounts().find(a => a.okey === accountKey)?.id);
  }

  /** An empty Kostenstelle is saved with the account's default (writeBooking): say so on the empty option. */
  protected costCenterEmptyLabel(accountKey: string): string {
    return accountDefaultCostCenterKey(accountKey, this.accounts(), this.costCenters()) ? this.i18n().form_cost_center_accountDefault() : '';
  }

  protected onPairChange(index: number, field: keyof BookingPair, value: string | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, pairs: vm.pairs.map((p, i) => i === index ? { ...p, [field]: value } : p) }));
  }

  /** Soll ↔ Haben of one row; a booking entered the wrong way round is fixed in one click. */
  protected swapAccounts(index: number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, pairs: vm.pairs.map((p, i) => i === index
      ? { ...p, debitAccountKey: p.creditAccountKey, creditAccountKey: p.debitAccountKey,
          debitCostCenterKey: p.creditCostCenterKey, creditCostCenterKey: p.debitCostCenterKey, vatSide: p.vatSide === 'debit' ? 'credit' : 'debit',
          descriptionSide: p.descriptionSide === 'debit' ? 'credit' : 'debit' }
      : p) }));
  }

  /**
   * The second row turns the booking into a split: its text moves onto the first part and the
   * booking gets the main name 'Sammelbuchung · <Gegenpartei>'.
   */
  protected addPair(): void {
    this.dirty.emit(true);
    this.formData.update((vm) => addBookingPart(vm, this.i18n().split_title()));
  }

  protected removePair(index: number): void {
    this.dirty.emit(true);
    this.expanded.set(new Set());
    this.formData.update((vm) => removeBookingPart(vm, index, this.i18n().split_title()));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
