import { describe, expect, it } from 'vitest';
import type { Field } from '@okr/shared-models';
import {
  isPrefillable, isSectionOnlyImplicit, parsePrefillParams, parsePrefillValue, PREFILL_EXCLUDED_TYPES, requiresSection, resolveImplicitValues,
} from './form-prefill.util';

const f = (type: Field['type'], extra: Record<string, unknown> = {}): Field =>
  ({ id: `id_${type}`, key: `k_${type}`, label: `L ${type}`, required: false, width: 'full', order: 1, type, ...extra }) as Field;

const opts = [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }];

describe('parsePrefillValue', () => {
  it.each([
    ['dropdown', 'a', 'a'],
    ['radio', 'b', 'b'],
    ['dropdown', 'zzz', undefined],
    ['radio', 'other', undefined],
  ])('%s option %s -> %s', (type, raw, expected) => {
    expect(parsePrefillValue(f(type as Field['type'], { options: opts }), raw)).toBe(expected);
  });

  it('a link never selects «Andere», even when allowOther is on', () => {
    expect(parsePrefillValue(f('radio', { options: opts, allowOther: true }), 'other')).toBeUndefined();
    expect(parsePrefillValue(f('checkbox', { options: opts, allowOther: true }), 'a,other')).toBeUndefined();
  });

  it.each([
    ['true', true], ['1', true], ['false', false], ['0', false], ['yes', undefined],
  ])('single checkbox %s -> %s', (raw, expected) => {
    expect(parsePrefillValue(f('checkbox'), raw)).toBe(expected);
  });

  it('checkbox with options: a list of known values', () => {
    const field = f('checkbox', { options: opts });
    expect(parsePrefillValue(field, 'a,b')).toEqual(['a', 'b']);
    expect(parsePrefillValue(field, 'a, a')).toEqual(['a']);
    expect(parsePrefillValue(field, 'a,x')).toBeUndefined();
    expect(parsePrefillValue(field, ',')).toBeUndefined();
  });

  it.each([
    ['2006-12-31', '20061231'],
    ['20061231', '20061231'],
    ['31.12.2006', undefined],
    ['20061331', undefined],
    ['2006-02-30', undefined],
    ['2006-13-01', undefined],
    ['', undefined],
  ])('date %s -> %s', (raw, expected) => {
    expect(parsePrefillValue(f('date'), raw)).toBe(expected);
  });

  it('number respects min / max / integer', () => {
    const field = f('number', { min: 1, max: 10 });
    expect(parsePrefillValue(field, '7')).toBe(7);
    expect(parsePrefillValue(field, '11')).toBeUndefined();
    expect(parsePrefillValue(field, '0')).toBeUndefined();
    expect(parsePrefillValue(field, 'abc')).toBeUndefined();
    expect(parsePrefillValue(f('number', { integer: true }), '1.5')).toBeUndefined();
    expect(parsePrefillValue(f('number'), '1.5')).toBe(1.5);
  });

  it('text, email, phone give the string; text respects maxLength', () => {
    expect(parsePrefillValue(f('text'), 'Anna')).toBe('Anna');
    expect(parsePrefillValue(f('email'), 'a@b.ch')).toBe('a@b.ch');
    expect(parsePrefillValue(f('phone'), '+41791234567')).toBe('+41791234567');
    expect(parsePrefillValue(f('text', { maxLength: 3 }), 'Anna')).toBeUndefined();
    expect(parsePrefillValue(f('text', { maxLength: 4 }), 'Anna')).toBe('Anna');
  });

  it.each(['password', 'iban', 'file', 'images', 'signature', 'avatar', 'ssn', 'label', 'paragraph', 'divider', 'course'])(
    'excluded type %s is never pre-filled',
    (type) => {
      expect(PREFILL_EXCLUDED_TYPES).toContain(type);
      expect(parsePrefillValue(f(type as Field['type']), 'x')).toBeUndefined();
    },
  );

  it('R1: a legacy text field keyed ssnId (an AHV field) is never pre-filled', () => {
    expect(parsePrefillValue(f('text', { key: 'ssnId' }), '7561234567897')).toBeUndefined();
    expect(parsePrefillParams([f('text', { key: 'ssnId' })], { ssnId: '7561234567897' })).toEqual({ values: {}, keys: [] });
  });

  it('implicit: only with fromLink, coerced by valueType', () => {
    expect(parsePrefillValue(f('implicit', { valueType: 'number', fromLink: true }), '3')).toBe(3);
    expect(parsePrefillValue(f('implicit', { valueType: 'number', fromLink: true }), 'abc')).toBeUndefined();
    expect(parsePrefillValue(f('implicit', { valueType: 'text', fromLink: true }), 'skiff-1')).toBe('skiff-1');
    expect(parsePrefillValue(f('implicit', { valueType: 'boolean', fromLink: true }), '1')).toBe(true);
    expect(parsePrefillValue(f('implicit', { valueType: 'number' }), '3')).toBeUndefined();
    expect(parsePrefillValue(f('implicit', { valueType: 'number', fromLink: false }), '3')).toBeUndefined();
  });

  it('rating: 1 to scale (default 5), whole stars unless allowHalf', () => {
    const r = f('rating');
    expect(parsePrefillValue(r, '3')).toBe(3);
    expect(parsePrefillValue(r, '5')).toBe(5);
    expect(parsePrefillValue(r, '6')).toBeUndefined();
    expect(parsePrefillValue(r, '0')).toBeUndefined();
    expect(parsePrefillValue(r, '2.5')).toBeUndefined();
    expect(parsePrefillValue(f('rating', { scale: 10 }), '6')).toBe(6);
    const half = f('rating', { allowHalf: true });
    expect(parsePrefillValue(half, '2.5')).toBe(2.5);
    expect(parsePrefillValue(half, '2.3')).toBeUndefined();
    expect(parsePrefillValue(half, '0')).toBeUndefined();
  });

  it('time: HH:mm within min / max', () => {
    expect(parsePrefillValue(f('time'), '14:30')).toBe('14:30');
    expect(parsePrefillValue(f('time'), '25:00')).toBeUndefined();
    expect(parsePrefillValue(f('time'), '14:60')).toBeUndefined();
    expect(parsePrefillValue(f('time'), '1430')).toBeUndefined();
    const bounded = f('time', { min: '08:00', max: '18:00' });
    expect(parsePrefillValue(bounded, '07:59')).toBeUndefined();
    expect(parsePrefillValue(bounded, '18:01')).toBeUndefined();
    expect(parsePrefillValue(bounded, '12:00')).toBe('12:00');
  });

  it('category: any non-empty string', () => {
    expect(parsePrefillValue(f('category', { categoryName: 'levels' }), 'Anfänger')).toBe('Anfänger');
    expect(parsePrefillValue(f('category', { categoryName: 'levels' }), '')).toBeUndefined();
  });

  it('a malformed value never throws', () => {
    expect(parsePrefillValue(f('text'), undefined as unknown as string)).toBeUndefined();
    expect(parsePrefillValue({ type: 'bogus' } as unknown as Field, 'x')).toBeUndefined();
  });
});

