import { Component, computed, input, model } from '@angular/core';
import { IonButton, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular';

import { NAME_LENGTH } from '@okr/shared-constants';
import { CategoryListModel, ConditionOp, DerivedValue, Field, PropertyType, VisibilityRule } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Checkbox, CheckboxI18n, ErrorNote, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';

import { errorsUnder, FormI18n, isInputField, propertyTypeLabel } from '@okr/forms-util';

import { VisibilityRuleInput } from './visibility-rule.input';

const PROPERTY_TYPES: PropertyType[] = ['text', 'number', 'boolean'];

type DerivedCase = DerivedValue['cases'][number];

/** One case row as the template needs it. */
interface CaseRow {
  index: number;
  when: VisibilityRule;
  value: string;
  /** the case rule's errors, keyed relative to the rule (`conditions`, `conditions.<k>.fieldId|op|value`) */
  errors: Record<string, string[]>;
}

/** One derived value as the template needs it. */
interface DerivedRow {
  index: number;
  key: string;
  asProperty: boolean;
  type: string;
  otherwise: string;
  /** the mapping's defaults already set this key — the derived value is never stored */
  isSetByMapping: boolean;
  cases: CaseRow[];
}

const NEW_CASE = (): DerivedCase => ({ when: { match: 'all', conditions: [{ fieldId: '', op: '' as ConditionOp }] }, value: '' });

/**
 * Edits the «Berechnete Werte» of a form (spec §6): one block per derived value — the key it is stored under,
 * «Als eigene Angabe speichern» + type (only on mappings with properties), «wenn ‹Bedingung› dann ‹Wert›» rows
 * (the rule editor without its switch, over all input fields) and «sonst ‹Wert›».
 * A sub-form, not a modal: the parent owns the model and its Vest suite and hands the errors back in,
 * keyed relative to the list (`<i>.key`, `<i>.type`, `<i>.cases.<j>.when.conditions…`).
 */
@Component({
  selector: 'okr-derived-values-input',
  standalone: true,
  imports: [
    SvgIconPipe, Checkbox, ErrorNote, StringSelect, TextInput, VisibilityRuleInput,
    IonGrid, IonRow, IonCol, IonButton, IonIcon, IonItem, IonLabel, IonNote,
  ],
  styles: [`
    .derived { border-top: 1px solid var(--ion-color-light-shade); padding-bottom: 8px; }
    .case { margin-left: 16px; border-left: 3px solid var(--ion-color-light-shade); }
    .remove { display: flex; align-items: center; justify-content: flex-end; }
    ion-item.hint { --min-height: 0; }
  `],
  template: `
    @if (!hasCandidates()) {
      <ion-item lines="none" class="hint"><ion-note>{{ i18n().derived_no_fields() }}</ion-note></ion-item>
    }
    @for (row of rows(); track row.index) {
      <div class="derived">
        <ion-grid>
          <ion-row>
            <ion-col size="10" size-md="6">
              <okr-text-input [i18n]="keyI18n()" [value]="row.key" (valueChange)="onKeyChange(row.index, $event)"
                [maxLength]="nameLength" [showHelper]="true" [readOnly]="isReadOnly()" />
              @if (row.isSetByMapping) {
                <ion-item lines="none" class="hint"><ion-note color="warning">{{ i18n().derived_set_by_mapping() }}</ion-note></ion-item>
              }
              <okr-error-note [errors]="errorsAt(row.index, 'key')" />
            </ion-col>
            <ion-col size="2" size-md="6" class="remove">
              @if (!isReadOnly()) {
                <ion-button fill="clear" color="danger" [attr.aria-label]="i18n().derived_remove()" (click)="removeDerived(row.index)">
                  <ion-icon src="{{ 'trash' | svgIcon }}" slot="icon-only" />
                </ion-button>
              }
            </ion-col>
          </ion-row>
          @if (showProperty()) {
            <ion-row>
              <ion-col size="12" size-md="6">
                <okr-checkbox [i18n]="asPropertyI18n()" [checked]="row.asProperty" (checkedChange)="onAsPropertyChange(row.index, $event)"
                  [toggle]="true" justify="space-between" labelPlacement="start" [readOnly]="isReadOnly()" />
              </ion-col>
              @if (row.asProperty) {
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="typeI18n()" [stringList]="propertyTypes" [labels]="propertyTypeLabels()"
                    [selectedString]="row.type" (selectedStringChange)="onTypeChange(row.index, $event)"
                    [showHelper]="false" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errorsAt(row.index, 'type')" />
                </ion-col>
              }
            </ion-row>
          }
        </ion-grid>

        @for (c of row.cases; track c.index) {
          <div class="case">
            <ion-item lines="none">
              <ion-label>{{ i18n().derived_when() }}</ion-label>
              @if (!isReadOnly()) {
                <ion-button slot="end" fill="clear" color="danger" [attr.aria-label]="i18n().derived_remove_case()"
                  (click)="removeCase(row.index, c.index)">
                  <ion-icon src="{{ 'trash' | svgIcon }}" slot="icon-only" />
                </ion-button>
              }
            </ion-item>
            <okr-visibility-rule-input [rule]="c.when" (ruleChange)="onCaseRuleChange(row.index, c.index, $event)"
              [candidates]="candidates()" [categories]="categories()" [i18n]="i18n()"
              [showToggle]="false" [errors]="c.errors" [readOnly]="isReadOnly()" />
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="thenI18n()" [value]="c.value" (valueChange)="onCaseValueChange(row.index, c.index, $event)"
                    [maxLength]="nameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="errorsAt(row.index, 'cases.' + c.index + '.value')" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </div>
        }

        <ion-grid>
          <ion-row>
            <ion-col size="12">
              @if (!isReadOnly()) {
                <ion-button fill="clear" size="small" [disabled]="!hasCandidates()" (click)="addCase(row.index)">{{ i18n().derived_add_case() }}</ion-button>
              }
              <okr-error-note [errors]="errorsAt(row.index, 'cases')" />
            </ion-col>
          </ion-row>
          <ion-row>
            <ion-col size="12" size-md="6">
              <okr-text-input [i18n]="otherwiseI18n()" [value]="row.otherwise" (valueChange)="onOtherwiseChange(row.index, $event)"
                [maxLength]="nameLength" [readOnly]="isReadOnly()" />
              <okr-error-note [errors]="errorsAt(row.index, 'otherwise')" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </div>
    }
    @if (!isReadOnly()) {
      <ion-button fill="clear" size="small" (click)="addDerived()">{{ i18n().derived_add() }}</ion-button>
    }
  `,
})
export class DerivedValuesInput {
  /** kept in step with the cap the Vest suite enforces on the key, the «dann» and the «sonst» values */
  protected readonly nameLength = NAME_LENGTH;
  protected readonly propertyTypes = PROPERTY_TYPES;

  // inputs
  public readonly derived = model<DerivedValue[]>([]);
  /** all fields of the form; the input fields among them may be referenced by a case */
  public readonly fields = input<Field[]>([]);
  public readonly i18n = input.required<FormI18n>();
  public readonly readOnly = input(false);
  /** Vest errors keyed relative to the list: `<i>.key`, `<i>.type`, `<i>.cases.<j>.when.conditions…` */
  public readonly errors = input<Record<string, string[]>>({});
  /** true when the form's mapping stores typed properties — only then «Als eigene Angabe speichern» is offered */
  public readonly showProperty = input(false);
  /** derived keys the mapping's defaults also set (warned, not blocked) */
  public readonly keysSetByMapping = input<ReadonlySet<string>>(new Set());
  /** the category lists, for the items of a category controller */
  public readonly categories = input<CategoryListModel[]>([]);

  // derived
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  /** every input field, in form order — a derived value is computed after the whole form is answered */
  protected readonly candidates = computed(() =>
    [...(this.fields() ?? [])].filter(isInputField).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  protected readonly hasCandidates = computed(() => this.candidates().length > 0);
  protected readonly propertyTypeLabels = computed(() => PROPERTY_TYPES.map(t => propertyTypeLabel(this.i18n(), t)));

  protected readonly rows = computed<DerivedRow[]>(() => {
    const errors = this.errors();
    const setByMapping = this.keysSetByMapping();
    return (this.derived() ?? []).map((d, index) => ({
      index,
      key: d.key ?? '',
      asProperty: d.asProperty === true,
      type: d.type ?? '',
      otherwise: d.otherwise ?? '',
      isSetByMapping: !!d.key && setByMapping.has(d.key),
      cases: (d.cases ?? []).map((c, j) => ({
        index: j,
        when: c.when,
        value: c.value ?? '',
        errors: errorsUnder(errors, `${index}.cases.${j}.when.`),
      })),
    }));
  });

  // i18n for the shared/ui primitives
  protected readonly keyI18n = computed<TextInputI18n>(() => ({
    name: 'derivedKey', label: this.i18n().derived_key(), placeholder: 'applicationAs', helper: this.i18n().derived_key_helper(),
  }));
  protected readonly asPropertyI18n = computed<CheckboxI18n>(() => ({
    name: 'derivedAsProperty', label: this.i18n().field_as_property(), helper: '',
  }));
  protected readonly typeI18n = computed<StringSelectI18n>(() => ({ name: 'derivedType', label: this.i18n().derived_type() }));
  protected readonly thenI18n = computed<TextInputI18n>(() => ({
    name: 'derivedThen', label: this.i18n().derived_then(), placeholder: '', helper: '',
  }));
  protected readonly otherwiseI18n = computed<TextInputI18n>(() => ({
    name: 'derivedOtherwise', label: this.i18n().derived_otherwise(), placeholder: '', helper: '',
  }));

  protected errorsAt(index: number, name: string): string[] {
    return this.errors()[`${index}.${name}`] ?? [];
  }

  // changes — every one writes a new list through the model
  protected addDerived(): void {
    this.derived.set([...(this.derived() ?? []), { key: '', cases: [NEW_CASE()] }]);
  }

  protected removeDerived(index: number): void {
    this.derived.set((this.derived() ?? []).filter((_, i) => i !== index));
  }

  protected onKeyChange(index: number, key: string): void {
    const current = this.derived()?.[index];
    if (!current || (current.key ?? '') === key) return;
    this.setDerived(index, { ...current, key });
  }

  /** Switching on starts with «Text»; switching off removes both keys, so no stale type stays behind. */
  protected onAsPropertyChange(index: number, on: boolean): void {
    const current = this.derived()?.[index];
    if (!current || (current.asProperty === true) === on) return;
    const { asProperty: _a, type: _t, ...rest } = current;
    this.setDerived(index, on ? { ...rest, asProperty: true, type: current.type ?? 'text' } : rest);
  }

  protected onTypeChange(index: number, type: string): void {
    const current = this.derived()?.[index];
    if (!current || current.type === type || !PROPERTY_TYPES.includes(type as PropertyType)) return;
    this.setDerived(index, { ...current, type: type as PropertyType });
  }

  /** A blank «sonst» removes the key: no match then stores nothing instead of an empty text. */
  protected onOtherwiseChange(index: number, value: string): void {
    const current = this.derived()?.[index];
    if (!current || (current.otherwise ?? '') === value) return;
    const { otherwise: _o, ...rest } = current;
    this.setDerived(index, value === '' ? rest : { ...rest, otherwise: value });
  }

  protected addCase(index: number): void {
    const current = this.derived()?.[index];
    if (!current) return;
    this.setDerived(index, { ...current, cases: [...(current.cases ?? []), NEW_CASE()] });
  }

  protected removeCase(index: number, caseIndex: number): void {
    const current = this.derived()?.[index];
    if (!current) return;
    this.setDerived(index, { ...current, cases: (current.cases ?? []).filter((_, j) => j !== caseIndex) });
  }

  /** The rule editor without its switch never emits `undefined`; keep the old rule if it ever did. */
  protected onCaseRuleChange(index: number, caseIndex: number, when: VisibilityRule | undefined): void {
    if (!when) return;
    this.updateCase(index, caseIndex, c => ({ ...c, when }));
  }

  protected onCaseValueChange(index: number, caseIndex: number, value: string): void {
    this.updateCase(index, caseIndex, c => ((c.value ?? '') === value ? c : { ...c, value }));
  }

  private updateCase(index: number, caseIndex: number, change: (c: DerivedCase) => DerivedCase): void {
    const current = this.derived()?.[index];
    const old = current?.cases?.[caseIndex];
    if (!current || !old) return;
    const next = change(old);
    if (next === old) return;
    this.setDerived(index, { ...current, cases: current.cases.map((c, j) => (j === caseIndex ? next : c)) });
  }

  private setDerived(index: number, next: DerivedValue): void {
    this.derived.set((this.derived() ?? []).map((d, i) => (i === index ? next : d)));
  }
}
