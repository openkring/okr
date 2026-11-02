import { Component, computed, input, model } from '@angular/core';
import { IonButton, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonNote, IonRow, IonSegment, IonSegmentButton } from '@ionic/angular';

import { NAME_LENGTH } from '@okr/shared-constants';
import { CategoryListModel, ConditionOp, Field, FieldCondition, FieldOption, VisibilityRule } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import {
  Checkbox, CheckboxGroup, CheckboxGroupI18n, CheckboxI18n, DateInput, DateInputI18n, ErrorNote,
  NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n,
} from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';

import {
  conditionChoices, conditionOpLabels, conditionOpsFor, ConditionValueKind, conditionValueKind, FormI18n,
} from '@okr/forms-util';

/** One condition row as the template needs it. */
interface ConditionRow {
  index: number;
  cond: FieldCondition;
  /** the controlling field, undefined when the condition points at no candidate */
  controller: Field | undefined;
  /** true when a field is chosen but it is not (or no longer) one of the earlier questions */
  isUnknown: boolean;
  ops: ConditionOp[];
  opLabels: string[];
  kind: ConditionValueKind;
  choices: FieldOption[];
}

const EMPTY_CONDITION = (): FieldCondition => ({ fieldId: '', op: '' as ConditionOp });

/**
 * Edits one visibility rule: «Nur anzeigen, wenn …» (on a divider «Diesen Abschnitt nur anzeigen, wenn …»),
 * all/any, and one row per condition — controlling field → operator → value input by type.
 * A sub-form, not a modal: the parent owns the model and its Vest suite and hands the rule's
 * errors back in, keyed relative to the rule (`conditions`, `conditions.<i>.fieldId|op|value`).
 * Generic: `candidates` are whichever fields the rule may reference (earlier fields for visibility,
 * all input fields for derived values); `showToggle=false` drops the on/off switch.
 */
