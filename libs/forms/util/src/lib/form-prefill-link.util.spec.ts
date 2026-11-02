import { describe, expect, it } from 'vitest';

import { Field } from '@okr/shared-models';

import { buildPrefillQuery, canAllowOther, firstEmailField, FORM_MESSAGE_MAX_LENGTH, isTypedChoiceKey } from './form-prefill-link.util';

let n = 0;
const f = (type: Field['type'], key: string, extra: Record<string, unknown> = {}): Field =>
  ({ id: `id${++n}`, key, label: key, required: false, width: 'full', order: n, type, ...extra }) as Field;

const opts = [{ label: 'Skiff 1', value: 'skiff-1' }, { label: 'Skiff 2', value: 'skiff-2' }];

describe('FORM_MESSAGE_MAX_LENGTH', () => {
  it('is 2000', () => expect(FORM_MESSAGE_MAX_LENGTH).toBe(2000));
});

describe('buildPrefillQuery', () => {
  it('encodes the answers as query parameters named after the keys', () => {
    const fields = [f('radio', 'kurs', { options: opts }), f('dropdown', 'level', { options: [{ label: 'E', value: 'einsteiger' }] })];
    const { query } = buildPrefillQuery(fields, { kurs: 'skiff-1', level: 'einsteiger' });
    expect(query).toBe('kurs=skiff-1&level=einsteiger');
  });

  it('percent-encodes values', () => {
    const { query } = buildPrefillQuery([f('text', 'note')], { note: 'a b&c' });
    expect(new URLSearchParams(query).get('note')).toBe('a b&c');
    expect(query).not.toContain('&c');
  });

  it('skips empty values, unknown keys and values that would not survive the parser', () => {
    const fields = [f('text', 'a'), f('text', 'b'), f('radio', 'c', { options: opts }), f('number', 'd', { max: 5 })];
    const { query } = buildPrefillQuery(fields, { a: '', b: undefined, c: 'nope', d: 9, zzz: 'x' });
    expect(query).toBe('');
  });

  it('skips the types a link never fills', () => {
    const fields = [f('password', 'pw'), f('iban', 'bank'), f('file', 'doc'), f('signature', 'sig'), f('avatar', 'who'), f('label', 'l')];
    const values = { pw: 'x', bank: 'CH93', doc: 'x', sig: 'x', who: 'x', l: 'x' };
    expect(buildPrefillQuery(fields, values).query).toBe('');
  });

  it('never includes an AHV field (R1), by type or by the ssnId key', () => {
    const fields = [f('ssn', 'ssnId'), f('text', 'ssnId'), f('ssn', 'other'), f('text', 'ok')];
    const { query, hasPersonalData } = buildPrefillQuery(fields, { ssnId: '7561234567897', other: '7561234567897', ok: 'x' });
    expect(query).toBe('ok=x');
    expect(hasPersonalData).toBe(false);
  });

  it('R1: never includes an implicit AHV field, even with fromLink', () => {
    const fields = [f('implicit', 'ssnId', { valueType: 'text', fromLink: true })];
    expect(buildPrefillQuery(fields, { ssnId: '7561234567897' }).query).toBe('');
  });

  it('includes an implicit field only when it may be set by a link', () => {
    const fields = [f('implicit', 'courseId', { valueType: 'text' }), f('implicit', 'level', { valueType: 'text', fromLink: true })];
    expect(buildPrefillQuery(fields, { courseId: 'c1', level: 'l1' }).query).toBe('level=l1');
  });

  it('writes a ticked checkbox as true, a checkbox group as a comma list, a number and a date', () => {
    const fields = [
      f('checkbox', 'agb'), f('checkbox', 'boot', { options: opts }), f('number', 'age'), f('date', 'dateOfBirth'), f('checkbox', 'no'),
    ];
    const { query } = buildPrefillQuery(fields, { agb: true, boot: ['skiff-1', 'skiff-2'], age: 12, dateOfBirth: '20061231', no: false });
    const p = new URLSearchParams(query);
    expect(p.get('agb')).toBe('true');
    expect(p.get('boot')).toBe('skiff-1,skiff-2');
    expect(p.get('age')).toBe('12');
    expect(p.get('dateOfBirth')).toBe('20061231');
    expect(p.has('no')).toBe(false);
  });

  it('never carries the reserved «Andere» value', () => {
    expect(buildPrefillQuery([f('radio', 'kurs', { options: opts, allowOther: true })], { kurs: 'other' }).query).toBe('');
  });

  it('flags personal data for an e-mail, a phone, a date, a date of birth and a key ending in name', () => {
    expect(buildPrefillQuery([f('phone', 'tel')], { tel: '0791234567' }).hasPersonalData).toBe(true);
    expect(buildPrefillQuery([f('date', 'when')], { when: '20261130' }).hasPersonalData).toBe(true);
    expect(buildPrefillQuery([f('text', 'lastName')], { lastName: 'Muster' }).hasPersonalData).toBe(true);
    expect(buildPrefillQuery([f('text', 'surname')], { surname: 'Muster' }).hasPersonalData).toBe(true);
    expect(buildPrefillQuery([f('email', 'mail')], { mail: 'a@b.ch' }).hasPersonalData).toBe(true);
    expect(buildPrefillQuery([f('text', 'firstName')], { firstName: 'Ada' }).hasPersonalData).toBe(true);
    expect(buildPrefillQuery([f('date', 'dateOfBirth')], { dateOfBirth: '20061231' }).hasPersonalData).toBe(true);
  });

  it('flags nothing personal for only a radio', () => {
    const { query, hasPersonalData } = buildPrefillQuery([f('radio', 'kurs', { options: opts })], { kurs: 'skiff-1' });
    expect(query).toBe('kurs=skiff-1');
    expect(hasPersonalData).toBe(false);
  });

  it('is not personal when the personal field is left empty', () => {
    const fields = [f('email', 'mail'), f('radio', 'kurs', { options: opts })];
    expect(buildPrefillQuery(fields, { mail: '', kurs: 'skiff-2' }).hasPersonalData).toBe(false);
  });

  it('does not throw on missing input', () => {
    expect(buildPrefillQuery(undefined as unknown as Field[], undefined as unknown as Record<string, unknown>)).toEqual({ query: '', hasPersonalData: false });
  });
});

