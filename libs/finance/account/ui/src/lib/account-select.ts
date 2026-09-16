import { Component, computed, inject, input, model, signal, viewChild } from '@angular/core';
import { IonButton, IonButtons, IonIcon, IonInput, IonItem, IonLabel, IonList, IonModal, IonNote, IonSearchbar, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { AccountModel } from '@okr/shared-models';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { coerceBoolean } from '@okr/shared-util-core';

import { ACCOUNT_I18N_KEYS, leafAccounts } from '@okr/finance-account-util';

export interface AccountSelectI18n {
  name: string;
  label: string;
  helper?: string;
}

/**
 * Picks an account of the chart of accounts. The selected value is the account's `okey` — that is
 * what every account link in the data model stores (`VatCodeModel.accountKey`,
 * `AccountingConfigModel.defaultExpenseAccountKey`, ...), never the account number.
 * Only leaf accounts are offered: groups and roots cannot be booked on.
 *
 * The list is shown in a modal with a searchbar (focused on open), so a bookkeeper can simply
 * type the account number — the search matches the number as a prefix and the name as a
 * substring. The searchbar's own strings come from the account domain's own bundle; the calling
 * form only supplies label/helper, so every call site keeps the same `AccountSelectI18n`.
 */
@Component({
  selector: 'okr-account-select',
  standalone: true,
  imports: [
    SvgIconPipe,
    IonItem, IonInput, IonNote, IonIcon, IonModal, IonToolbar,
    IonTitle, IonButtons, IonButton, IonSearchbar, IonList, IonLabel
  ],
  styles: [`
    ion-item.helper { --min-height: 0; }
    ion-label.compact ion-note { font-size: 0.75rem; }
    ion-modal.account {
      --width: 92%;
      --max-width: 520px;
      --height: 80%;
      --border-radius: 8px;
      --border-width: 1px;
      --border-style: solid;
      --border-color: var(--ion-color-medium, #92949c);
      --box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      --background: var(--ion-background-color, #fff);
    }
    /* own flex layout instead of ion-header/ion-content: an inline modal nested in
       another modal does not reliably get Ionic's .ion-page sizing, which left the
       result list invisible */
    .account-picker {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--ion-background-color, #fff);
    }
    .account-results { flex: 1 1 auto; overflow-y: auto; }
  `],
  template: `
    <ion-item lines="none" [button]="!isReadOnly()" [detail]="false" (click)="open()">
      @if (isCompact()) {
        <!-- number on the line, name as a small note below — the journal's own way of showing an account -->
        <ion-label class="compact">
          <div>{{ selectedAccount()?.id || '—' }}</div>
          <ion-note>{{ selectedAccount()?.name || i18n().label }}</ion-note>
        </ion-label>
      } @else {
        <ion-input
          [name]="i18n().name"
          type="text"
          label="{{ i18n().label }}"
          labelPlacement="floating"
          [value]="displayValue()"
          [readonly]="true"
          [clearInput]="false"
        />
      }
      @if (!isReadOnly()) {
        <ion-icon slot="end" src="{{ 'chevron-expand' | svgIcon }}" aria-hidden="true" />
      }
    </ion-item>
    @if (i18n().helper && !isCompact()) {
      <ion-item lines="none" class="helper" [button]="false">
        <ion-note style="white-space: pre-line">{{ i18n().helper }}</ion-note>
      </ion-item>
    }

    <ion-modal class="account" [isOpen]="isOpen()" (ionModalDidDismiss)="close()" (ionModalDidPresent)="focusSearch()">
      <ng-template>
        <div class="account-picker">
          <ion-toolbar color="primary">
            <ion-title>{{ i18n().label }}</ion-title>
            <ion-buttons slot="end">
              <ion-button (click)="close()">
                <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" />
              </ion-button>
            </ion-buttons>
          </ion-toolbar>
          <ion-searchbar #accountSearch
            type="search" inputmode="search" show-clear-button="always"
            [debounce]="0" [placeholder]="searchPlaceholder()"
            (ionInput)="onSearchtermChange($event)"
            (keyup.enter)="selectFirstMatch()"
          />
          <div class="account-results">
            <ion-list>
              @if (allowEmpty()) {
                <ion-item button="true" detail="false" (click)="select('')">
                  <ion-label>—</ion-label>
                </ion-item>
              }
              @for (account of filteredAccounts(); track account.okey) {
                <ion-item button="true" detail="false" (click)="select(account.okey)">
                  <ion-label>{{ account.id }} — {{ account.name }}</ion-label>
                </ion-item>
              } @empty {
                <ion-item lines="none"><ion-label>{{ notFoundLabel() }}</ion-label></ion-item>
              }
            </ion-list>
          </div>
        </div>
      </ng-template>
    </ion-modal>
  `
})
export class AccountSelect {
  private readonly i18nService = inject(I18nService);

  public i18n = input.required<AccountSelectI18n>();
  public selectedKey = model('');
  public accounts = input.required<AccountModel[]>();
  public readOnly = input(true);
  public allowEmpty = input(true);
  /** number + name-note instead of a labelled input; for table-like rows whose header names the column */
  public compact = input(false);

  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected isCompact = computed(() => coerceBoolean(this.compact()));

  protected isOpen = signal(false);
  protected searchTerm = signal('');
  protected accountSearch = viewChild<IonSearchbar>('accountSearch');

  private readonly ownI18n = this.i18nService.translateAll({
    search: ACCOUNT_I18N_KEYS.select_search,
    notFound: ACCOUNT_I18N_KEYS.select_notFound,
  });
  protected readonly searchPlaceholder = this.ownI18n.search;
  protected readonly notFoundLabel = this.ownI18n.notFound;

  /** only leaf accounts can be booked on; sorted by account number so a number search reads naturally */
  protected selectableAccounts = computed(() =>
    [...leafAccounts(this.accounts())].sort((a, b) => a.id.localeCompare(b.id)));

  protected readonly selectedAccount = computed(() => this.selectableAccounts().find((a) => a.okey === this.selectedKey()));
  protected readonly displayValue = computed(() => {
    const _account = this.selectedAccount();
    return _account ? `${_account.id} — ${_account.name}` : '';
  });

  /** the number matches as a prefix (typing 6000 narrows to the 6xxx range), the name as a substring */
  protected readonly filteredAccounts = computed(() => {
    const _term = this.searchTerm().trim().toLowerCase();
    if (_term.length === 0) return this.selectableAccounts();
    return this.selectableAccounts().filter((account) =>
      account.id.toLowerCase().startsWith(_term) || account.name.toLowerCase().includes(_term));
  });

  protected open(): void {
    if (this.isReadOnly()) return;
    this.searchTerm.set('');
    this.isOpen.set(true);
  }

  protected close(): void {
    this.isOpen.set(false);
  }

  protected focusSearch(): void {
    setTimeout(() => this.accountSearch()?.setFocus(), 100);
  }

  protected onSearchtermChange($event: Event): void {
    this.searchTerm.set(($event.target as HTMLInputElement).value ?? '');
  }

  /** Enter on the searchbar takes the single remaining match — the fast path for typing a number */
  protected selectFirstMatch(): void {
    const _matches = this.filteredAccounts();
    if (_matches.length > 0) this.select(_matches[0].okey);
  }

  protected select(accountKey: string): void {
    this.selectedKey.set(accountKey);
    this.close();
  }
}
