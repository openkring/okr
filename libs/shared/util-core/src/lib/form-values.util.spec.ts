import { describe, expect, it } from 'vitest';
import type { DerivedValue, Field, FieldCondition, PropertyType, VisibilityRule } from '@okr/shared-models';
import {
  buildTypedProperties, coerceToPropertyType, FORM_OTHER_TEXT_MAX, computeDerivedValues, omitSsnValues, propertyTypeOf, ssnFieldKeys, ssnPresenceLabel,
} from './form-values.util';
import { getVisibleFieldIds } from './form-visibility.util';

const TODAY = '20261028';

const f = (id: string, order: number, type: Field['type'], extra: Record<string, unknown> = {}): Field =>
  ({ id, key: `k_${id}`, label: `L ${id}`, required: false, width: 'full', order, type, ...extra }) as Field;

const rule = (conditions: FieldCondition[], match: 'all' | 'any' = 'all'): VisibilityRule => ({ match, conditions });

// SCS «Mitgliedschaft beantragen» (spec §13.1)
const scsFields: Field[] = [
  f('dob', 1, 'date'),
  f('rowing', 2, 'checkbox', { key: 'rowingExperience', asProperty: true, visibleIf: rule([{ fieldId: 'dob', op: 'ageGte', value: 20 }]) }),
  f('club', 3, 'text', { key: 'previousClub', asProperty: true, visibleIf: rule([{ fieldId: 'rowing', op: 'isChecked' }]) }),
  f('swim', 4, 'checkbox', { key: 'canSwim300m', asProperty: true, visibleIf: rule([{ fieldId: 'dob', op: 'ageLt', value: 20 }]) }),
];
const applicationAs: DerivedValue = {
  key: 'applicationAs',
  cases: [
    { when: rule([{ fieldId: 'dob', op: 'ageLt', value: 20 }]), value: 'youth' },
    { when: rule([{ fieldId: 'rowing', op: 'isChecked' }]), value: 'transfer' },
  ],
  otherwise: 'adult',
};

const derive = (derived: DerivedValue[] | undefined, fields: Field[], values: Record<string, unknown>) =>
  computeDerivedValues(derived, fields, values, getVisibleFieldIds(fields, values, TODAY), TODAY);

describe('computeDerivedValues', () => {
  // age = 2026 - year of birth
  it.each([
    ['age 19', { k_dob: '20070601' }, 'youth'],
    ['age 20 with rowing experience', { k_dob: '20060601', rowingExperience: true }, 'transfer'],
    ['age 20 without rowing experience', { k_dob: '20060601', rowingExperience: false }, 'adult'],
    ['empty date of birth', {}, 'adult'],
  ])('SCS: %s -> %s', (_name, values, expected) => {
    expect(derive([applicationAs], scsFields, values)).toEqual({ applicationAs: expected });
  });

  it('a hidden controller reads as empty (rowing experience typed, then the person is a minor)', () => {
    expect(derive([applicationAs], scsFields, { k_dob: '20100101', rowingExperience: true })).toEqual({ applicationAs: 'youth' });
  });

  it('first matching case wins', () => {
    const d: DerivedValue = {
      key: 'k',
      cases: [
        { when: rule([{ fieldId: 'dob', op: 'isFilled' }]), value: 'first' },
        { when: rule([{ fieldId: 'dob', op: 'isFilled' }]), value: 'second' },
      ],
    };
    expect(derive([d], scsFields, { k_dob: '20000101' })).toEqual({ k: 'first' });
  });

  it('no case matches and no otherwise: the key is absent', () => {
    const d: DerivedValue = { key: 'k', cases: [{ when: rule([{ fieldId: 'dob', op: 'isFilled' }]), value: 'x' }] };
    expect(derive([d], scsFields, {})).toEqual({});
  });

  it('undefined or empty derived gives {}', () => {
    expect(derive(undefined, scsFields, {})).toEqual({});
    expect(derive([], scsFields, {})).toEqual({});
  });

  it('a case with no conditions holds (same as an empty visibility rule)', () => {
    const d: DerivedValue = { key: 'k', cases: [{ when: rule([]), value: 'always' }], otherwise: 'never' };
    expect(derive([d], scsFields, {})).toEqual({ k: 'always' });
  });

  it('a case may reference any input field, also a later one', () => {
    const fields = [f('a', 1, 'text'), f('b', 2, 'text')];
    const d: DerivedValue = { key: 'k', cases: [{ when: rule([{ fieldId: 'b', op: 'equals', value: 'x' }]), value: 'yes' }], otherwise: 'no' };
    expect(derive([d], fields, { k_b: 'x' })).toEqual({ k: 'yes' });
  });

  it('computes several derived values independently', () => {
    const d2: DerivedValue = { key: 'other', cases: [], otherwise: 'o' };
    expect(derive([applicationAs, d2], scsFields, {})).toEqual({ applicationAs: 'adult', other: 'o' });
  });
});

