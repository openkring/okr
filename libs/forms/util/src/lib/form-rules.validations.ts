import { enforce, omitWhen, staticSuite, test } from 'vest';

import { DerivedValue, Field, FieldCondition, VisibilityRule } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';
import { NAME_LENGTH } from '@okr/shared-constants';

import { FIELD_KEY_PATTERN, isInputField } from './field-kind';
import { conditionOpsFor } from './form-rules.util';

/** Operators that compare against a single value. */
const SINGLE_VALUE_OPS = ['equals', 'notEquals', 'lt', 'lte', 'gt', 'gte'];
/** Operators that compare against a list of values. */
const LIST_VALUE_OPS = ['in', 'notIn', 'contains', 'notContains'];
const AGE_OPS = ['ageGte', 'ageLt'];

export const MAX_CONDITION_AGE = 120;

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

/** Numeric comparison when both bounds are numbers (`10 > 9`), text comparison otherwise (StoreDates sort as text). */
function isRangeInOrder(from: string, to: string): boolean {
  const a = Number(from);
  const b = Number(to);
  if (Number.isFinite(a) && Number.isFinite(b)) return a <= b;
  return from <= to;
}

function conditionTests(prefix: string, cond: FieldCondition): void {
  test(`${prefix}.fieldId`, 'required', () => {
    enforce(cond?.fieldId).isString().isNotBlank();
  });
  test(`${prefix}.op`, 'required', () => {
    enforce(cond?.op).isString().isNotBlank();
  });

  const op = cond?.op as string;
  const value = cond?.value;

  omitWhen(!SINGLE_VALUE_OPS.includes(op), () => {
    test(`${prefix}.value`, 'required', () => {
      enforce(isBlank(value) || Array.isArray(value)).isFalsy();
    });
  });

  omitWhen(!LIST_VALUE_OPS.includes(op), () => {
    test(`${prefix}.value`, 'required', () => {
      const list = Array.isArray(value) ? value : isBlank(value) ? [] : [value];
      enforce(list.length > 0 && list.every(v => !isBlank(v))).isTruthy();
    });
  });

  omitWhen(op !== 'between', () => {
    test(`${prefix}.value`, 'required', () => {
      enforce(Array.isArray(value) && value.length === 2 && value.every(v => !isBlank(v))).isTruthy();
    });
    test(`${prefix}.value`, '@forms/feature.rule.range_order', () => {
      if (Array.isArray(value) && value.length === 2 && value.every(v => !isBlank(v))) {
        enforce(isRangeInOrder(String(value[0]), String(value[1]))).isTruthy();
      }
    });
  });

  omitWhen(!AGE_OPS.includes(op), () => {
    test(`${prefix}.value`, 'required', () => {
      enforce(!isBlank(value) && !Array.isArray(value) && Number.isFinite(Number(value))).isTruthy();
    });
    test(`${prefix}.value`, '@forms/feature.rule.invalid_age', () => {
      if (!isBlank(value) && !Array.isArray(value) && Number.isFinite(Number(value))) {
        const n = Number(value);
        enforce(Number.isInteger(n) && n >= 0 && n <= MAX_CONDITION_AGE).isTruthy();
      }
    });
  });
}

/** Registers the tests for one rule under `prefix` (`conditions.<i>.…` when empty). Shared by both suites. */
export function ruleTests(prefix: string, rule: VisibilityRule | undefined): void {
  const at = (name: string) => (prefix ? `${prefix}.${name}` : name);
  test(at('conditions'), 'required', () => {
    enforce(Array.isArray(rule?.conditions) && rule.conditions.length > 0).isTruthy();
  });
  (rule?.conditions ?? []).forEach((cond, i) => conditionTests(at(`conditions.${i}`), cond));
}

/**
 * Validates one visibility rule (the «Nur anzeigen, wenn …» card): field and operator per row,
 * a value where the operator needs one, `between` from ≤ to, age 0–120. Whether the referenced
 * field still exists, comes earlier or offers the value is `findRuleIssues`' job.
 */
export const visibilityRuleValidations = staticSuite((rule: VisibilityRule) => {
  ruleTests('', rule);
});

/**
 * A derived condition may reference any input field — but one that still exists, and with an operator
 * that field still offers (a retyped controller leaves e.g. `ageLt` on a text field). A dangling
 * condition would count as true on the server.
 */
function controllerTests(prefix: string, cond: FieldCondition, inputFields: Field[]): void {
  const controller = cond?.fieldId ? inputFields.find(f => f.id === cond.fieldId) : undefined;
  omitWhen(!cond?.fieldId, () => {
    test(`${prefix}.fieldId`, '@forms/feature.derived.unknown_field', () => {
      enforce(controller).isTruthy();
    });
  });
  omitWhen(!controller || !cond?.op, () => {
    test(`${prefix}.op`, '@forms/feature.derived.op_not_offered', () => {
      enforce(!!controller && conditionOpsFor(controller).includes(cond.op)).isTruthy();
    });
  });
}

export interface DerivedValuesModel {
  derivedValues: DerivedValue[];
  fields: Field[];
}

/**
 * Validates the «Berechnete Werte» card: per derived value a camelCase key that is neither the
 * key of an input field nor used twice, a type when stored as a property, at least one case, valid
 * case rules whose fields still exist and still offer the operator, a «dann» value per case and a
 * capped «sonst».
 */
export const derivedValuesValidations = staticSuite((model: DerivedValuesModel) => {
  // Always runs, so an empty list still yields a result that `isValid()` accepts (Vest reports a suite without tests as invalid).
  test('derivedValues', 'notArray', () => {
    enforce(model.derivedValues === undefined || Array.isArray(model.derivedValues)).isTruthy();
  });
  const derived = Array.isArray(model.derivedValues) ? model.derivedValues : [];
  const inputFields = (model.fields ?? []).filter(isInputField);
  const inputKeys = new Set(inputFields.map(f => f.key).filter(k => !!k));

  derived.forEach((d, i) => {
    const at = `derivedValues.${i}`;
    stringValidations(`${at}.key`, d.key ?? '', NAME_LENGTH, 0, true);
    omitWhen(!d.key, () => {
      test(`${at}.key`, '@forms/feature.field.key_invalid', () => {
        enforce(d.key).matches(FIELD_KEY_PATTERN);
      });
      test(`${at}.key`, '@forms/feature.derived.key_is_field_key', () => {
        enforce(inputKeys.has(d.key)).isFalsy();
      });
      test(`${at}.key`, '@forms/feature.derived.key_taken', () => {
        enforce(derived.findIndex(x => x.key === d.key) === i).isTruthy();
      });
    });
    omitWhen(d.asProperty !== true, () => {
      test(`${at}.type`, 'required', () => {
        enforce(d.type).isString().isNotBlank();
      });
    });
    test(`${at}.cases`, '@forms/feature.derived.no_cases', () => {
      enforce(Array.isArray(d.cases) && d.cases.length > 0).isTruthy();
    });
    (d.cases ?? []).forEach((c, j) => {
      const caseAt = `${at}.cases.${j}`;
      ruleTests(`${caseAt}.when`, c.when);
      (c.when?.conditions ?? []).forEach((cond, k) => controllerTests(`${caseAt}.when.conditions.${k}`, cond, inputFields));
      stringValidations(`${caseAt}.value`, c.value ?? '', NAME_LENGTH, 0, true);
    });
    stringValidations(`${at}.otherwise`, d.otherwise ?? '', NAME_LENGTH);
  });
});
