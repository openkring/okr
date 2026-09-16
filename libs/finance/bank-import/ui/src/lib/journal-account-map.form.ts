import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular/standalone';

import { AccountModel } from '@okr/shared-models';
import { ErrorNote } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';

import { AccountSelect, AccountSelectI18n } from '@okr/finance-account-ui';
import { BANK_IMPORT_I18N_KEYS, BankImportI18n, JournalAccountMap, JournalAccountMapping, journalAccountMapValidations } from '@okr/finance-bank-import-util';

/**
 * The mapping table of a bexio journal import (spec 1.60 §12.2): one row per bexio account used by
 * the file — number and bexio name on the left, the tenant account it lands on as a picker on the
 * right. Rows matched by number arrive pre-filled; the rest must be chosen before the form is valid.
 */
@Component({
  selector: 'okr-journal-account-map-form',
  standalone: true,
  imports: [AccountSelect, ErrorNote, IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonItem, IonLabel, IonNote],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    ion-note.matched { color: var(--ion-color-success); }
    ion-note.unresolved { color: var(--ion-color-danger); }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-item lines="full"><ion-label class="ion-text-wrap">{{ i18n().journal_intro() }}</ion-label></ion-item>
            <ion-grid>
              @for (entry of entries(); track entry.no; let i = $index) {
                <ion-row class="ion-align-items-center">
                  <ion-col size="12" size-md="5">
                    <ion-label class="ion-text-wrap">
                      <strong>{{ entry.no }}</strong> · {{ entry.name }}<br />
                      <ion-note [class]="entry.accountKey ? 'matched' : 'unresolved'">{{ matchLabel(entry) }}</ion-note>
                    </ion-label>
                  </ion-col>
                  <ion-col size="12" size-md="7">
                    <okr-account-select [i18n]="accountI18n()" [accounts]="accounts()" [allowEmpty]="false"
                      [selectedKey]="entry.accountKey" (selectedKeyChange)="onAccountChange(i, $event)" [readOnly]="isReadOnly()" />
                  </ion-col>
                </ion-row>
              }
            </ion-grid>
            <okr-error-note [errors]="entriesErrors()" />
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class JournalAccountMapForm {
  public readonly i18n = input.required<BankImportI18n>();
  public formData = model.required<JournalAccountMap>();
  public readonly accounts = input<AccountModel[]>([]);
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly mapForm = form(this.formData, (path) => validateVestTree(path, journalAccountMapValidations as any));

  constructor() {
    effect(() => this.valid.emit(this.mapForm().valid()));
  }

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly entries = computed(() => this.formData()?.entries ?? []);
  /** okr-error-note resolves i18n keys itself (a plain string would be looked up under `validation.`). */
  protected readonly entriesErrors = computed(() => this.mapForm().valid() ? [] : [BANK_IMPORT_I18N_KEYS.journal_unresolved]);
  protected readonly accountI18n = computed(() => ({ name: 'accountKey', label: this.i18n().account_label(), helper: '' } as AccountSelectI18n));

  protected matchLabel(entry: JournalAccountMapping): string {
    if (entry.accountKey && entry.match === 'matched') return `${this.i18n().journal_match_matched()}: ${entry.accountName}`;
    if (entry.accountKey) return this.i18n().journal_match_matched();
    switch (entry.match) {
      case 'group': return this.i18n().journal_match_group();
      case 'ambiguous': return this.i18n().journal_match_ambiguous();
      default: return this.i18n().journal_match_missing();
    }
  }

  protected onAccountChange(index: number, accountKey: string): void {
    this.dirty.emit(true);
    const accountName = this.accounts().find(a => a.okey === accountKey)?.name ?? '';
    this.formData.update((vm) => ({ ...vm, entries: vm.entries.map((e, i) => i === index ? { ...e, accountKey, accountName } : e) }));
  }
}