describe('propertyTypeOf', () => {
  it.each([
    ['checkbox', undefined, 'boolean'],
    ['number', undefined, 'number'],
    ['rating', undefined, 'number'],
    ['text', undefined, 'text'],
    ['dropdown', undefined, 'text'],
    ['radio', undefined, 'text'],
    ['category', undefined, 'text'],
    ['date', undefined, 'text'],
    ['email', undefined, 'text'],
    ['phone', undefined, 'text'],
    ['file', undefined, undefined],
    ['images', undefined, undefined],
    ['signature', undefined, undefined],
    ['avatar', undefined, undefined],
    ['password', undefined, undefined],
    ['iban', undefined, undefined],
    ['ssn', undefined, undefined],
    ['time', undefined, undefined],
    ['label', undefined, undefined],
    ['divider', undefined, undefined],
  ])('%s -> %s', (type, _x, expected) => {
    expect(propertyTypeOf(f('x', 1, type as Field['type']))).toBe(expected);
  });

  it('a checkbox with options cannot be a property', () => {
    expect(propertyTypeOf(f('x', 1, 'checkbox', { options: [{ label: 'A', value: 'a' }] }))).toBeUndefined();
  });

  it('a checkbox with an empty options list is a single checkbox', () => {
    expect(propertyTypeOf(f('x', 1, 'checkbox', { options: [] }))).toBe('boolean');
  });
});

describe('propertyTypeOf (implicit)', () => {
  it('follows valueType', () => {
    expect(propertyTypeOf(f('x', 1, 'implicit', { valueType: 'number' }))).toBe('number');
    expect(propertyTypeOf(f('x', 1, 'implicit', { valueType: 'text' }))).toBe('text');
    expect(propertyTypeOf(f('x', 1, 'implicit', { valueType: 'boolean' }))).toBe('boolean');
  });
});

describe('coerceToPropertyType', () => {
  it.each<[unknown, PropertyType, string | number | boolean | undefined]>([
    ['true', 'boolean', true],
    ['false', 'boolean', false],
    [true, 'boolean', true],
    [false, 'boolean', false],
    ['yes', 'boolean', undefined],
    [1, 'boolean', undefined],
    ['3', 'number', 3],
    [' 4.5 ', 'number', 4.5],
    [7, 'number', 7],
    ['abc', 'number', undefined],
    ['', 'number', undefined],
    [Number.NaN, 'number', undefined],
    [true, 'number', undefined],
    [20061028, 'text', '20061028'],
    ['hello', 'text', 'hello'],
    [true, 'text', undefined],
    [['a'], 'text', undefined],
    [undefined, 'text', undefined],
    [null, 'boolean', undefined],
  ])('(%j, %s) -> %j', (value, type, expected) => {
    expect(coerceToPropertyType(value, type)).toBe(expected);
  });
});

