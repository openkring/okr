import { describe, it, expect } from 'vitest';
import { PERSON_NEW_FORM_SHAPE } from './person-new-form.model';
import { mergeDirectoryResultIntoForm, PersonDirectoryResult } from './person-directory.model';

const RESULT: PersonDirectoryResult = {
  firstName: 'John', lastName: 'Meier',
  streetName: 'Marienfeldstrasse', streetNumber: '92',
  zipCode: '8252', city: 'Schlatt', countryCode: 'CH',
  phone: '+41526544230', email: 'john@example.ch', web: 'https://meier.ch',
  occupation: 'Architekt',
};

describe('mergeDirectoryResultIntoForm', () => {
  it('fills empty address/contact fields', () => {
    const vm = { ...PERSON_NEW_FORM_SHAPE, notes: '' };
    const out = mergeDirectoryResultIntoForm(vm, RESULT);
    expect(out.streetName).toBe('Marienfeldstrasse');
    expect(out.streetNumber).toBe('92');
    expect(out.zipCode).toBe('8252');
    expect(out.city).toBe('Schlatt');
    expect(out.countryCode).toBe('CH');
    expect(out.phone).toBe('+41526544230');
    expect(out.email).toBe('john@example.ch');
    expect(out.web).toBe('https://meier.ch');
    expect(out.notes).toBe('Architekt');
  });

  it('result values win over existing input; occupation appends to notes without replacing', () => {
    const vm = { ...PERSON_NEW_FORM_SHAPE, city: 'Existing', notes: 'my note' };
    const out = mergeDirectoryResultIntoForm(vm, RESULT);
    expect(out.city).toBe('Schlatt'); // result value wins when present (mirrors onZefixSelected `d.x || vm.x`)
    expect(out.notes).toBe('my note\nArchitekt'); // occupation appended, not replaced
  });

  it('keeps existing values when the result field is empty', () => {
    const sparse: PersonDirectoryResult = { ...RESULT, email: '', web: '', occupation: '' };
    const vm = { ...PERSON_NEW_FORM_SHAPE, email: 'keep@me.ch', notes: 'keep' };
    const out = mergeDirectoryResultIntoForm(vm, sparse);
    expect(out.email).toBe('keep@me.ch');
    expect(out.notes).toBe('keep'); // empty occupation → notes unchanged
  });
});