describe('parsePrefillParams', () => {
  const fields: Field[] = [
    f('text', { key: 'name' }),
    f('dropdown', { key: 'level', options: opts }),
    f('date', { key: 'dob' }),
    f('password', { key: 'pw' }),
    f('implicit', { key: 'courseId', valueType: 'text' }),
  ];

  it('ignores unknown keys, invalid values, excluded and non-fromLink implicit fields; the rest is still filled', () => {
    const r = parsePrefillParams(fields, { name: 'Anna', level: 'nope', dob: '31.12.2006', pw: 'x', courseId: 'c1', unknown: '1' });
    expect(r).toEqual({ values: { name: 'Anna' }, keys: ['name'] });
  });

  it('a repeated parameter uses its first value; keys lists only accepted keys', () => {
    const r = parsePrefillParams(fields, { level: ['a', 'b'], dob: '2006-12-31' });
    expect(r.values).toEqual({ level: 'a', dob: '20061231' });
    expect(r.keys).toEqual(['level', 'dob']);
  });

  it('does not read inherited properties of the params object', () => {
    expect(parsePrefillParams([f('text', { key: 'constructor' })], {})).toEqual({ values: {}, keys: [] });
  });

  it('tolerates garbage input', () => {
    expect(parsePrefillParams(undefined as unknown as Field[], {})).toEqual({ values: {}, keys: [] });
    expect(parsePrefillParams(fields, undefined as unknown as Record<string, string>)).toEqual({ values: {}, keys: [] });
  });
});

