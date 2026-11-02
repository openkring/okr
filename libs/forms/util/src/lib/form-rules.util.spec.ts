import { describe, expect, it } from 'vitest';

import { ConditionOp, Field, FieldType, VisibilityRule } from '@okr/shared-models';

import { conditionOpsFor, controllingFieldCandidates, describeRule, findRuleIssues, removeReferencesTo } from './form-rules.util';

function f(id: string, type: FieldType, order: number, extra: Record<string, unknown> = {}): Field {
  return { id, key: type === 'divider' ? '' : `key${id}`, label: `Label ${id}`, required: false, width: 'full', order, type, ...extra } as Field;
}

const OPS: Record<ConditionOp, string> = {
  equals: 'ist', notEquals: 'ist nicht', in: 'ist eine von', notIn: 'ist keine von',
  isChecked: 'ist angekreuzt', isNotChecked: 'ist nicht angekreuzt', contains: 'enthält', notContains: 'enthält nicht',
  lt: 'ist kleiner als', lte: 'ist höchstens', gt: 'ist grösser als', gte: 'ist mindestens', between: 'liegt zwischen',
  ageGte: 'Alter mindestens', ageLt: 'Alter unter', isFilled: 'ist ausgefüllt', isEmpty: 'ist leer',
};

describe('conditionOpsFor (spec §5)', () => {
  it('offers choice operators for dropdown, radio and category', () => {
    for (const t of ['dropdown', 'radio', 'category'] as const) {
      expect(conditionOpsFor(f('a', t, 0, { options: [] }))).toEqual(['equals', 'notEquals', 'in', 'notIn']);
    }
  });

  it('distinguishes a single checkbox from a checkbox with options', () => {
    expect(conditionOpsFor(f('a', 'checkbox', 0))).toEqual(['isChecked', 'isNotChecked']);
    expect(conditionOpsFor(f('a', 'checkbox', 0, { options: [] }))).toEqual(['isChecked', 'isNotChecked']);
    expect(conditionOpsFor(f('a', 'checkbox', 0, { options: [{ label: 'A', value: 'a' }] }))).toEqual(['contains', 'notContains', 'isEmpty', 'isFilled']);
  });

  it('offers comparisons for number and rating', () => {
    for (const t of ['number', 'rating'] as const) {
      expect(conditionOpsFor(f('a', t, 0))).toEqual(['equals', 'lt', 'lte', 'gt', 'gte', 'between']);
    }
  });

  it('offers date comparisons and the age operators for date', () => {
    expect(conditionOpsFor(f('a', 'date', 0))).toEqual(['lt', 'gt', 'between', 'ageGte', 'ageLt']);
  });

  it('offers text operators for text, email and phone', () => {
    for (const t of ['text', 'email', 'phone'] as const) {
      expect(conditionOpsFor(f('a', t, 0))).toEqual(['equals', 'notEquals', 'isFilled', 'isEmpty']);
    }
  });

  it('offers only filled/empty for value-less inputs', () => {
    for (const t of ['file', 'images', 'signature', 'avatar', 'time', 'iban', 'password'] as const) {
      expect(conditionOpsFor(f('a', t, 0))).toEqual(['isFilled', 'isEmpty']);
    }
  });

  it('offers nothing for display elements', () => {
    for (const t of ['label', 'paragraph', 'divider'] as const) {
      expect(conditionOpsFor(f('a', t, 0))).toEqual([]);
    }
  });
});

describe('controllingFieldCandidates', () => {
  it('returns input fields with a lower order, sorted by order', () => {
    const fields = [f('c', 'text', 2), f('a', 'text', 0), f('b', 'date', 1), f('d', 'text', 3)];
    expect(controllingFieldCandidates(fields, fields[0]).map(x => x.id)).toEqual(['a', 'b']);
  });

  it('excludes display fields, the target itself and later fields', () => {
    const fields = [f('a', 'text', 0), f('lbl', 'label', 1), f('div', 'divider', 2), f('t', 'text', 3), f('z', 'text', 4)];
    expect(controllingFieldCandidates(fields, fields[3]).map(x => x.id)).toEqual(['a']);
  });

  it('gives a divider the same candidates', () => {
    const fields = [f('a', 'text', 0), f('div', 'divider', 1)];
    expect(controllingFieldCandidates(fields, fields[1]).map(x => x.id)).toEqual(['a']);
  });
});