@Component({
  selector: 'okr-visibility-rule-input',
  standalone: true,
  imports: [
    SvgIconPipe, Checkbox, CheckboxGroup, DateInput, ErrorNote, NumberInput, StringSelect, TextInput,
    IonGrid, IonRow, IonCol, IonSegment, IonSegmentButton, IonLabel, IonButton, IonIcon, IonItem, IonNote,
  ],
  styles: [`
    .condition { border-top: 1px solid var(--ion-color-light-shade); }
    .remove { display: flex; align-items: center; justify-content: flex-end; }
    ion-item.hint { --min-height: 0; }
  `],
  template: `
    <ion-grid>
      @if (showToggle()) {
        <ion-row>
          <ion-col size="12">
            <okr-checkbox [i18n]="toggleI18n()" [checked]="isOn()" (checkedChange)="onToggle($event)"
              [toggle]="true" justify="space-between" labelPlacement="start" [showHelper]="isBlock()"
              [readOnly]="isReadOnly() || (!isOn() && !hasCandidates())" />
            @if (!hasCandidates() && !isOn()) {
              <ion-item lines="none" class="hint"><ion-note>{{ i18n().rule_no_candidates() }}</ion-note></ion-item>
            }
          </ion-col>
        </ion-row>
      }
      @if (isOn() || !showToggle()) {
        <ion-row>
          <ion-col size="12">
            <ion-segment [value]="match()" [disabled]="isReadOnly()" (ionChange)="onMatchChange($any($event).detail.value)">
              <ion-segment-button value="all"><ion-label>{{ i18n().rule_match_all() }}</ion-label></ion-segment-button>
              <ion-segment-button value="any"><ion-label>{{ i18n().rule_match_any() }}</ion-label></ion-segment-button>
            </ion-segment>
          </ion-col>
        </ion-row>
        @for (row of rows(); track row.index) {
          <ion-row class="condition">
            <ion-col size="12" size-md="4">
              <okr-string-select [i18n]="fieldI18n()" [stringList]="candidateIds()" [labels]="candidateLabels()"
                [selectedString]="row.cond.fieldId" (selectedStringChange)="onFieldIdChange(row.index, $event)"
                [showHelper]="false" [readOnly]="isReadOnly()" />
              @if (row.isUnknown) {
                <ion-item lines="none" class="hint"><ion-note color="warning">{{ i18n().rule_unknown_field() }}</ion-note></ion-item>
              }
              <okr-error-note [errors]="errorsAt(row.index, 'fieldId')" />
            </ion-col>
            <ion-col size="12" size-md="3">
              <okr-string-select [i18n]="opI18n()" [stringList]="row.ops" [labels]="row.opLabels"
                [selectedString]="row.cond.op" (selectedStringChange)="onOpChange(row.index, $event)"
                [showHelper]="false" [readOnly]="isReadOnly() || !row.controller" />
              <okr-error-note [errors]="errorsAt(row.index, 'op')" />
            </ion-col>
            <ion-col size="10" size-md="4">
              @switch (row.kind) {
                @case ('option') {
                  <okr-string-select [i18n]="valueSelectI18n()" [stringList]="choiceValues(row)" [labels]="choiceLabels(row)"
                    [selectedString]="singleValue(row)" (selectedStringChange)="onValueChange(row.index, $event)"
                    [showHelper]="false" [readOnly]="isReadOnly()" />
                }
                @case ('options') {
                  <okr-checkbox-group [i18n]="valuesI18n()" [stringList]="choiceValues(row)" [labels]="choiceLabels(row)"
                    [selectedStrings]="listValue(row)" (selectedStringsChange)="onValueChange(row.index, $event)"
                    [showHelper]="false" [readOnly]="isReadOnly()" />
                }
                @case ('number') {
                  <okr-number-input [i18n]="valueNumberI18n()" [value]="$any(numberValue(row))"
                    (valueChange)="onNumberChange(row.index, $event)" [readOnly]="isReadOnly()" />
                }
                @case ('age') {
                  <okr-number-input [i18n]="yearsI18n()" [value]="$any(numberValue(row))" [integer]="true" [min]="0" [max]="120"
                    (valueChange)="onNumberChange(row.index, $event)" [readOnly]="isReadOnly()" />
                }
                @case ('numberRange') {
                  <okr-number-input [i18n]="fromNumberI18n()" [value]="$any(rangeNumber(row, 0))"
                    (valueChange)="onRangeChange(row.index, 0, $event)" [readOnly]="isReadOnly()" />
                  <okr-number-input [i18n]="toNumberI18n()" [value]="$any(rangeNumber(row, 1))"
                    (valueChange)="onRangeChange(row.index, 1, $event)" [readOnly]="isReadOnly()" />
                }
                @case ('date') {
                  <okr-date-input [i18n]="valueDateI18n()" [storeDate]="singleValue(row)"
                    (storeDateChange)="onValueChange(row.index, $event)" [showHelper]="false" [readOnly]="isReadOnly()" />
                }
                @case ('dateRange') {
                  <okr-date-input [i18n]="fromDateI18n()" [storeDate]="rangeText(row, 0)"
                    (storeDateChange)="onRangeChange(row.index, 0, $event)" [showHelper]="false" [readOnly]="isReadOnly()" />
                  <okr-date-input [i18n]="toDateI18n()" [storeDate]="rangeText(row, 1)"
                    (storeDateChange)="onRangeChange(row.index, 1, $event)" [showHelper]="false" [readOnly]="isReadOnly()" />
                }
                @case ('text') {
                  <okr-text-input [i18n]="valueTextI18n()" [value]="singleValue(row)" [maxLength]="nameLength"
                    (valueChange)="onValueChange(row.index, $event)" [readOnly]="isReadOnly()" />
                }
              }
              <okr-error-note [errors]="errorsAt(row.index, 'value')" />
            </ion-col>
            <ion-col size="2" size-md="1" class="remove">
              @if (!isReadOnly()) {
                <ion-button fill="clear" color="danger" [attr.aria-label]="i18n().rule_remove()" (click)="removeCondition(row.index)">
                  <ion-icon src="{{ 'trash' | svgIcon }}" slot="icon-only" />
                </ion-button>
              }
            </ion-col>
          </ion-row>
        }
        <ion-row>
          <ion-col size="12">
            @if (!isReadOnly()) {
              <ion-button fill="clear" size="small" [disabled]="!hasCandidates()" (click)="addCondition()">{{ i18n().rule_add() }}</ion-button>
            }
            <okr-error-note [errors]="errorsAt(-1, 'conditions')" />
          </ion-col>
        </ion-row>
      }
    </ion-grid>
  `,
})
export class VisibilityRuleInput {
  /** kept in step with the cap the text value input allows */
  protected readonly nameLength = NAME_LENGTH;

