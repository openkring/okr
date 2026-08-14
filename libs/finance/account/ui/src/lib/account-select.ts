import { Component, computed, input, model } from '@angular/core';
import { IonItem, IonNote, IonSelect, IonSelectOption } from '@ionic/angular/standalone';

import { AccountModel } from '@okr/shared-models';
import { coerceBoolean } from '@okr/shared-util-core';

import { leafAccounts } from '@okr/finance-account-util';

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
 */
@Component({
  selector: 'okr-account-select',
  standalone: true,
  imports: [IonSelect, IonSelectOption, IonNote, IonItem],
  template: `
    <ion-item lines="none">
      <ion-select [name]="i18n().name"
        [label]="i18n().label"
        [disabled]="isReadOnly()"
        label-placement="floating"
        interface="popover"
        [value]="selectedKey()"
        (ionChange)="selectedKey.set($event.detail.value)">
        @if(allowEmpty()) {
          <ion-select-option [value]="''">—</ion-select-option>
        }
        @for(account of selectableAccounts(); track account.okey) {
          <ion-select-option [value]="account.okey">{{ account.id }} — {{ account.name }}</ion-select-option>
        }
      </ion-select>
    </ion-item>
    @if(i18n().helper) {
      <ion-item lines="none">
        <ion-note style="white-space: pre-line">{{ i18n().helper }}</ion-note>
      </ion-item>
    }
  `
})
export class AccountSelect {
  public i18n = input.required<AccountSelectI18n>();
  public selectedKey = model('');
  public accounts = input.required<AccountModel[]>();
  public readOnly = input(true);
  public allowEmpty = input(true);

  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected selectableAccounts = computed(() => leafAccounts(this.accounts()));
}