describe('buildTypedProperties', () => {
  const build = (fields: Field[], values: Record<string, unknown>, derived?: DerivedValue[]) => {
    const visible = getVisibleFieldIds(fields, values, TODAY);
    const dv = computeDerivedValues(derived, fields, values, visible, TODAY);
    return buildTypedProperties(fields, values, visible, derived, dv);
  };

  it('lists only visible asProperty fields, with label and typed value', () => {
    const props = build(scsFields, { k_dob: '20060601', rowingExperience: true, previousClub: 'RC Zürich', canSwim300m: true });
    expect(props).toEqual([
      { key: 'rowingExperience', type: 'boolean', value: true, label: 'L rowing' },
      { key: 'previousClub', type: 'text', value: 'RC Zürich', label: 'L club' },
    ]);
  });

  it('a hidden asProperty field is absent', () => {
    const props = build(scsFields, { k_dob: '20100101', canSwim300m: true, rowingExperience: true, previousClub: 'x' });
    expect(props.map((p) => p.key)).toEqual(['canSwim300m']);
  });

  it('keeps an explicit false, omits an unanswered or empty answer', () => {
    const props = build(scsFields, { k_dob: '20060601', rowingExperience: true, previousClub: '' });
    expect(props.map((p) => p.key)).toEqual(['rowingExperience']);
    expect(build(scsFields, { k_dob: '20060601', rowingExperience: false }).map((p) => [p.key, p.value])).toEqual([['rowingExperience', false]]);
    expect(build(scsFields, { k_dob: '20060601' })).toEqual([]);
  });

  it('follows field order, not array order', () => {
    const fields = [f('b', 2, 'number', { key: 'b', asProperty: true }), f('a', 1, 'text', { key: 'a', asProperty: true })];
    expect(build(fields, { a: 'x', b: '3' })).toEqual([
      { key: 'a', type: 'text', value: 'x', label: 'L a' },
      { key: 'b', type: 'number', value: 3, label: 'L b' },
    ]);
  });

  it('omits a value that does not coerce, and fields that cannot be properties', () => {
    const fields = [f('n', 1, 'number', { key: 'n', asProperty: true }), f('u', 2, 'file', { key: 'u', asProperty: true })];
    expect(build(fields, { n: 'abc', u: ['x'] })).toEqual([]);
  });

  it('ignores fields without asProperty', () => {
    expect(build([f('a', 1, 'text')], { k_a: 'x' })).toEqual([]);
  });

  it('appends a derived value with asProperty and type, labelled by its key', () => {
    const derived: DerivedValue[] = [{ ...applicationAs, asProperty: true, type: 'text' }];
    const props = build(scsFields, { k_dob: '20060601', rowingExperience: true }, derived);
    expect(props).toEqual([
      { key: 'rowingExperience', type: 'boolean', value: true, label: 'L rowing' },
      { key: 'applicationAs', type: 'text', value: 'transfer', label: 'applicationAs' },
    ]);
  });

  it('skips a derived property without type, without value, or that does not coerce', () => {
    const noType: DerivedValue = { key: 'a', cases: [], otherwise: 'x', asProperty: true };
    const noValue: DerivedValue = { key: 'b', cases: [], asProperty: true, type: 'text' };
    const bad: DerivedValue = { key: 'c', cases: [], otherwise: 'x', asProperty: true, type: 'number' };
    const notProp: DerivedValue = { key: 'd', cases: [], otherwise: 'x', type: 'text' };
    expect(build([], {}, [noType, noValue, bad, notProp])).toEqual([]);
  });

  it('tolerates legacy input: derived undefined, derivedValues undefined', () => {
    const visible = new Set(['a']);
    const fields = [f('a', 1, 'text', { key: 'a', asProperty: true })];
    expect(buildTypedProperties(fields, { a: 'x' }, visible, undefined, undefined as unknown as Record<string, string>)).toEqual([
      { key: 'a', type: 'text', value: 'x', label: 'L a' },
    ]);
  });
});

