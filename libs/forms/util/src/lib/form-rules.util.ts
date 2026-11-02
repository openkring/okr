import {
  CategoryListModel, ConditionOp, DerivedValue, Field, FieldCondition, FieldOption, FormDefinitionModel, FormMapping, VisibilityRule,
} from '@okr/shared-models';
import { computeDerivedValues, getVisibleFieldIds } from '@okr/shared-util-core';

import { isDisplayField } from './field-kind';

/** The connector words of `describeRule`. German by default; pass translated words for other languages. */
export interface RuleConnectors {
  if: string;
  and: string;
  or: string;
}

const DEFAULT_CONNECTORS: RuleConnectors = { if: 'wenn', and: 'und', or: 'oder' };

const CHOICE_OPS: ConditionOp[] = ['equals', 'notEquals', 'in', 'notIn'];
const OPTION_CHECKBOX_OPS: ConditionOp[] = ['contains', 'notContains', 'isEmpty', 'isFilled'];
const NUMBER_OPS: ConditionOp[] = ['equals', 'lt', 'lte', 'gt', 'gte', 'between'];
const DATE_OPS: ConditionOp[] = ['lt', 'gt', 'between', 'ageGte', 'ageLt'];
const TEXT_OPS: ConditionOp[] = ['equals', 'notEquals', 'isFilled', 'isEmpty'];
const FILLED_OPS: ConditionOp[] = ['isFilled', 'isEmpty'];

/** The values the stored answer of an option-based controller can take; `undefined` for fields without a closed option list. */
function optionsOf(field: Field): { label: string; value: string }[] | undefined {
  if (field.type === 'dropdown' || field.type === 'radio') return field.options ?? [];
  if (field.type === 'checkbox' && Array.isArray(field.options) && field.options.length > 0) return field.options;
  return undefined;
}

/** The operators the editor offers for a controlling field (spec §5); `[]` for display elements, which cannot control. */
export function conditionOpsFor(field: Field): ConditionOp[] {
  switch (field.type) {
    case 'dropdown':
    case 'radio':
    case 'category':
      return [...CHOICE_OPS];
    case 'checkbox':
      return optionsOf(field) ? [...OPTION_CHECKBOX_OPS] : ['isChecked', 'isNotChecked'];
    case 'number':
    case 'rating':
      return [...NUMBER_OPS];
    case 'date':
      return [...DATE_OPS];
    case 'text':
    case 'email':
    case 'phone':
      return [...TEXT_OPS];
    case 'ssn':
      // an AHV number is never compared to a value: a rule would copy the number into the definition
      return [...FILLED_OPS];
    case 'label':
    case 'paragraph':
    case 'divider':
      return [];
    default:
      return [...FILLED_OPS];
  }
}

/** The fields a rule on `target` may reference: input fields with a lower `order` (earlier-only, no cycles), in form order. */
export function controllingFieldCandidates(fields: Field[], target: Field): Field[] {
  return fields
    .filter(f => f.id !== target.id && !isDisplayField(f.type) && f.order < target.order)
    .sort((a, b) => a.order - b.order);
}

function describeValue(cond: FieldCondition, controller: Field | undefined): string {
  const { value } = cond;
  if (value === undefined || value === null) return '';
  const options = controller ? optionsOf(controller) : undefined;
  const show = (v: unknown): string => {
    const raw = String(v);
    return options?.find(o => o.value === raw)?.label ?? raw;
  };
  if (Array.isArray(value)) {
    return cond.op === 'between' ? value.map(show).join('–') : value.map(show).join(', ');
  }
  return show(value);
}

/**
 * The builder's one-line reading of a rule, e.g. «wenn Geburtsdatum Alter unter 20 und Ich bin schon gerudert ist angekreuzt».
 * `opLabels` are the translated operator names; `connectors` the words «wenn / und / oder» (German by default).
 */
export function describeRule(
  rule: VisibilityRule,
  fields: Field[],
  opLabels: Record<ConditionOp, string>,
  connectors: RuleConnectors = DEFAULT_CONNECTORS,
): string {
  const parts = (rule.conditions ?? []).map(cond => {
    const controller = fields.find(f => f.id === cond.fieldId);
    return [controller?.label || '?', opLabels[cond.op] ?? cond.op, describeValue(cond, controller)].filter(s => s !== '').join(' ');
  });
  if (parts.length === 0) return '';
  return `${connectors.if} ${parts.join(` ${rule.match === 'any' ? connectors.or : connectors.and} `)}`;
}

export type RuleIssue = { fieldId: string; reason: 'missing' | 'later' | 'staleValue' };

const OPTION_VALUE_OPS: ConditionOp[] = ['equals', 'notEquals', 'in', 'notIn', 'contains', 'notContains'];

function valuesOf(cond: FieldCondition): string[] {
  const { value } = cond;
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]).map(String);
}