describe('describeRule', () => {
  const fields = [
    f('dob', 'date', 0, { label: 'Geburtsdatum' }),
    f('exp', 'checkbox', 1, { label: 'Ich bin schon gerudert' }),
    f('lvl', 'dropdown', 2, { label: 'Stufe', options: [{ label: 'Anfänger', value: 'beg' }, { label: 'Profi', value: 'pro' }] }),
    f('num', 'number', 3, { label: 'Anzahl' }),
  ];

  it('joins conditions of an all-rule with «und»', () => {
    const rule: VisibilityRule = { match: 'all', conditions: [{ fieldId: 'dob', op: 'ageLt', value: 20 }, { fieldId: 'exp', op: 'isChecked' }] };
    expect(describeRule(rule, fields, OPS)).toBe('wenn Geburtsdatum Alter unter 20 und Ich bin schon gerudert ist angekreuzt');
  });

  it('joins conditions of an any-rule with «oder»', () => {
    const rule: VisibilityRule = { match: 'any', conditions: [{ fieldId: 'dob', op: 'ageGte', value: 20 }, { fieldId: 'exp', op: 'isFilled' }] };
    expect(describeRule(rule, fields, OPS)).toBe('wenn Geburtsdatum Alter mindestens 20 oder Ich bin schon gerudert ist ausgefüllt');
  });

  it('shows option labels instead of stored values, and lists for in/between', () => {
    const rule: VisibilityRule = { match: 'all', conditions: [{ fieldId: 'lvl', op: 'in', value: ['beg', 'pro'] }, { fieldId: 'num', op: 'between', value: ['3', '7'] }] };
    expect(describeRule(rule, fields, OPS)).toBe('wenn Stufe ist eine von Anfänger, Profi und Anzahl liegt zwischen 3–7');
  });

  it('marks a condition on an unknown field and survives an empty rule', () => {
    const rule: VisibilityRule = { match: 'all', conditions: [{ fieldId: 'gone', op: 'isFilled' }] };
    expect(describeRule(rule, fields, OPS)).toBe('wenn ? ist ausgefüllt');
    expect(describeRule({ match: 'all', conditions: [] }, fields, OPS)).toBe('');
  });

  it('takes the connector words as an optional parameter', () => {
    const rule: VisibilityRule = { match: 'any', conditions: [{ fieldId: 'dob', op: 'ageLt', value: 20 }, { fieldId: 'exp', op: 'isChecked' }] };
    expect(describeRule(rule, fields, OPS, { if: 'if', and: 'and', or: 'or' })).toBe('if Geburtsdatum Alter unter 20 or Ich bin schon gerudert ist angekreuzt');
  });
});