describe('buildTypedProperties: «Andere» (<key>Other)', () => {
  const other = (extra: Record<string, unknown> = {}): Field[] => [
    f('p', 1, 'radio', { key: 'prio', label: 'Vorkenntnisse', asProperty: true, allowOther: true, options: [{ label: 'A', value: 'a' }], ...extra }),
  ];
  const build = (fields: Field[], values: Record<string, unknown>) =>
    buildTypedProperties(fields, values, getVisibleFieldIds(fields, values, TODAY), undefined, {});

  it('adds the text right after the property when the answer is «Andere»', () => {
    expect(build(other(), { prio: 'other', prioOther: 'Kanu' })).toEqual([
      { key: 'prio', type: 'text', value: 'other', label: 'Vorkenntnisse' },
      { key: 'prioOther', type: 'text', value: 'Kanu', label: 'Vorkenntnisse (Andere)' },
    ]);
  });

  it('adds nothing for another answer, an empty text, or without allowOther', () => {
    expect(build(other(), { prio: 'a', prioOther: 'Kanu' }).map((p) => p.key)).toEqual(['prio']);
    expect(build(other(), { prio: 'other', prioOther: '  ' }).map((p) => p.key)).toEqual(['prio']);
    expect(build(other({ allowOther: false }), { prio: 'other', prioOther: 'Kanu' }).map((p) => p.key)).toEqual(['prio']);
  });

  it('adds nothing when a real field of the form owns the key <key>Other (its answer is not an «Andere» text)', () => {
    const fields = [...other(), f('pw', 2, 'password', { key: 'prioOther' })];
    expect(build(fields, { prio: 'other', prioOther: 'geheim' }).map((p) => p.key)).toEqual(['prio']);
  });

  it('omits (never truncates) an «Andere» text longer than FORM_OTHER_TEXT_MAX', () => {
    expect(FORM_OTHER_TEXT_MAX).toBe(500);
    const keep = build(other(), { prio: 'other', prioOther: 'x'.repeat(500) });
    expect(keep.map((p) => p.key)).toEqual(['prio', 'prioOther']);
    expect(build(other(), { prio: 'other', prioOther: 'x'.repeat(501) }).map((p) => p.key)).toEqual(['prio']);
  });

  it('adds nothing for a hidden field', () => {
    const fields = [f('c', 1, 'checkbox'), ...other({ order: 2, visibleIf: rule([{ fieldId: 'c', op: 'isChecked' }]) })];
    expect(build(fields, { k_c: false, prio: 'other', prioOther: 'Kanu' })).toEqual([]);
  });
});

describe('AHV answers (ssn fields)', () => {
  const fields = [f('a', 1, 'text', { key: 'lastName' }), f('b', 2, 'ssn', { key: 'ssnId' }), f('c', 3, 'divider')];

  it('lists the keys of the ssn fields only', () => {
    expect([...ssnFieldKeys(fields)]).toEqual(['ssnId']);
    expect(ssnFieldKeys(undefined).size).toBe(0);
  });

  it('omits the ssn answers and keeps everything else', () => {
    const values = { lastName: 'Muster', ssnId: '7560803581661', applicationAs: 'youth' };
    expect(omitSsnValues(fields, values)).toEqual({ lastName: 'Muster', applicationAs: 'youth' });
    expect(values.ssnId).toBe('7560803581661'); // the input is not mutated
  });

  it('a legacy text field keyed ssnId counts as an AHV field', () => {
    const legacy = [f('a', 1, 'text', { key: 'ssnId' }), f('b', 2, 'text', { key: 'lastName' })];
    expect([...ssnFieldKeys(legacy)]).toEqual(['ssnId']);
    expect(propertyTypeOf(legacy[0])).toBeUndefined();
    expect(propertyTypeOf(legacy[1])).toBe('text');
  });

  it('always drops ssnId, even when no field of the form asks for it (a whole stored record)', () => {
    const record = { okey: 'a1', lastName: 'Muster', ssnId: '7560803581661', state: 'applied' };
    expect(omitSsnValues([f('a', 1, 'text', { key: 'lastName' })], record)).toEqual({ okey: 'a1', lastName: 'Muster', state: 'applied' });
    expect(omitSsnValues(undefined, record)).not.toHaveProperty('ssnId');
  });

  it('returns a copy when the form has no ssn field', () => {
    const values = { lastName: 'Muster' };
    const result = omitSsnValues([f('a', 1, 'text', { key: 'lastName' })], values);
    expect(result).toEqual(values);
    expect(result).not.toBe(values);
  });

  it('shows «angegeben» or «–», never the number', () => {
    expect(ssnPresenceLabel('7560803581661')).toBe('angegeben');
    expect(ssnPresenceLabel('756.0803.5816.61')).toBe('angegeben');
    expect(ssnPresenceLabel('')).toBe('–');
    expect(ssnPresenceLabel('756.')).toBe('–');
    expect(ssnPresenceLabel(undefined)).toBe('–');
    expect(ssnPresenceLabel(null)).toBe('–');
  });
});
