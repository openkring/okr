import { describe, expect, it } from 'vitest';

import type { DerivedValue, Field, VisibilityRule } from '@okr/shared-models';

import { buildSubmissionRows, buildSubmissionTaskNotes, prepareSubmission } from './submission-pipeline';

const TODAY = '20261102';

function f(id: string, type: string, order: number, extra: Record<string, unknown> = {}): Field {
  return { id, key: id, label: `L-${id}`, type, required: false, width: 'full', order, ...extra } as unknown as Field;
}

const rule = (fieldId: string, op: string, value?: unknown): VisibilityRule =>
  ({ match: 'all', conditions: [{ fieldId, op, value }] }) as unknown as VisibilityRule;

describe('prepareSubmission', () => {
  it('accepts an empty required field that is hidden by a rule', () => {
    const fields = [
      f('wantsMore', 'checkbox', 0),
      f('detail', 'text', 1, { required: true, visibleIf: rule('wantsMore', 'isChecked') }),
    ];
    const r = prepareSubmission(fields, undefined, undefined, { wantsMore: false }, TODAY);
    expect(r.missingRequired).toEqual([]);
  });

  it('rejects an empty required field that is visible', () => {
    const fields = [f('firstName', 'text', 0, { required: true })];
    const r = prepareSubmission(fields, undefined, undefined, { firstName: '' }, TODAY);
    expect(r.missingRequired).toEqual(['firstName']);
  });

  it('strips the value of a hidden field', () => {
    const fields = [
      f('wantsMore', 'checkbox', 0),
      f('detail', 'text', 1, { visibleIf: rule('wantsMore', 'isChecked') }),
    ];
    const r = prepareSubmission(fields, undefined, undefined, { wantsMore: false, detail: 'secret' }, TODAY);
    expect(r.values).toEqual({ wantsMore: false });
  });

  it('drops keys that are not a field of the definition', () => {
    const fields = [f('firstName', 'text', 0)];
    const raw = { personKey: 'x', reviewer: {}, applicationFor: 'course', firstName: 'A', website: 'bot', _jsToken: 't' };
    const r = prepareSubmission(fields, undefined, undefined, raw, TODAY);
    expect(r.values).toEqual({ firstName: 'A' });
  });

  it('never stores display fields', () => {
    const fields = [f('intro', 'paragraph', 0), f('line', 'divider', 1), f('firstName', 'text', 2)];
    const r = prepareSubmission(fields, undefined, undefined, { intro: 'x', line: 'y', firstName: 'A' }, TODAY);
    expect(r.values).toEqual({ firstName: 'A' });
  });

  it('keeps uploaded file references', () => {
    const fields = [f('doc', 'file', 0)];
    const r = prepareSubmission(fields, undefined, undefined, { doc: ['files/a.pdf'] }, TODAY);
    expect(r.values).toEqual({ doc: ['files/a.pdf'] });
  });

  it('derived value overrides the client value', () => {
    const fields = [f('dob', 'date', 0), f('applicationAs', 'text', 1)];
    const derived: DerivedValue[] = [
      { key: 'applicationAs', cases: [{ when: rule('dob', 'ageLt', 18), value: 'youth' }], otherwise: 'adult' },
    ];
    const r = prepareSubmission(fields, derived, undefined, { dob: '20110301', applicationAs: 'transfer' }, TODAY);
    expect(r.values['applicationAs']).toBe('youth');
  });

  it('builds typed properties and moves the field out of the top level', () => {
    const fields = [f('firstName', 'text', 0), f('rowingExperience', 'checkbox', 1, { asProperty: true })];
    const r = prepareSubmission(fields, undefined, 'properties', { firstName: 'A', rowingExperience: 'true' }, TODAY);
    expect(r.values).toEqual({
      firstName: 'A',
      properties: [{ key: 'rowingExperience', type: 'boolean', value: true, label: 'L-rowingExperience' }],
    });
    expect(r.invalidProperties).toEqual([]);
  });

  it('stores an unanswered single checkbox property as false', () => {
    const fields = [f('rowingExperience', 'checkbox', 0, { asProperty: true })];
    const r = prepareSubmission(fields, undefined, 'properties', {}, TODAY);
    expect(r.values['properties']).toEqual([
      { key: 'rowingExperience', type: 'boolean', value: false, label: 'L-rowingExperience' },
    ]);
  });

  it('stores an unanswered single checkbox as false at the top level', () => {
    const r = prepareSubmission([f('agb', 'checkbox', 0)], undefined, undefined, {}, TODAY);
    expect(r.values).toEqual({ agb: false });
  });

  it('does not store a property of a hidden field', () => {
    const fields = [
      f('wantsMore', 'checkbox', 0),
      f('years', 'number', 1, { asProperty: true, visibleIf: rule('wantsMore', 'isChecked') }),
    ];
    const r = prepareSubmission(fields, undefined, 'properties', { wantsMore: false, years: '5' }, TODAY);
    expect(r.values['properties']).toEqual([]);
    expect(r.invalidProperties).toEqual([]);
  });

  it('reports a property answer that does not coerce', () => {
    const fields = [f('years', 'number', 0, { asProperty: true })];
    const r = prepareSubmission(fields, undefined, 'properties', { years: 'abc' }, TODAY);
    expect(r.invalidProperties).toEqual(['years']);
  });

  it('does not flag an invalid number that is not a property', () => {
    const r = prepareSubmission([f('years', 'number', 0)], undefined, 'properties', { years: 'abc' }, TODAY);
    expect(r.invalidProperties).toEqual([]);
  });

  it('keeps an asProperty field top-level without a propertiesField', () => {
    const fields = [f('rowingExperience', 'checkbox', 0, { asProperty: true })];
    const r = prepareSubmission(fields, undefined, undefined, { rowingExperience: 'true' }, TODAY);
    expect(r.values).toEqual({ rowingExperience: 'true' });
  });

  it('a client-sent properties key cannot survive', () => {
    const r = prepareSubmission([f('firstName', 'text', 0)], undefined, 'properties', { firstName: 'A', properties: [{ key: 'x' }] }, TODAY);
    expect(r.values['properties']).toEqual([]);
  });

  it('handles a legacy definition (no visibleIf, no derived)', () => {
    const fields = [f('firstName', 'text', 0, { required: true }), f('email', 'email', 1)];
    const raw = { firstName: 'A', email: 'a@b.ch', junk: 1 };
    const r = prepareSubmission(fields, undefined, undefined, raw, TODAY);
    expect(r.values).toEqual({ firstName: 'A', email: 'a@b.ch' });
    expect(r.missingRequired).toEqual([]);
  });

  it('stores a number property as a number', () => {
    const fields = [f('years', 'number', 0, { asProperty: true })];
    const r = prepareSubmission(fields, undefined, 'properties', { years: '20' }, TODAY);
    expect(r.values['properties']).toEqual([{ key: 'years', type: 'number', value: 20, label: 'L-years' }]);
  });

  it('puts a derived asProperty value into properties, not at the top level', () => {
    const fields = [f('dob', 'date', 0)];
    const derived: DerivedValue[] = [
      { key: 'ageGroup', cases: [{ when: rule('dob', 'ageLt', 18), value: 'youth' }], otherwise: 'adult', asProperty: true, type: 'text' },
    ];
    const r = prepareSubmission(fields, derived, 'properties', { dob: '20110301' }, TODAY);
    expect(r.values['ageGroup']).toBeUndefined();
    expect(r.values['properties']).toEqual([{ key: 'ageGroup', type: 'text', value: 'youth', label: 'ageGroup' }]);
  });

  it('treats a derived asProperty value without a type as text, never top-level', () => {
    const derived: DerivedValue[] = [{ key: 'flag', cases: [], otherwise: 'x', asProperty: true }];
    const r = prepareSubmission([], derived, 'properties', {}, TODAY);
    expect(r.values['flag']).toBeUndefined();
    expect(r.values['properties']).toEqual([{ key: 'flag', type: 'text', value: 'x', label: 'flag' }]);
  });

  it('keeps a derived asProperty value top-level when the mapping has no properties list', () => {
    const derived: DerivedValue[] = [{ key: 'flag', cases: [], otherwise: 'x', asProperty: true, type: 'text' }];
    const r = prepareSubmission([], derived, undefined, {}, TODAY);
    expect(r.values).toEqual({ flag: 'x' });
  });

  it('reports a derived property that does not coerce, without rejecting', () => {
    const derived: DerivedValue[] = [{ key: 'n', cases: [], otherwise: 'abc', asProperty: true, type: 'number' }];
    const r = prepareSubmission([], derived, 'properties', {}, TODAY);
    expect(r.droppedDerivedProperties).toEqual(['n']);
    expect(r.invalidProperties).toEqual([]);
    expect(r.values['properties']).toEqual([]);
  });

  it('lets a hidden controller feed derived values as empty', () => {
    const fields = [
      f('wantsMore', 'checkbox', 0),
      f('detail', 'text', 1, { visibleIf: rule('wantsMore', 'isChecked') }),
    ];
    const derived: DerivedValue[] = [
      { key: 'level', cases: [{ when: rule('detail', 'equals', 'pro'), value: 'pro' }], otherwise: 'basic' },
    ];
    const hidden = prepareSubmission(fields, derived, undefined, { wantsMore: false, detail: 'pro' }, TODAY);
    expect(hidden.values['level']).toBe('basic');
    const shown = prepareSubmission(fields, derived, undefined, { wantsMore: true, detail: 'pro' }, TODAY);
    expect(shown.values['level']).toBe('pro');
  });
});