describe('isTypedChoiceKey', () => {
  it('is true for a template choice of the mapping', () => {
    expect(isTypedChoiceKey('applications.default', 'gender')).toBe(true);
    expect(isTypedChoiceKey('applications.default', 'applicationAs')).toBe(true);
    expect(isTypedChoiceKey('applications.course', 'gender')).toBe(true);
  });

  it('is false for a free key, a plain template field, an unknown mapping or none', () => {
    expect(isTypedChoiceKey('applications.default', 'prio')).toBe(false);
    expect(isTypedChoiceKey('applications.default', 'firstName')).toBe(false);
    expect(isTypedChoiceKey('nope', 'gender')).toBe(false);
    expect(isTypedChoiceKey(undefined, 'gender')).toBe(false);
    expect(isTypedChoiceKey('applications.junior', 'applicationAs')).toBe(false);
  });
});

describe('canAllowOther', () => {
  it('is true for dropdown, radio and checkbox with options', () => {
    expect(canAllowOther(f('dropdown', 'a', { options: opts }), undefined)).toBe(true);
    expect(canAllowOther(f('radio', 'a', { options: opts }), 'applications.default')).toBe(true);
    expect(canAllowOther(f('checkbox', 'a', { options: opts }), undefined)).toBe(true);
  });

  it('is false for a single checkbox, text, category, implicit and display elements', () => {
    expect(canAllowOther(f('checkbox', 'a'), undefined)).toBe(false);
    expect(canAllowOther(f('checkbox', 'a', { options: [] }), undefined)).toBe(false);
    for (const type of ['text', 'number', 'category', 'implicit', 'label', 'divider'] as const) {
      expect(canAllowOther(f(type, 'a', { options: opts }), undefined)).toBe(false);
    }
  });

  it('is false for an AHV field', () => {
    expect(canAllowOther(f('radio', 'ssnId', { options: opts }), undefined)).toBe(false);
  });

  it('is false for a field mapped onto a typed model field', () => {
    expect(canAllowOther(f('radio', 'gender', { options: opts }), 'applications.default')).toBe(false);
    expect(canAllowOther(f('radio', 'gender', { options: opts }), undefined)).toBe(true);
  });
});

describe('firstEmailField', () => {
  it('returns the first email field in form order', () => {
    const second = f('email', 'parentEmail', { order: 5 });
    const first = f('email', 'email', { order: 2 });
    expect(firstEmailField([f('text', 'x', { order: 1 }), second, first])).toBe(first);
  });

  it('is undefined without an email field, and never an AHV field', () => {
    expect(firstEmailField([f('text', 'email')])).toBeUndefined();
    expect(firstEmailField([f('email', 'ssnId')])).toBeUndefined();
    expect(firstEmailField(undefined as unknown as Field[])).toBeUndefined();
  });
});
