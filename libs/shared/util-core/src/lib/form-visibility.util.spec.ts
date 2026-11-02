import { describe, expect, it } from 'vitest';
import type { ConditionOp, Field, FieldCondition, VisibilityRule } from '@okr/shared-models';
import { evaluateCondition, getVisibleFieldIds } from './form-visibility.util';

const TODAY = '20261028';

const f = (id: string, order: number, type: Field['type'], extra: Record<string, unknown> = {}): Field =>
  ({ id, key: `k_${id}`, label: id, required: false, width: 'full', order, type, ...extra }) as Field;

const rule = (conditions: FieldCondition[], match: 'all' | 'any' = 'all'): VisibilityRule => ({ match, conditions });
const cond = (fieldId: string, op: ConditionOp, value?: FieldCondition['value']): FieldCondition => ({ fieldId, op, value });

/** Controller `a` (given type) followed by a dependent field `b` that is shown iff the condition holds. */
const shown = (type: Field['type'], c: Omit<FieldCondition, 'fieldId'>, answer: unknown): boolean => {
  const fields = [f('a', 1, type), f('b', 2, 'text', { visibleIf: rule([{ fieldId: 'a', ...c }]) })];
  return getVisibleFieldIds(fields, { k_a: answer }, TODAY).has('b');
};