/**
 * What is wrong with the rules of a form. `fieldId` is the owning (dependent) field, dividers included.
 * missing: the controller is gone or display-only; later: it does not come before the owner;
 * staleValue: a compared value is no longer among the controller's options. One entry per owner and reason.
 */
export function findRuleIssues(fields: Field[]): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const add = (fieldId: string, reason: RuleIssue['reason']) => {
    if (!issues.some(i => i.fieldId === fieldId && i.reason === reason)) issues.push({ fieldId, reason });
  };

  for (const owner of [...fields].sort((a, b) => a.order - b.order)) {
    for (const cond of owner.visibleIf?.conditions ?? []) {
      const controller = fields.find(f => f.id === cond.fieldId);
      if (!controller || isDisplayField(controller.type)) {
        add(owner.id, 'missing');
        continue;
      }
      if (controller.order >= owner.order) add(owner.id, 'later');
      const options = optionsOf(controller);
      if (options && OPTION_VALUE_OPS.includes(cond.op) && valuesOf(cond).some(v => !options.some(o => o.value === v))) {
        add(owner.id, 'staleValue');
      }
    }
  }
  return issues;
}

/**
 * Drops every condition on `removedId` (call it when that field is deleted). A rule left without
 * conditions is removed. Pure: changed fields are copied, the input is not touched.
 */
export function removeReferencesTo(fields: Field[], removedId: string): Field[] {
  return fields.map(field => {
    const rule = field.visibleIf;
    if (!rule || !Array.isArray(rule.conditions) || !rule.conditions.some(c => c.fieldId === removedId)) return field;
    const conditions = rule.conditions.filter(c => c.fieldId !== removedId);
    const { visibleIf: _dropped, ...rest } = field;
    return (conditions.length > 0 ? { ...rest, visibleIf: { ...rule, conditions } } : rest) as Field;
  });
}

/** The fields whose rule references `fieldId` — the ones that lose a condition when it is deleted. In form order. */
export function fieldsReferencing(fields: Field[], fieldId: string): Field[] {
  return fields
    .filter(f => f.id !== fieldId && (f.visibleIf?.conditions ?? []).some(c => c?.fieldId === fieldId))
    .sort((a, b) => a.order - b.order);
}

/** The derived values with a case whose rule references `fieldId` — the ones that lose a condition when it is deleted. */
export function derivedValuesReferencing(derived: DerivedValue[] | undefined, fieldId: string): DerivedValue[] {
  return (Array.isArray(derived) ? derived : [])
    .filter(d => (d?.cases ?? []).some(c => (c?.when?.conditions ?? []).some(cond => cond?.fieldId === fieldId)));
}

/**
 * Drops every condition on `removedId` from the derived values' cases (call it when that field is deleted).
 * A case left without conditions is dropped: an empty rule holds for everyone, so keeping it would turn
 * «Alter unter 20 → youth» into «always youth». Untouched cases and values keep their identity; the input is not changed.
 */
export function removeDerivedReferencesTo(derived: DerivedValue[] | undefined, removedId: string): DerivedValue[] {
  return (Array.isArray(derived) ? derived : []).map(d => {
    const cases = Array.isArray(d?.cases) ? d.cases : [];
    if (!cases.some(c => (c?.when?.conditions ?? []).some(cond => cond?.fieldId === removedId))) return d;
    const kept: DerivedValue['cases'] = [];
    for (const c of cases) {
      const conditions = c?.when?.conditions ?? [];
      if (!conditions.some(cond => cond?.fieldId === removedId)) {
        kept.push(c);
        continue;
      }
      const left = conditions.filter(cond => cond?.fieldId !== removedId);
      if (left.length > 0) kept.push({ ...c, when: { ...c.when, conditions: left } });
    }
    return { ...d, cases: kept };
  });
}

/** A problem in a derived value's cases; `index` is the derived value's position, `key` its key. */
export type DerivedRuleIssue = { index: number; key: string; reason: 'missing' | 'staleOp' | 'staleValue' };

/**
 * What is wrong with the cases of the derived values. missing: the controller is gone or display-only;
 * staleOp: the controller no longer offers the operator (its type changed); staleValue: a compared value is no
 * longer among the controller's options. Incomplete rows (no field or operator chosen yet) are the suite's job.
 * One entry per derived value and reason.
 */