describe('resolveImplicitValues', () => {
  const course = f('implicit', { key: 'courseId', valueType: 'text', defaultValue: 'dflt', fromLink: true });
  const level = f('implicit', { key: 'level', valueType: 'number', fromLink: true });

  it('the section value wins over the client value and the default', () => {
    expect(resolveImplicitValues([course], { courseId: 'sec' }, { courseId: 'cli' })).toEqual({ courseId: 'sec' });
  });

  it('the client value counts only with fromLink', () => {
    expect(resolveImplicitValues([course], undefined, { courseId: 'cli' })).toEqual({ courseId: 'cli' });
    const locked = f('implicit', { key: 'courseId', valueType: 'text', defaultValue: 'dflt' });
    expect(resolveImplicitValues([locked], undefined, { courseId: 'cli' })).toEqual({ courseId: 'dflt' });
  });

  it('the client value must coerce: a raw string and a parsed number both work, garbage falls through', () => {
    expect(resolveImplicitValues([level], undefined, { level: '3' })).toEqual({ level: 3 });
    expect(resolveImplicitValues([level], undefined, { level: 3 })).toEqual({ level: 3 });
    expect(resolveImplicitValues([level], undefined, { level: 'abc' })).toEqual({});
  });

  it('falls back to the default; no value at all leaves the key absent', () => {
    expect(resolveImplicitValues([course], undefined, {})).toEqual({ courseId: 'dflt' });
    expect(resolveImplicitValues([level], undefined, {})).toEqual({});
  });

  it('a section value of the wrong type falls through to the next source', () => {
    expect(resolveImplicitValues([level], { level: 'abc' }, { level: '4' })).toEqual({ level: 4 });
    const withDefault = f('implicit', { key: 'level', valueType: 'number', defaultValue: 2 });
    expect(resolveImplicitValues([withDefault], { level: 'abc' }, {})).toEqual({ level: 2 });
  });

  it('R1: an AHV-keyed implicit field resolves to no value from any source', () => {
    const ssn = f('implicit', { key: 'ssnId', valueType: 'text', fromLink: true, defaultValue: '7561234567897' });
    expect(resolveImplicitValues([ssn], undefined, { ssnId: '7561234567897' })).toEqual({});
    expect(resolveImplicitValues([ssn], { ssnId: '7561234567897' }, { ssnId: '7561234567897' })).toEqual({});
    expect(resolveImplicitValues([ssn], {}, {})).toEqual({});
    // the same key on a type 'ssn' field is not implicit at all
    expect(resolveImplicitValues([f('ssn', { key: 'ssnId' })], { ssnId: 'x' }, {})).toEqual({});
  });

  it('a client boolean accepts the link spellings 1 / 0 / true / false', () => {
    const flag = f('implicit', { key: 'flag', valueType: 'boolean', fromLink: true });
    expect(resolveImplicitValues([flag], undefined, { flag: '1' })).toEqual({ flag: true });
    expect(resolveImplicitValues([flag], undefined, { flag: '0' })).toEqual({ flag: false });
    expect(resolveImplicitValues([flag], undefined, { flag: 'true' })).toEqual({ flag: true });
    expect(resolveImplicitValues([flag], undefined, { flag: true })).toEqual({ flag: true });
    expect(resolveImplicitValues([flag], undefined, { flag: 'yes' })).toEqual({});
  });

  it('an empty section value counts as no value and falls through', () => {
    expect(resolveImplicitValues([course], { courseId: '' }, { courseId: 'cli' })).toEqual({ courseId: 'cli' });
    expect(resolveImplicitValues([course], { courseId: '' }, {})).toEqual({ courseId: 'dflt' });
  });

  it('ignores non-implicit fields and garbage', () => {
    expect(resolveImplicitValues([f('text', { key: 'name' })], { name: 'x' }, { name: 'y' })).toEqual({});
    expect(resolveImplicitValues(undefined as unknown as Field[], undefined, {})).toEqual({});
  });
});