describe('getVisibleFieldIds', () => {
  it('shows every field when there are no rules (also without a visibleIf property)', () => {
    const fields = [f('a', 1, 'text'), f('b', 2, 'text', { visibleIf: undefined }), f('c', 3, 'divider')];
    expect([...getVisibleFieldIds(fields, {}, TODAY)].sort()).toEqual(['a', 'b', 'c']);
  });

  it('treats garbage rules as no rule', () => {
    const fields = [
      f('a', 1, 'text', { visibleIf: null }),
      f('b', 2, 'text', { visibleIf: { match: 'all', conditions: [] } }),
      f('c', 3, 'text', { visibleIf: { match: 'all' } }),
      f('d', 4, 'text', { visibleIf: 'nonsense' }),
    ];
    expect(getVisibleFieldIds(fields, {}, TODAY).size).toBe(4);
  });

  describe('operators on a non-empty value', () => {
    it.each([
      ['dropdown', 'equals', 'x', 'x', true],
      ['dropdown', 'equals', 'x', 'y', false],
      ['dropdown', 'notEquals', 'x', 'y', true],
      ['dropdown', 'notEquals', 'x', 'x', false],
      ['dropdown', 'in', ['x', 'y'], 'y', true],
      ['dropdown', 'in', ['x', 'y'], 'z', false],
      ['dropdown', 'notIn', ['x', 'y'], 'z', true],
      ['dropdown', 'notIn', ['x', 'y'], 'x', false],
      ['checkbox', 'isChecked', undefined, true, true],
      ['checkbox', 'isNotChecked', undefined, true, false],
      ['checkbox', 'contains', 'x', ['x', 'y'], true],
      ['checkbox', 'contains', 'z', ['x', 'y'], false],
      ['checkbox', 'notContains', 'z', ['x', 'y'], true],
      ['checkbox', 'notContains', 'x', ['x', 'y'], false],
      ['number', 'equals', 5, 5, true],
      ['number', 'equals', 5, 6, false],
      ['number', 'lt', 10, 5, true],
      ['number', 'lt', 5, 5, false],
      ['number', 'lte', 5, 5, true],
      ['number', 'lte', 4, 5, false],
      ['number', 'gt', 5, 6, true],
      ['number', 'gt', 5, 5, false],
      ['number', 'gte', 5, 5, true],
      ['number', 'gte', 6, 5, false],
      ['number', 'between', ['3', '7'], 5, true],
      ['number', 'between', ['3', '7'], 8, false],
      ['date', 'lt', '20260101', '20251231', true],
      ['date', 'lt', '20260101', '20260101', false],
      ['date', 'gt', '20260101', '20260102', true],
      ['date', 'between', ['20260101', '20261231'], '20260615', true],
      ['date', 'between', ['20260101', '20261231'], '20270101', false],
      ['date', 'ageGte', 20, '20060615', true],
      ['date', 'ageLt', 20, '20060615', false],
      ['date', 'ageLt', 20, '20100615', true],
      ['text', 'isFilled', undefined, 'abc', true],
      ['text', 'isEmpty', undefined, 'abc', false],
    ] as [Field['type'], ConditionOp, FieldCondition['value'], unknown, boolean][])(
      '%s %s %j on %j is %s',
      (type, op, value, answer, expected) => {
        expect(shown(type, { op, value }, answer)).toBe(expected);
      },
    );
  });

  describe('operators on an empty value', () => {
    const emptyTrue: ConditionOp[] = ['isEmpty', 'isNotChecked', 'notEquals', 'notIn', 'notContains'];
    const all: [ConditionOp, FieldCondition['value']][] = [
      ['equals', 'x'], ['notEquals', 'x'], ['in', ['x']], ['notIn', ['x']],
      ['isChecked', undefined], ['isNotChecked', undefined],
      ['contains', 'x'], ['notContains', 'x'],
      ['lt', 5], ['lte', 5], ['gt', -5], ['gte', -5], ['between', ['-5', '5']],
      ['ageGte', 0], ['ageLt', 100],
      ['isFilled', undefined], ['isEmpty', undefined],
    ];
    const empties: unknown[] = ['', null, undefined, [], false];
    for (const [op, value] of all) {
      for (const empty of empties) {
        it(`${op} on ${JSON.stringify(empty) ?? 'undefined'} is ${emptyTrue.includes(op)}`, () => {
          expect(shown('text', { op, value }, empty)).toBe(emptyTrue.includes(op));
        });
      }
    }
    it('a field that has no answer at all counts as empty', () => {
      const fields = [f('a', 1, 'text'), f('b', 2, 'text', { visibleIf: rule([cond('a', 'isEmpty')]) })];
      expect(getVisibleFieldIds(fields, {}, TODAY).has('b')).toBe(true);
    });
  });

  describe('age by year of birth (getAge with the year of today)', () => {
    it('born 2007 counts as 19 all of 2026', () => {
      expect(shown('date', { op: 'ageLt', value: 20 }, '20070101')).toBe(true);
      expect(shown('date', { op: 'ageLt', value: 20 }, '20071231')).toBe(true);
    });
    it('born 2006 counts as 20 all of 2026', () => {
      expect(shown('date', { op: 'ageLt', value: 20 }, '20060101')).toBe(false);
      expect(shown('date', { op: 'ageLt', value: 20 }, '20061231')).toBe(false);
      expect(shown('date', { op: 'ageGte', value: 20 }, '20060101')).toBe(true);
      expect(shown('date', { op: 'ageGte', value: 20 }, '20061231')).toBe(true);
    });
    it('a year-only date works', () => {
      expect(shown('date', { op: 'ageGte', value: 20 }, '19900000')).toBe(true);
    });
    it('an empty or invalid date makes every age comparison false', () => {
      for (const bad of ['', 'abc', null, undefined, 20060101, '2006']) {
        expect(shown('date', { op: 'ageLt', value: 20 }, bad)).toBe(false);
        expect(shown('date', { op: 'ageGte', value: 20 }, bad)).toBe(false);
      }
    });
    it('a non-numeric threshold makes the comparison false', () => {
      expect(shown('date', { op: 'ageGte', value: 'abc' }, '19900000')).toBe(false);
      expect(shown('date', { op: 'ageGte' }, '19900000')).toBe(false);
    });
  });

  describe('numbers', () => {
    it('gt 18 accepts a string answer', () => {
      expect(shown('number', { op: 'gt', value: 18 }, '20')).toBe(true);
    });
    it('gt accepts a string threshold', () => {
      expect(shown('number', { op: 'gt', value: '18' }, 20)).toBe(true);
    });
    it('between is inclusive at both ends', () => {
      expect(shown('number', { op: 'between', value: ['10', '20'] }, 10)).toBe(true);
      expect(shown('number', { op: 'between', value: ['10', '20'] }, 20)).toBe(true);
      expect(shown('number', { op: 'between', value: ['10', '20'] }, 9)).toBe(false);
      expect(shown('number', { op: 'between', value: ['10', '20'] }, 21)).toBe(false);
    });
    it('between also tolerates numeric bounds from legacy data', () => {
      expect(shown('number', { op: 'between', value: [10, 20] as unknown as string[] }, 15)).toBe(true);
    });
    it('non-finite answers or thresholds make numeric comparisons false', () => {
      expect(shown('number', { op: 'gt', value: 1 }, 'abc')).toBe(false);
      expect(shown('number', { op: 'lt', value: 1 }, 'abc')).toBe(false);
      expect(shown('number', { op: 'gt', value: 1 }, NaN)).toBe(false);
      expect(shown('number', { op: 'gt', value: 1 }, Infinity)).toBe(false);
      expect(shown('number', { op: 'gt', value: 'abc' }, 5)).toBe(false);
      expect(shown('number', { op: 'between', value: ['1'] }, 5)).toBe(false);
      expect(shown('number', { op: 'between', value: 5 }, 5)).toBe(false);
    });
    it('zero is a value, not empty', () => {
      expect(shown('number', { op: 'isFilled' }, 0)).toBe(true);
      expect(shown('number', { op: 'equals', value: 0 }, 0)).toBe(true);
    });
  });

  describe('AHV numbers (ssn)', () => {
    it('the bare mask scaffolding is empty, a typed number is filled', () => {
      expect(shown('ssn', { op: 'isEmpty' }, '756.')).toBe(true);
      expect(shown('ssn', { op: 'isFilled' }, '756.')).toBe(false);
      expect(shown('ssn', { op: 'isFilled' }, '756.0803.5816.61')).toBe(true);
      expect(shown('ssn', { op: 'isEmpty' }, '')).toBe(true);
    });
    it('the scaffolding stays a value for a text controller', () => {
      expect(shown('text', { op: 'isFilled' }, '756.')).toBe(true);
    });
    it('a legacy text controller keyed ssnId reads the scaffolding as empty too', () => {
      const fields = [f('a', 1, 'text', { key: 'ssnId' }), f('b', 2, 'text', { visibleIf: rule([cond('a', 'isFilled')]) })];
      expect(getVisibleFieldIds(fields, { ssnId: '756.' }, TODAY).has('b')).toBe(false);
      expect(getVisibleFieldIds(fields, { ssnId: '756.0803.5816.61' }, TODAY).has('b')).toBe(true);
    });
  });

  describe('dates', () => {
    it('refuse to compare garbage', () => {
      expect(shown('date', { op: 'lt', value: '20260101' }, 'abc')).toBe(false);
      expect(shown('date', { op: 'lt', value: 'abc' }, '20250101')).toBe(false);
    });
  });

  describe('match', () => {
    const two = [cond('a', 'equals', 'x'), cond('c', 'equals', 'y')];
    const fields = (match: 'all' | 'any') => [
      f('a', 1, 'text'), f('c', 2, 'text'), f('b', 3, 'text', { visibleIf: rule(two, match) }),
    ];
    it("'all' needs both conditions", () => {
      expect(getVisibleFieldIds(fields('all'), { k_a: 'x', k_c: 'y' }, TODAY).has('b')).toBe(true);
      expect(getVisibleFieldIds(fields('all'), { k_a: 'x', k_c: 'n' }, TODAY).has('b')).toBe(false);
    });
    it("'any' needs one condition", () => {
      expect(getVisibleFieldIds(fields('any'), { k_a: 'x', k_c: 'n' }, TODAY).has('b')).toBe(true);
      expect(getVisibleFieldIds(fields('any'), { k_a: 'n', k_c: 'n' }, TODAY).has('b')).toBe(false);
    });
  });

  describe('blocks (divider rules)', () => {
    const fields = [
      f('a', 1, 'checkbox'),
      f('d1', 2, 'divider', { visibleIf: rule([cond('a', 'isChecked')]) }),
      f('x', 3, 'text'),
      f('y', 4, 'text'),
      f('d2', 5, 'divider'),
      f('z', 6, 'text'),
    ];
    it('a false divider rule hides the divider and the fields up to the next divider', () => {
      const v = getVisibleFieldIds(fields, { k_a: false }, TODAY);
      expect([...v].sort()).toEqual(['a', 'd2', 'z']);
    });
    it('a true divider rule shows the block', () => {
      expect([...getVisibleFieldIds(fields, { k_a: true }, TODAY)].sort()).toEqual(['a', 'd1', 'd2', 'x', 'y', 'z']);
    });
    it('block true AND own false hides the field', () => {
      const own = [
        f('a', 1, 'checkbox'),
        f('d1', 2, 'divider', { visibleIf: rule([cond('a', 'isChecked')]) }),
        f('x', 3, 'text', { visibleIf: rule([cond('a', 'isNotChecked')]) }),
        f('y', 4, 'text'),
      ];
      const v = getVisibleFieldIds(own, { k_a: true }, TODAY);
      expect(v.has('x')).toBe(false);
      expect(v.has('y')).toBe(true);
    });
    it('fields before the first divider are not governed by any block', () => {
      const v = getVisibleFieldIds([f('p', 1, 'text'), ...fields.slice(1).map((x) => ({ ...x, order: x.order + 1 }))], { k_a: false }, TODAY);
      expect(v.has('p')).toBe(true);
    });
  });

  it('sorts by order, not array position', () => {
    const fields = [f('b', 2, 'text', { visibleIf: rule([cond('a', 'equals', 'x')]) }), f('a', 1, 'text')];
    expect(getVisibleFieldIds(fields, { k_a: 'x' }, TODAY).has('b')).toBe(true);
    expect(getVisibleFieldIds(fields, { k_a: 'n' }, TODAY).has('b')).toBe(false);
  });

  describe('chains', () => {
    it('when A is false B and C are hidden (C controller counts as empty)', () => {
      const chain = [
        f('a', 1, 'checkbox'),
        f('b', 2, 'text', { visibleIf: rule([cond('a', 'isChecked')]) }),
        f('c', 3, 'text', { visibleIf: rule([cond('b', 'isFilled')]) }),
      ];
      const v = getVisibleFieldIds(chain, { k_a: false, k_b: 'stale' }, TODAY);
      expect([...v]).toEqual(['a']);
    });
    it('a hidden controller reads as empty, so isEmpty on it is true', () => {
      const chain = [
        f('a', 1, 'checkbox'),
        f('b', 2, 'text', { visibleIf: rule([cond('a', 'isChecked')]) }),
        f('c', 3, 'text', { visibleIf: rule([cond('b', 'isEmpty')]) }),
      ];
      const v = getVisibleFieldIds(chain, { k_a: false, k_b: 'stale' }, TODAY);
      expect(v.has('b')).toBe(false);
      expect(v.has('c')).toBe(true);
    });
    it('a stale answer of a hidden controller does not count', () => {
      const chain = [
        f('a', 1, 'checkbox'),
        f('b', 2, 'text', { visibleIf: rule([cond('a', 'isChecked')]) }),
        f('c', 3, 'text', { visibleIf: rule([cond('b', 'equals', 'stale')]) }),
      ];
      const v = getVisibleFieldIds(chain, { k_a: false, k_b: 'stale' }, TODAY);
      expect([...v]).toEqual(['a']);
    });
    it('shows the whole chain when A is true', () => {
      const chain = [
        f('a', 1, 'checkbox'),
        f('b', 2, 'text', { visibleIf: rule([cond('a', 'isChecked')]) }),
        f('c', 3, 'text', { visibleIf: rule([cond('b', 'equals', 'go')]) }),
      ];
      expect(getVisibleFieldIds(chain, { k_a: true, k_b: 'go' }, TODAY).has('c')).toBe(true);
    });
  });

  describe('dangling conditions count as true', () => {
    it('an unknown fieldId does not hide the field', () => {
      const fields = [f('a', 1, 'text'), f('b', 2, 'text', { visibleIf: rule([cond('gone', 'equals', 'x')]) })];
      expect(getVisibleFieldIds(fields, {}, TODAY).has('b')).toBe(true);
    });
    it('a controller with a higher order does not hide the field', () => {
      const fields = [f('b', 1, 'text', { visibleIf: rule([cond('a', 'equals', 'x')]) }), f('a', 2, 'text')];
      expect(getVisibleFieldIds(fields, { k_a: 'n' }, TODAY).has('b')).toBe(true);
    });
    it('a controller with an equal order (incl. itself) does not hide the field', () => {
      const fields = [f('a', 1, 'text'), f('b', 1, 'text', { visibleIf: rule([cond('a', 'equals', 'x'), cond('b', 'equals', 'x')]) })];
      expect(getVisibleFieldIds(fields, { k_a: 'n' }, TODAY).has('b')).toBe(true);
    });
    it('a display field as controller is dangling', () => {
      for (const t of ['label', 'paragraph', 'divider'] as const) {
        const fields = [f('a', 1, t), f('b', 2, 'text', { visibleIf: rule([cond('a', 'isFilled')]) })];
        expect(getVisibleFieldIds(fields, { k_a: 'x' }, TODAY).has('b')).toBe(true);
      }
    });
    it('a mix: the dangling condition counts as true, the live one still decides', () => {
      const fields = [
        f('a', 1, 'text'),
        f('b', 2, 'text', { visibleIf: rule([cond('gone', 'equals', 'x'), cond('a', 'equals', 'x')], 'all') }),
        f('c', 3, 'text', { visibleIf: rule([cond('gone', 'equals', 'x'), cond('a', 'equals', 'x')], 'any') }),
      ];
      const miss = getVisibleFieldIds(fields, { k_a: 'n' }, TODAY);
      expect(miss.has('b')).toBe(false);
      expect(miss.has('c')).toBe(true);
      const hit = getVisibleFieldIds(fields, { k_a: 'x' }, TODAY);
      expect(hit.has('b')).toBe(true);
      expect(hit.has('c')).toBe(true);
    });
    it('garbage condition entries do not hide the field or throw', () => {
      const fields = [f('a', 1, 'text'), f('b', 2, 'text', { visibleIf: { match: 'all', conditions: [null, 7, {}] } })];
      expect(getVisibleFieldIds(fields, {}, TODAY).has('b')).toBe(true);
    });
  });

  it('is robust against an unknown operator (condition is false) and bad today', () => {
    expect(shown('text', { op: 'bogus' as ConditionOp, value: 'x' }, 'x')).toBe(false);
    const fields = [f('a', 1, 'date'), f('b', 2, 'text', { visibleIf: rule([cond('a', 'ageGte', 0)]) })];
    expect(getVisibleFieldIds(fields, { k_a: '19900000' }, '').has('b')).toBe(false);
  });

  it('does not mutate its inputs', () => {
    const fields = [f('b', 2, 'text'), f('a', 1, 'text')];
    getVisibleFieldIds(fields, {}, TODAY);
    expect(fields.map((x) => x.id)).toEqual(['b', 'a']);
  });
});

describe('evaluateCondition', () => {
  const fields = [f('a', 1, 'dropdown'), f('l', 2, 'label')];
  it('reads the controller value via its key and counts a hidden controller as empty', () => {
    const c = cond('a', 'equals', 'x');
    expect(evaluateCondition(c, fields, { k_a: 'x' }, new Set(['a']), TODAY)).toBe(true);
    expect(evaluateCondition(c, fields, { k_a: 'x' }, new Set(), TODAY)).toBe(false);
    expect(evaluateCondition(cond('a', 'isEmpty'), fields, { k_a: 'x' }, new Set(), TODAY)).toBe(true);
  });
  it('is true for an unknown field and a display field', () => {
    expect(evaluateCondition(cond('nope', 'equals', 'x'), fields, {}, new Set(), TODAY)).toBe(true);
    expect(evaluateCondition(cond('l', 'isFilled'), fields, { k_l: 'x' }, new Set(['l']), TODAY)).toBe(true);
  });
});
