import { Component, computed, effect, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { CategoryListModel, AccountModel, RoleName, UserModel } from '@okr/shared-models';
import { CategorySelect, ErrorNote, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { NAME_LENGTH } from '@okr/shared-constants';
import { coerceBoolean, hasRole } from '@okr/shared-util-core';

import { ACCOUNT_KIND_GROUP, AccountI18n, accountValidations, getAccountKind, parentCandidates, usedAccountIds } from '@okr/finance-account-util';

import { AccountSelect, AccountSelectI18n } from './account-select';

export type { AccountI18n };

/** The only two types a user may choose. `root` (a whole chart of accounts) is not edited here: it
 *  is created by "Kontoplan importieren"/addRoot and shown read-only. */
const SELECTABLE_TYPES = ['leaf', 'group'];

@Component({
  selector: 'okr-account-form',
  standalone: true,
  imports: [
    CategorySelect, TextInput, NotesInput, ErrorNote, AccountSelect,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (showForm()) {
      <form novalidate>

        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <!-- only on an existing account: while creating, the okey is assigned by the service -->
              @if(hasRole('admin') && okey().length > 0) {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="okeyI18n()" [value]="okey()" [readOnly]="true" [copyable]="true" />
                  </ion-col>
                </ion-row>
              }
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="idI18n()" [value]="id()" (valueChange)="onFieldChange('id', $event)" [autofocus]="true" [copyable]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="idErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [maxLength]="nameMaxLength" [copyable]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="nameErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-cat-select [category]="selectableTypes()" [selectedItemName]="type()" (selectedItemNameChange)="onFieldChange('type', $event)" [readOnly]="isReadOnly() || isRoot()" [withAll]="false" />
                </ion-col>
                <!-- a chart of accounts has no parent; every other account hangs in a group or under a chart -->
                @if(!isRoot()) {
                  <ion-col size="12" size-md="6">
                    <okr-account-select [i18n]="parentI18n()" [accounts]="parentAccounts()" [leavesOnly]="false"
                      [allowEmpty]="false" [selectedKey]="parentKey()" (selectedKeyChange)="onFieldChange('parentKey', $event)"
                      [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="parentErrors()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="kindI18n()" [value]="kind()" [readOnly]="true" />
                  </ion-col>
                }
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        @if(hasRole('admin')) {
          <okr-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
        }
      </form>
    }
  `
})
export class AccountForm {
  public readonly formData = model.required<AccountModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public showForm = input(true);
  public readonly types = input.required<CategoryListModel>();
  /** every account of the chart — the source for the Hauptkonto picker and the duplicate-number check */
  public readonly accounts = input<AccountModel[]>([]);
  public readonly tenantId = input.required<string>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<AccountI18n>();
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  // Same cap as accountValidations, so the input counter and the Vest suite never disagree.
  protected readonly nameMaxLength = NAME_LENGTH;

  protected okeyI18n = computed(() => ({
    name: 'okey', label: this.i18n().okey(), placeholder: this.i18n().okey_placeholder(), helper: this.i18n().okey_helper()
  } as TextInputI18n));

  protected idI18n = computed(() => ({
    name: 'id', label: this.i18n().id(), placeholder: this.i18n().id_placeholder(), helper: this.i18n().id_helper()
  } as TextInputI18n));

  protected nameI18n = computed(() => ({
    name: 'name', label: this.i18n().name(), placeholder: this.i18n().name_placeholder(), helper: this.i18n().name_helper()
  } as TextInputI18n));

  protected kindI18n = computed(() => ({
    name: 'kind', label: this.i18n().kind(), helper: this.i18n().kind_helper()
  } as TextInputI18n));

  protected parentI18n = computed(() => ({
    name: 'parentKey', label: this.i18n().parentKey(), helper: this.i18n().parentKey_helper()
  } as AccountSelectI18n));

  protected notesI18n = computed(() => ({
    name: 'notes', label: this.i18n().notes(), placeholder: this.i18n().notes_placeholder()
  } as NotesInputI18n));

  public dirty = output<boolean>();
  public valid = output<boolean>();

  private readonly validationResult = computed(() =>
    accountValidations(this.formData(), this.tenantId(), '', usedAccountIds(this.accounts(), this.formData())));
  protected idErrors = computed(() => this.validationResult().getErrors('id'));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected parentErrors = computed(() => this.validationResult().getErrors('parentKey'));

  protected id = linkedSignal(() => this.formData().id ?? '');
  protected name = linkedSignal(() => this.formData().name ?? '');
  protected type = linkedSignal(() => this.formData().type ?? '');
  protected parentKey = linkedSignal(() => this.formData().parentKey ?? '');
  protected notes = linkedSignal(() => this.formData().notes ?? '');
  protected okey = computed(() => this.formData().okey ?? '');
  protected isRoot = computed(() => this.formData().type === 'root');

  /** Only Konto (leaf) and Kontogruppe (group) are offered — the other account_type items
   *  (bank, twint, other, …) describe a payment account, not a position in the chart of accounts,
   *  and `root` is created by the import/addRoot path alone. A stored type outside that set is
   *  kept in the list all the same: dropping it would make the select show the first item while
   *  the account still carries the old one. */
  protected selectableTypes = computed(() => ({
    ...this.types(),
    items: this.types().items.filter(item =>
      SELECTABLE_TYPES.includes(item.name) || item.name === this.formData().type)
  } as CategoryListModel));

  /**
   * The Kontoart (Aktiv/Passiv/Ertrag/Aufwand/Komplett) — not typed, but read off the Hauptkonto,
   * which is what decides where in the chart the account sits. It is stored in `label` by the CSV
   * import and derived again on export, so the form only shows it.
   */
  protected kind = computed(() => {
    // a Kontogruppe is its own kind in the CSV, exactly as chartOfAccountsToRows writes it
    if (this.formData().type === 'group') return ACCOUNT_KIND_GROUP;
    const _parent = this.accounts().find(a => a.okey === this.formData().parentKey);
    return (_parent ? getAccountKind(_parent) : '') || getAccountKind(this.formData());
  });

  /** the charts and groups this account may hang in — itself and its own subtree excluded */
  protected parentAccounts = computed(() => parentCandidates(this.accounts(), this.formData()));

  constructor() {
    effect(() => this.valid.emit(this.validationResult().isValid()));
  }

  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