describe('prepareSubmission rows (notification e-mail)', () => {
  it('shows property answers, booleans as ja/nein, and derived values labelled by key', () => {
    const fields = [
      f('firstName', 'text', 0),
      f('rowingExperience', 'checkbox', 1, { asProperty: true }),
      f('canSwim', 'checkbox', 2, { asProperty: true }),
      f('years', 'number', 3, { asProperty: true }),
    ];
    const derived: DerivedValue[] = [{ key: 'applicationAs', cases: [], otherwise: 'youth' }];
    const r = prepareSubmission(fields, derived, 'properties', { firstName: 'A', rowingExperience: 'true', years: '5' }, TODAY);
    expect(r.rows).toEqual([
      { label: 'L-firstName', value: 'A' },
      { label: 'L-rowingExperience', value: 'ja' },
      { label: 'L-canSwim', value: 'nein' },
      { label: 'L-years', value: '5' },
      { label: 'applicationAs', value: 'youth' },
    ]);
  });

  it('omits hidden and display fields, shows a dash for an empty visible answer', () => {
    const fields = [
      f('intro', 'paragraph', 0),
      f('wantsMore', 'checkbox', 1),
      f('detail', 'text', 2, { visibleIf: rule('wantsMore', 'isChecked') }),
      f('nickname', 'text', 3),
    ];
    const r = prepareSubmission(fields, undefined, undefined, { wantsMore: false, detail: 'x' }, TODAY);
    expect(r.rows).toEqual([
      { label: 'L-wantsMore', value: 'nein' },
      { label: 'L-nickname', value: '–' },
    ]);
  });

  it('joins multi-select answers', () => {
    const fields = [f('boats', 'checkbox', 0, { options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] })];
    const r = prepareSubmission(fields, undefined, undefined, { boats: ['a', 'b'] }, TODAY);
    expect(r.rows).toEqual([{ label: 'L-boats', value: 'a, b' }]);
  });
});