describe('isPrefillable', () => {
  it('is true for ordinary input fields', () => {
    for (const type of ['text', 'email', 'phone', 'date', 'number', 'dropdown', 'radio', 'checkbox', 'category', 'time', 'rating'] as const) {
      expect(isPrefillable(f(type))).toBe(true);
    }
  });

  it('is false for excluded types, display elements and AHV fields (R1)', () => {
    for (const type of PREFILL_EXCLUDED_TYPES) expect(isPrefillable(f(type as Field['type']))).toBe(false);
    expect(isPrefillable(f('text', { key: 'ssnId' }))).toBe(false);
  });

  it('is false for the course choice (a link never pre-selects a course)', () => {
    expect(isPrefillable(f('course', { key: 'courseKey' }))).toBe(false);
  });

  it('is true for an implicit field only with fromLink', () => {
    expect(isPrefillable(f('implicit', { valueType: 'text' }))).toBe(false);
    expect(isPrefillable(f('implicit', { valueType: 'text', fromLink: false }))).toBe(false);
    expect(isPrefillable(f('implicit', { valueType: 'text', fromLink: true }))).toBe(true);
    expect(isPrefillable(f('implicit', { valueType: 'text', fromLink: true, key: 'ssnId' }))).toBe(false);
  });
});

describe('isSectionOnlyImplicit', () => {
  const implicit = (extra: Record<string, unknown> = {}): Field => f('implicit', { key: 'courseId', valueType: 'text', ...extra });

  it('an implicit field without default and without fromLink gets its value only from the page', () => {
    expect(isSectionOnlyImplicit(implicit())).toBe(true);
    expect(isSectionOnlyImplicit(implicit({ defaultValue: '' }))).toBe(true);
    expect(isSectionOnlyImplicit(implicit({ defaultValue: null }))).toBe(true);
    expect(isSectionOnlyImplicit(implicit({ fromLink: false }))).toBe(true);
  });

  it('a default (also false and 0) or fromLink can supply the value', () => {
    expect(isSectionOnlyImplicit(implicit({ defaultValue: 'c1' }))).toBe(false);
    expect(isSectionOnlyImplicit(implicit({ valueType: 'boolean', defaultValue: false }))).toBe(false);
    expect(isSectionOnlyImplicit(implicit({ valueType: 'number', defaultValue: 0 }))).toBe(false);
    expect(isSectionOnlyImplicit(implicit({ fromLink: true }))).toBe(false);
  });

  it('is false for other field types, and for an AHV field (no source ever supplies it, R1)', () => {
    expect(isSectionOnlyImplicit(f('text'))).toBe(false);
    expect(isSectionOnlyImplicit(implicit({ key: 'ssnId' }))).toBe(false);
    expect(isSectionOnlyImplicit(undefined as unknown as Field)).toBe(false);
  });
});

describe('requiresSection', () => {
  it('is true when one implicit field can only get its value from the page', () => {
    expect(requiresSection([f('text'), f('implicit', { key: 'courseId', valueType: 'text' })])).toBe(true);
  });

  it('is false without such a field, and for a legacy form without fields', () => {
    expect(requiresSection([f('text'), f('implicit', { key: 'courseId', valueType: 'text', defaultValue: 'c1' })])).toBe(false);
    expect(requiresSection(undefined)).toBe(false);
    expect(requiresSection([])).toBe(false);
  });
});