describe('findRuleIssues', () => {
  const rule = (fieldId: string, op: ConditionOp = 'isFilled', value?: VisibilityRule['conditions'][number]['value']): { visibleIf: VisibilityRule } => ({
    visibleIf: { match: 'all', conditions: [{ fieldId, op, ...(value !== undefined ? { value } : {}) }] },
  });

  it('reports nothing for a sound form', () => {
    const fields = [f('a', 'text', 0), f('b', 'text', 1, rule('a'))];
    expect(findRuleIssues(fields)).toEqual([]);
  });

  it('reports a missing controller, and a display-only controller', () => {
    const fields = [f('lbl', 'label', 0), f('a', 'text', 1, rule('gone')), f('b', 'text', 2, rule('lbl'))];
    expect(findRuleIssues(fields)).toEqual([
      { fieldId: 'a', reason: 'missing' },
      { fieldId: 'b', reason: 'missing' },
    ]);
  });

  it('reports a controller that is not earlier', () => {
    const fields = [f('b', 'text', 0, rule('a')), f('a', 'text', 1), f('c', 'text', 2, rule('c'))];
    expect(findRuleIssues(fields)).toEqual([
      { fieldId: 'b', reason: 'later' },
      { fieldId: 'c', reason: 'later' },
    ]);
  });

  it('reports a value that is no longer among the options', () => {
    const opts = [{ label: 'Ja', value: 'yes' }, { label: 'Nein', value: 'no' }];
    const fields = [
      f('d', 'dropdown', 0, { options: opts }),
      f('x', 'text', 1, rule('d', 'equals', 'maybe')),
      f('y', 'text', 2, rule('d', 'in', ['yes', 'gone'])),
      f('ok', 'text', 3, rule('d', 'notIn', ['yes', 'no'])),
    ];
    expect(findRuleIssues(fields)).toEqual([
      { fieldId: 'x', reason: 'staleValue' },
      { fieldId: 'y', reason: 'staleValue' },
    ]);
  });

  it('checks contains against checkbox options but ignores free-text controllers', () => {
    const fields = [
      f('c', 'checkbox', 0, { options: [{ label: 'A', value: 'a' }] }),
      f('t', 'text', 1),
      f('x', 'text', 2, rule('c', 'contains', ['b'])),
      f('y', 'text', 3, rule('t', 'equals', 'anything')),
    ];
    expect(findRuleIssues(fields)).toEqual([{ fieldId: 'x', reason: 'staleValue' }]);
  });

  it('covers the rules of dividers too', () => {
    const fields = [f('a', 'text', 0), f('div', 'divider', 1, rule('gone'))];
    expect(findRuleIssues(fields)).toEqual([{ fieldId: 'div', reason: 'missing' }]);
  });

  it('reports a dependent once per reason', () => {
    const fields = [
      f('a', 'text', 0),
      f('b', 'text', 1, { visibleIf: { match: 'all', conditions: [{ fieldId: 'gone', op: 'isFilled' }, { fieldId: 'gone2', op: 'isEmpty' }] } }),
    ];
    expect(findRuleIssues(fields)).toEqual([{ fieldId: 'b', reason: 'missing' }]);
  });
});

describe('removeReferencesTo', () => {
  it('drops conditions on the removed field and keeps the others', () => {
    const rule: VisibilityRule = { match: 'all', conditions: [{ fieldId: 'a', op: 'isFilled' }, { fieldId: 'b', op: 'isEmpty' }] };
    const fields = [f('a', 'text', 0), f('b', 'text', 1), f('c', 'text', 2, { visibleIf: rule })];
    const out = removeReferencesTo(fields, 'a');
    expect(out[2].visibleIf).toEqual({ match: 'all', conditions: [{ fieldId: 'b', op: 'isEmpty' }] });
  });

  it('removes the rule when no condition is left, without leaving the key behind', () => {
    const fields = [f('a', 'text', 0), f('c', 'text', 1, { visibleIf: { match: 'any', conditions: [{ fieldId: 'a', op: 'isFilled' }] } })];
    const out = removeReferencesTo(fields, 'a');
    expect('visibleIf' in out[1]).toBe(false);
  });

  it('does not mutate its input', () => {
    const rule: VisibilityRule = { match: 'all', conditions: [{ fieldId: 'a', op: 'isFilled' }] };
    const fields = [f('a', 'text', 0), f('c', 'text', 1, { visibleIf: rule })];
    const snapshot = structuredClone(fields);
    const out = removeReferencesTo(fields, 'a');
    expect(fields).toEqual(snapshot);
    expect(out).not.toBe(fields);
    expect(out[1]).not.toBe(fields[1]);
  });

  it('leaves unrelated fields untouched', () => {
    const fields = [f('a', 'text', 0), f('b', 'text', 1)];
    expect(removeReferencesTo(fields, 'zzz')).toEqual(fields);
  });

  it('cleans divider rules as well', () => {
    const fields = [f('a', 'text', 0), f('d', 'divider', 1, { visibleIf: { match: 'all', conditions: [{ fieldId: 'a', op: 'isFilled' }] } })];
    expect('visibleIf' in removeReferencesTo(fields, 'a')[1]).toBe(false);
  });
});