  // inputs
  public readonly rule = model<VisibilityRule | undefined>();
  /** the fields a condition may reference, in form order */
  public readonly candidates = input<Field[]>([]);
  public readonly i18n = input.required<FormI18n>();
  public readonly readOnly = input(false);
  /** the rule's Vest errors, keyed relative to the rule: `conditions`, `conditions.<i>.fieldId|op|value` */
  public readonly errors = input<Record<string, string[]>>({});
  /** true on a divider: the rule governs the whole section up to the next divider */
  public readonly isBlock = input(false);
  /** false: no on/off switch — the rows are always shown (derived-value cases) */
  public readonly showToggle = input(true);
  /** the category lists, for the items of a category controller */
  public readonly categories = input<CategoryListModel[]>([]);

  // derived
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly isOn = computed(() => !!this.rule());
  protected readonly match = computed(() => this.rule()?.match ?? 'all');
  protected readonly hasCandidates = computed(() => this.candidates().length > 0);
  protected readonly candidateIds = computed(() => this.candidates().map(f => f.id));
  protected readonly candidateLabels = computed(() => this.candidates().map(f => f.label || f.key));
  private readonly opLabelMap = computed(() => conditionOpLabels(this.i18n()));

  protected readonly rows = computed<ConditionRow[]>(() => {
    const candidates = this.candidates();
    const labels = this.opLabelMap();
    return (this.rule()?.conditions ?? []).map((cond, index) => {
      const controller = candidates.find(f => f.id === cond.fieldId);
      const ops = controller ? conditionOpsFor(controller) : [];
      return {
        index, cond, controller,
        isUnknown: !!cond.fieldId && !controller,
        ops,
        opLabels: ops.map(op => labels[op] ?? op),
        kind: conditionValueKind(controller, cond.op),
        choices: conditionChoices(controller, this.categories(), this.i18n().field_other_option()),
      };
    });
  });

  // i18n for the shared/ui primitives
  protected readonly toggleI18n = computed<CheckboxI18n>(() => ({
    name: 'visibleIf',
    label: this.isBlock() ? this.i18n().rule_toggle_block() : this.i18n().rule_toggle(),
    helper: this.isBlock() ? this.i18n().rule_block_hint() : '',
  }));
  protected readonly fieldI18n = computed<StringSelectI18n>(() => ({ name: 'fieldId', label: this.i18n().rule_field() }));
  protected readonly opI18n = computed<StringSelectI18n>(() => ({ name: 'op', label: this.i18n().rule_op() }));
  protected readonly valueSelectI18n = computed<StringSelectI18n>(() => ({ name: 'value', label: this.i18n().rule_value() }));
  protected readonly valuesI18n = computed<CheckboxGroupI18n>(() => ({ name: 'value', label: this.i18n().rule_values() }));
  protected readonly valueNumberI18n = computed<NumberInputI18n>(() => ({ name: 'value', label: this.i18n().rule_value(), placeholder: '', helper: '' }));
  protected readonly yearsI18n = computed<NumberInputI18n>(() => ({ name: 'value', label: this.i18n().rule_years(), placeholder: '', helper: '' }));
  protected readonly fromNumberI18n = computed<NumberInputI18n>(() => ({ name: 'from', label: this.i18n().rule_from(), placeholder: '', helper: '' }));
  protected readonly toNumberI18n = computed<NumberInputI18n>(() => ({ name: 'to', label: this.i18n().rule_to(), placeholder: '', helper: '' }));
  protected readonly valueDateI18n = computed<DateInputI18n>(() => ({ name: 'value', label: this.i18n().rule_value(), placeholder: '' }));
  protected readonly fromDateI18n = computed<DateInputI18n>(() => ({ name: 'from', label: this.i18n().rule_from(), placeholder: '' }));
  protected readonly toDateI18n = computed<DateInputI18n>(() => ({ name: 'to', label: this.i18n().rule_to(), placeholder: '' }));
  protected readonly valueTextI18n = computed<TextInputI18n>(() => ({ name: 'value', label: this.i18n().rule_value(), placeholder: '', helper: '' }));

