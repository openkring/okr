import { describe, expect, it } from 'vitest';

import type { DerivedValue, Field, VisibilityRule } from '@okr/shared-models';

import { prepareSubmission } from './submission-pipeline';

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
});