describe('AHV numbers (ssn fields) — privacy 1.19', () => {
  const AHV = '756.1234.5678.97';
  const AHV_DIGITS = '7561234567897';
  const scsLike = () => [
    f('lastName', 'text', 0, { required: true }),
    f('dateOfBirth', 'date', 1, { required: true }),
    f('ssnId', 'ssn', 2, { required: true, visibleIf: rule('dateOfBirth', 'ageLt', 20) }),
  ];

  it('stores a valid number in the electronic 13-digit format', () => {
    const r = prepareSubmission(scsLike(), undefined, undefined, { lastName: 'Muster', dateOfBirth: '20150101', ssnId: AHV }, TODAY);
    expect(r.invalidSsn).toEqual([]);
    expect(r.missingRequired).toEqual([]);
    expect(r.values['ssnId']).toBe(AHV_DIGITS);
  });

  it('rejects a number with a wrong check digit, naming the key only', () => {
    const r = prepareSubmission(scsLike(), undefined, undefined, { lastName: 'Muster', dateOfBirth: '20150101', ssnId: '756.1234.5678.98' }, TODAY);
    expect(r.invalidSsn).toEqual(['ssnId']);
    expect('ssnId' in r.values).toBe(false);
  });

  it('rejects a value that is not text', () => {
    const r = prepareSubmission(scsLike(), undefined, undefined, { lastName: 'M', dateOfBirth: '20150101', ssnId: { n: AHV } }, TODAY);
    expect(r.invalidSsn).toEqual(['ssnId']);
  });

  it('reads the bare mask scaffolding as empty: required and visible -> missing', () => {
    const r = prepareSubmission(scsLike(), undefined, undefined, { lastName: 'M', dateOfBirth: '20150101', ssnId: '756.' }, TODAY);
    expect(r.invalidSsn).toEqual([]);
    expect(r.missingRequired).toEqual(['ssnId']);
  });

  it('hidden means absent: a hidden ssn field is neither required, nor validated, nor stored', () => {
    const r = prepareSubmission(scsLike(), undefined, undefined, { lastName: 'M', dateOfBirth: '19800101', ssnId: 'garbage' }, TODAY);
    expect(r.invalidSsn).toEqual([]);
    expect(r.missingRequired).toEqual([]);
    expect('ssnId' in r.values).toBe(false);
  });

  it('never becomes a typed property, even when the definition says asProperty', () => {
    const fields = [f('ssnId', 'ssn', 0, { asProperty: true })];
    const r = prepareSubmission(fields, undefined, 'properties', { ssnId: AHV }, TODAY);
    expect(r.values['ssnId']).toBe(AHV_DIGITS);
    expect(r.values['properties']).toEqual([]);
  });

  it('the e-mail rows show «angegeben» / «–», never the number', () => {
    const r = prepareSubmission(scsLike(), undefined, undefined, { lastName: 'Muster', dateOfBirth: '20150101', ssnId: AHV }, TODAY);
    expect(r.rows).toEqual([
      { label: 'L-lastName', value: 'Muster' },
      { label: 'L-dateOfBirth', value: '20150101' },
      { label: 'L-ssnId', value: 'angegeben' },
    ]);
    expect(JSON.stringify(r.rows)).not.toContain('5678');

    const optional = [f('ssnId', 'ssn', 0)];
    expect(buildSubmissionRows(optional, { ssnId: '' }, {})).toEqual([{ label: 'L-ssnId', value: '–' }]);
    expect(buildSubmissionRows(optional, {}, {})).toEqual([{ label: 'L-ssnId', value: '–' }]);
    expect(buildSubmissionRows(optional, { ssnId: AHV_DIGITS }, {})).toEqual([{ label: 'L-ssnId', value: 'angegeben' }]);
  });

  it('the approval task note carries the answers without the AHV number', () => {
    const notes = buildSubmissionTaskNotes(scsLike(), 'sub1', 'mitgliedschaft-beantragen', { lastName: 'Muster', ssnId: AHV_DIGITS, applicationAs: 'youth' });
    expect(JSON.parse(notes)).toEqual({
      submissionId: 'sub1', formKey: 'mitgliedschaft-beantragen', values: { lastName: 'Muster', applicationAs: 'youth' },
    });
    expect(notes).not.toContain(AHV_DIGITS);
  });

  it('the task note is unchanged for a form without an ssn field', () => {
    const notes = buildSubmissionTaskNotes([f('lastName', 'text', 0)], 's', 'k', { lastName: 'Muster' });
    expect(JSON.parse(notes)).toEqual({ submissionId: 's', formKey: 'k', values: { lastName: 'Muster' } });
  });
});
