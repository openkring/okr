import { ConditionOp, Field, FieldCondition, VisibilityRule } from '@okr/shared-models';

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
