import { describe, expect, it } from 'vitest';

import { DerivedValue, Field, VisibilityRule } from '@okr/shared-models';

import { derivedValuesValidations, visibilityRuleValidations } from './form-rules.validations';

const rule = (...conditions: VisibilityRule['conditions']): VisibilityRule => ({ match: 'all', conditions });

describe('visibilityRuleValidations', () => {
  it('accepts a complete rule', () => {
    const r = rule({ fieldId: 'a', op: 'equals', value: 'yes' }, { fieldId: 'b', op: 'isChecked' });
    expect(visibilityRuleValidations(r).isValid()).toBe(true);
  });

  it('requires at least one condition', () => {
    expect(visibilityRuleValidations(rule()).hasErrors('conditions')).toBe(true);
  });

  it('requires a field and an operator per row', () => {
    const result = visibilityRuleValidations(rule({ fieldId: '', op: '' as never }, { fieldId: 'a', op: 'isFilled' }));
    expect(result.hasErrors('conditions.0.fieldId')).toBe(true);
    expect(result.hasErrors('conditions.0.op')).toBe(true);
    expect(result.hasErrors('conditions.1.fieldId')).toBe(false);
    expect(result.hasErrors('conditions.1.op')).toBe(false);
  });

  it('requires a value for equals but not for isChecked', () => {
    expect(visibilityRuleValidations(rule({ fieldId: 'a', op: 'equals' })).hasErrors('conditions.0.value')).toBe(true);
    expect(visibilityRuleValidations(rule({ fieldId: 'a', op: 'equals', value: '  ' })).hasErrors('conditions.0.value')).toBe(true);
    expect(visibilityRuleValidations(rule({ fieldId: 'a', op: 'isChecked' })).hasErrors('conditions.0.value')).toBe(false);
    expect(visibilityRuleValidations(rule({ fieldId: 'a', op: 'isFilled' })).isValid()).toBe(true);
  });

  it('accepts the number 0 as a value', () => {
    expect(visibilityRuleValidations(rule({ fieldId: 'a', op: 'equals', value: 0 })).isValid()).toBe(true);
  });

  it('requires a non-empty list for in/notIn/contains/notContains', () => {
    for (const op of ['in', 'notIn', 'contains', 'notContains'] as const) {
      expect(visibilityRuleValidations(rule({ fieldId: 'a', op, value: [] })).hasErrors('conditions.0.value')).toBe(true);
      expect(visibilityRuleValidations(rule({ fieldId: 'a', op, value: ['x'] })).hasErrors('conditions.0.value')).toBe(false);
    }
  });

  it('requires a range [from, to] for between and rejects from > to', () => {
    const v = (value: VisibilityRule['conditions'][number]['value']) => visibilityRuleValidations(rule({ fieldId: 'a', op: 'between', value })).hasErrors('conditions.0.value');
    expect(v(undefined)).toBe(true);
    expect(v(['3'])).toBe(true);
    expect(v(['3', ''])).toBe(true);
    expect(v(['7', '3'])).toBe(true);
    expect(v(['10', '9'])).toBe(true); // numeric, not text, comparison
    expect(v(['20260101', '20250101'])).toBe(true);
    expect(v(['3', '3'])).toBe(false);
    expect(v(['3', '10'])).toBe(false);
    expect(v(['20250101', '20260101'])).toBe(false);
  });

  it('keeps age thresholds within 0–120', () => {
    const v = (value: VisibilityRule['conditions'][number]['value'], op: 'ageGte' | 'ageLt' = 'ageGte') =>
      visibilityRuleValidations(rule({ fieldId: 'a', op, value })).hasErrors('conditions.0.value');
    expect(v(121)).toBe(true);
    expect(v(-1)).toBe(true);
    expect(v(20.5)).toBe(true);
    expect(v(undefined)).toBe(true);
    expect(v('abc')).toBe(true);
    expect(v(0)).toBe(false);
    expect(v(120)).toBe(false);
    expect(v('20')).toBe(false);
    expect(v(121, 'ageLt')).toBe(true);
    expect(v(18, 'ageLt')).toBe(false);
  });
});

describe('derivedValuesValidations', () => {
  const fields = [{ id: 'dob', key: 'dateOfBirth', type: 'date', label: 'DOB', required: false, width: 'full', order: 0 }] as Field[];
  const derived = (over: Partial<DerivedValue> = {}): DerivedValue => ({
    key: 'applicationAs',
    cases: [{ when: rule({ fieldId: 'dob', op: 'ageLt', value: 20 }), value: 'youth' }],
    otherwise: 'adult',
    ...over,
  });
  const run = (list: DerivedValue[]) => derivedValuesValidations({ derivedValues: list, fields });

  it('accepts a complete derived value, and an empty list', () => {
    expect(run([derived()]).isValid()).toBe(true);
    expect(run([]).isValid()).toBe(true);
  });

  it('requires a camelCase key', () => {
    expect(run([derived({ key: '' })]).hasErrors('derivedValues.0.key')).toBe(true);
    expect(run([derived({ key: 'Not Valid' })]).hasErrors('derivedValues.0.key')).toBe(true);
  });

  it('rejects a key equal to an input field key, but not to a display field key', () => {
    expect(run([derived({ key: 'dateOfBirth' })]).hasErrors('derivedValues.0.key')).toBe(true);
    const withLabel = [...fields, { id: 'l', key: 'applicationAs', type: 'label', label: 'x', required: false, width: 'full', order: 1 } as Field];
    expect(derivedValuesValidations({ derivedValues: [derived()], fields: withLabel }).hasErrors('derivedValues.0.key')).toBe(false);
  });

  it('rejects two derived values with the same key', () => {
    const r = run([derived(), derived()]);
    expect(r.hasErrors('derivedValues.1.key')).toBe(true);
    expect(r.hasErrors('derivedValues.0.key')).toBe(false);
  });

  it('requires a type when stored as a property', () => {
    expect(run([derived({ asProperty: true })]).hasErrors('derivedValues.0.type')).toBe(true);
    expect(run([derived({ asProperty: true, type: 'text' })]).hasErrors('derivedValues.0.type')).toBe(false);
    expect(run([derived({ asProperty: false })]).hasErrors('derivedValues.0.type')).toBe(false);
  });

  it('validates the rule of every case', () => {
    const bad = derived({ cases: [{ when: rule({ fieldId: '', op: 'isFilled' }), value: 'x' }] });
    expect(run([bad]).hasErrors('derivedValues.0.cases.0.when.conditions.0.fieldId')).toBe(true);
  });
});
