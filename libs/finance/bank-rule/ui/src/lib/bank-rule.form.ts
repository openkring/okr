import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonNote, IonRow } from '@ionic/angular/standalone';

import { DEFAULT_NOTES } from '@okr/shared-constants';
import { AccountModel, BankRuleCondition, BankRuleModel, RoleName, UserModel, VatCodeModel } from '@okr/shared-models';
import { Checkbox, CheckboxI18n, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean, hasRole } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';

import { AccountSelect, AccountSelectI18n } from '@okr/finance-account-ui';
import { BankRuleI18n, bankRuleValidations, normalizeRuleForSave } from '@okr/finance-bank-rule-util';

const CONDITIONS: BankRuleCondition[] = ['contains', 'startsWith', 'endsWith', 'regex'];

@Component({
  selector: 'okr-bank-rule-form',
  standalone: true,
  imports: [TextInput, NumberInput, NotesInput, Checkbox, StringSelect, AccountSelect, IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonItem, IonNote],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="conditionI18n()" [stringList]="conditions" [labels]="conditionLabels()"
                    [selectedString]="condition()" (selectedStringChange)="onFieldChange('condition', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="termI18n()" [value]="term()" (valueChange)="onFieldChange('term', $event)"
                    [autofocus]="true" [maxLength]="200" [readOnly]="isReadOnly()" />
                  <ion-item lines="none">
                    <ion-note>{{ i18n().term_stored_as() }} {{ storedTerm() }}</ion-note>
                  </ion-item>
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="titleI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)"
                    [maxLength]="100" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-account-select [i18n]="accountI18n()" [accounts]="accounts()" [allowEmpty]="false"
                    [selectedKey]="accountKey()" (selectedKeyChange)="onFieldChange('accountKey', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="vatCodeI18n()" [stringList]="vatCodeKeys()" [labels]="vatCodeLabels()"
                    [selectedString]="vatCodeKey()" (selectedStringChange)="onFieldChange('vatCodeKey', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="priorityI18n()" [value]="priority()" (valueChange)="onFieldChange('priority', $event)"
                    [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-checkbox [i18n]="activeI18n()" [checked]="active()" (checkedChange)="onFieldChange('active', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
        @if (hasRole('treasurer') || hasRole('admin')) {
          <okr-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
        }
      </form>
    }
  `,
})
export class BankRuleForm {
  public readonly i18n = input.required<BankRuleI18n>();
  public formData = model.required<BankRuleModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly accounts = input<AccountModel[]>([]);
  public readonly vatCodes = input<VatCodeModel[]>([]);
  public readonly readOnly = input(true);
  public readonly showForm = input(true);

  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly conditions = CONDITIONS;

  protected readonly bankRuleForm = form(this.formData, (path) => validateVestTree(path, bankRuleValidations as any));

  constructor() {
    effect(() => this.valid.emit(this.bankRuleForm().valid()));
  }

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly condition = computed(() => this.formData()?.condition ?? 'contains');
  protected readonly term = computed(() => this.formData()?.term ?? '');
  protected readonly title = computed(() => this.formData()?.title ?? '');
  protected readonly accountKey = computed(() => this.formData()?.accountKey ?? '');
  protected readonly vatCodeKey = computed(() => this.formData()?.vatCodeKey ?? '');
  protected readonly priority = computed(() => this.formData()?.priority ?? 0);
  protected readonly active = computed(() => this.formData()?.active ?? true);
  protected readonly notes = computed(() => this.formData()?.notes ?? DEFAULT_NOTES);

  protected readonly storedTerm = computed(() => normalizeRuleForSave(this.formData()).term);

  protected readonly vatCodeKeys = computed(() => ['', ...this.vatCodes().map((v) => v.okey)]);
  protected readonly vatCodeLabels = computed(() => ['—', ...this.vatCodes().map((v) => `${v.code} — ${v.name}`)]);

  protected readonly conditionLabels = computed(() => [
    this.i18n().condition_contains(), this.i18n().condition_startsWith(), this.i18n().condition_endsWith(), this.i18n().condition_regex(),
  ]);
  protected readonly conditionI18n = computed(() => ({ name: 'condition', label: this.i18n().condition_label(), helper: this.i18n().condition_helper() } as StringSelectI18n));
  protected readonly termI18n = computed(() => ({ name: 'term', label: this.i18n().term_label(), placeholder: this.i18n().term_placeholder(), helper: this.i18n().term_helper() } as TextInputI18n));
  protected readonly titleI18n = computed(() => ({ name: 'title', label: this.i18n().title_label(), placeholder: this.i18n().title_placeholder(), helper: this.i18n().title_helper() } as TextInputI18n));
  protected readonly accountI18n = computed(() => ({ name: 'accountKey', label: this.i18n().account_label(), helper: this.i18n().account_helper() } as AccountSelectI18n));
  protected readonly vatCodeI18n = computed(() => ({ name: 'vatCodeKey', label: this.i18n().vat_label(), helper: this.i18n().vat_helper() } as StringSelectI18n));
  protected readonly priorityI18n = computed(() => ({ name: 'priority', label: this.i18n().priority_label(), placeholder: '', helper: this.i18n().priority_helper() } as NumberInputI18n));
  protected readonly activeI18n = computed(() => ({ name: 'active', label: this.i18n().active_label(), helper: this.i18n().active_helper() } as CheckboxI18n));
  protected readonly notesI18n = computed(() => ({ name: 'notes', label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder() } as NotesInputI18n));

  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    const value = fieldName === 'priority' ? Number(fieldValue) || 0 : fieldValue;
    this.formData.update((vm) => ({ ...vm, [fieldName]: value }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