export function findDerivedRuleIssues(derived: DerivedValue[] | undefined, fields: Field[]): DerivedRuleIssue[] {
  const issues: DerivedRuleIssue[] = [];
  (Array.isArray(derived) ? derived : []).forEach((d, index) => {
    const add = (reason: DerivedRuleIssue['reason']) => {
      if (!issues.some(i => i.index === index && i.reason === reason)) issues.push({ index, key: d?.key ?? '', reason });
    };
    for (const c of d?.cases ?? []) {
      for (const cond of c?.when?.conditions ?? []) {
        if (!cond?.fieldId) continue;
        const controller = fields.find(f => f.id === cond.fieldId);
        if (!controller || isDisplayField(controller.type)) {
          add('missing');
          continue;
        }
        if (cond.op && !conditionOpsFor(controller).includes(cond.op)) {
          add('staleOp');
          continue;
        }
        const options = optionsOf(controller);
        if (options && OPTION_VALUE_OPS.includes(cond.op) && valuesOf(cond).some(v => !options.some(o => o.value === v))) {
          add('staleValue');
        }
      }
    }
  });
  return issues;
}

/**
 * The ids of the fields inside a conditional block: every field after a divider with a rule, up to
 * the next divider (spec §5 block rule). The divider itself is not included. The builder indents them.
 */
export function conditionalBlockMembers(fields: Field[]): Set<string> {
  const members = new Set<string>();
  let inBlock = false;
  for (const field of [...fields].sort((a, b) => a.order - b.order)) {
    if (field.type === 'divider') {
      inBlock = (field.visibleIf?.conditions?.length ?? 0) > 0;
    } else if (inBlock) {
      members.add(field.id);
    }
  }
  return members;
}

/**
 * Whether any field of the form (a divider included) carries a rule — what decides if the filler's
 * help explains that questions can appear and disappear. Legacy definitions have no `fields`, so
 * the argument may be missing. A rule without conditions shows everything and does not count.
 */
export function hasVisibilityRules(fields: Field[] | undefined): boolean {
  return (fields ?? []).some(field => (field.visibleIf?.conditions?.length ?? 0) > 0);
}

/** Which value input the rule editor shows for a condition row. */
export type ConditionValueKind = 'none' | 'option' | 'options' | 'number' | 'numberRange' | 'date' | 'dateRange' | 'age' | 'text';

const NO_VALUE_OPS: ConditionOp[] = ['isChecked', 'isNotChecked', 'isFilled', 'isEmpty'];

/** The value input for `op` on `controller` (spec §5): options, numbers, dates, years for age, or text; 'none' when no value is compared. */
export function conditionValueKind(controller: Field | undefined, op: ConditionOp | '' | undefined): ConditionValueKind {
  if (!controller || !op || NO_VALUE_OPS.includes(op)) return 'none';
  if (op === 'ageGte' || op === 'ageLt') return 'age';
  if (op === 'between') return controller.type === 'date' ? 'dateRange' : 'numberRange';
  if (controller.type === 'category' || optionsOf(controller)) {
    return op === 'in' || op === 'notIn' ? 'options' : 'option';
  }
  if (controller.type === 'number' || controller.type === 'rating') return 'number';
  if (controller.type === 'date') return 'date';
  return 'text';
}

/** The answers a choice controller can give, for the value input: its options, or the items of its category list. */
export function conditionChoices(controller: Field | undefined, categories: CategoryListModel[] = []): FieldOption[] {
  if (!controller) return [];
  if (controller.type === 'category') {
    const list = categories.find(c => c.name === controller.categoryName);
    return (list?.items ?? []).map(item => ({ label: item.name, value: item.name }));
  }
  return optionsOf(controller) ?? [];
}

/** The errors under `prefix` (e.g. `visibleIf.`), re-keyed relative to it — what a sub-form such as the rule editor reads. */
export function errorsUnder(errors: Record<string, string[]>, prefix: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [key, messages] of Object.entries(errors ?? {})) {
    if (key.startsWith(prefix)) result[key.slice(prefix.length)] = messages;
  }
  return result;
}

/**
 * The derived keys the mapping's `defaults` also set. Defaults win on the server, so such a derived
 * value is never stored — the builder warns (spec §6), it does not block saving.
 */
export function derivedKeysSetByMapping(derived: DerivedValue[] | undefined, mapping: FormMapping | undefined): Set<string> {
  const defaults = mapping?.defaults ?? {};
  const keys = (Array.isArray(derived) ? derived : []).map(d => d?.key).filter((k): k is string => !!k);
  return new Set(keys.filter(k => Object.prototype.hasOwnProperty.call(defaults, k)));
}

/**
 * What a submission with these answers would store as derived values, as `key = value` lines
 * (builder preview, spec §6/§16.4). Visibility is evaluated first, as on the server: a hidden
 * controlling answer counts as absent. A derived value with no matching case and no «sonst» is left out.
 */
export function previewDerivedValues(
  definition: Pick<FormDefinitionModel, 'fields' | 'derivedValues'>,
  values: Record<string, unknown>,
  today: string,
): string[] {
  const fields = definition.fields ?? [];
  const answers = values ?? {};
  const visible = getVisibleFieldIds(fields, answers, today);
  const result = computeDerivedValues(definition.derivedValues ?? [], fields, answers, visible, today);
  return Object.entries(result).map(([key, value]) => `${key} = ${value}`);
}