  // value accessors for the template
  protected errorsAt(index: number, name: string): string[] {
    const key = index < 0 ? name : `conditions.${index}.${name}`;
    return this.errors()[key] ?? [];
  }
  protected choiceValues(row: ConditionRow): string[] { return row.choices.map(c => c.value); }
  protected choiceLabels(row: ConditionRow): string[] { return row.choices.map(c => c.label || c.value); }
  protected singleValue(row: ConditionRow): string {
    const v = row.cond.value;
    return v === undefined || v === null || Array.isArray(v) ? '' : String(v);
  }
  protected listValue(row: ConditionRow): string[] {
    const v = row.cond.value;
    if (Array.isArray(v)) return v.map(String);
    return v === undefined || v === null || v === '' ? [] : [String(v)];
  }
  protected numberValue(row: ConditionRow): number | null {
    const v = row.cond.value;
    if (v === undefined || v === null || v === '' || Array.isArray(v)) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  protected rangeText(row: ConditionRow, at: 0 | 1): string {
    const v = row.cond.value;
    return Array.isArray(v) ? String(v[at] ?? '') : '';
  }
  protected rangeNumber(row: ConditionRow, at: 0 | 1): number | null {
    const text = this.rangeText(row, at);
    const n = Number(text);
    return text !== '' && Number.isFinite(n) ? n : null;
  }

  // changes — every one writes a new rule through the model
  protected onToggle(on: boolean): void {
    if (on === this.isOn()) return;
    this.rule.set(on ? { match: 'all', conditions: [EMPTY_CONDITION()] } : undefined);
  }

  protected onMatchChange(match: string): void {
    const rule = this.rule();
    if (!rule || (match !== 'all' && match !== 'any') || match === rule.match) return;
    this.rule.set({ ...rule, match });
  }

  protected addCondition(): void {
    const rule = this.rule() ?? { match: 'all' as const, conditions: [] };
    this.rule.set({ ...rule, conditions: [...(rule.conditions ?? []), EMPTY_CONDITION()] });
  }

  /** Removing the last condition switches the rule off — unless there is no switch to turn it back on. */
  protected removeCondition(index: number): void {
    const rule = this.rule();
    if (!rule) return;
    const conditions = (rule.conditions ?? []).filter((_, i) => i !== index);
    this.rule.set(conditions.length === 0 && this.showToggle() ? undefined : { ...rule, conditions });
  }

  /** A new controller starts with its first operator and no value. */
  protected onFieldIdChange(index: number, fieldId: string): void {
    const current = this.rule()?.conditions?.[index];
    if (!current || current.fieldId === fieldId) return;
    const controller = this.candidates().find(f => f.id === fieldId);
    const op = controller ? conditionOpsFor(controller)[0] : undefined;
    this.setCondition(index, { fieldId, op: op ?? ('' as ConditionOp) });
  }

  /** A new operator keeps the value only while the value input stays the same kind. */
  protected onOpChange(index: number, op: string): void {
    const current = this.rule()?.conditions?.[index];
    if (!current || current.op === op) return;
    const controller = this.candidates().find(f => f.id === current.fieldId);
    const sameKind = conditionValueKind(controller, current.op) === conditionValueKind(controller, op as ConditionOp);
    const next: FieldCondition = { fieldId: current.fieldId, op: op as ConditionOp };
    if (sameKind && current.value !== undefined) next.value = current.value;
    this.setCondition(index, next);
  }

  protected onValueChange(index: number, value: string | string[]): void {
    const current = this.rule()?.conditions?.[index];
    if (!current) return;
    this.setCondition(index, withValue(current, value));
  }

  protected onNumberChange(index: number, value: number | null | undefined): void {
    const current = this.rule()?.conditions?.[index];
    if (!current) return;
    const n = value === null || value === undefined || (value as unknown) === '' ? undefined : Number(value);
    this.setCondition(index, withValue(current, n !== undefined && Number.isFinite(n) ? n : undefined));
  }

  /** `between` stores `[from, to]` as text (numbers and StoreDates alike). */
  protected onRangeChange(index: number, at: 0 | 1, value: string | number | null | undefined): void {
    const current = this.rule()?.conditions?.[index];
    if (!current) return;
    const range = Array.isArray(current.value) ? [...current.value.map(String)] : ['', ''];
    while (range.length < 2) range.push('');
    range[at] = value === null || value === undefined ? '' : String(value);
    this.setCondition(index, withValue(current, range.every(v => v === '') ? undefined : range.slice(0, 2)));
  }

  private setCondition(index: number, cond: FieldCondition): void {
    const rule = this.rule();
    if (!rule) return;
    this.rule.set({ ...rule, conditions: (rule.conditions ?? []).map((c, i) => (i === index ? cond : c)) });
  }
}

/** The condition with `value` set, or without the key when the value is empty (Firestore rejects undefined). */
function withValue(cond: FieldCondition, value: string | number | string[] | undefined): FieldCondition {
  const { value: _old, ...rest } = cond;
  const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
  return empty ? rest : { ...rest, value };
}
