import { describe, expect, it } from 'vitest';
import { FormControl } from '@angular/forms';
import { CheckboxField, Field, SsnField } from '@okr/shared-models';
import { validatorsFor } from './field-validators';

const base = { id: '1', key: 'consent', label: 'Einwilligung', required: true, width: 'full' as const, order: 1 };

function validate(field: Field, value: unknown): boolean {
  const control = new FormControl(value, validatorsFor(field));
  return control.valid;
}

describe('validatorsFor — required checkbox', () => {
  const consent: CheckboxField = { ...base, type: 'checkbox' };

  // C5 §4: the consent box on the prospect signup. `Validators.required` would accept `false`
  // (it only rejects null/undefined/empty string/empty array), letting an unticked box through
  // to a server that refuses it — a submit button that fails for no visible reason.
  it('refuses an unticked single checkbox', () => {
    expect(validate(consent, false)).toBe(false);
    expect(validate(consent, true)).toBe(true);
  });

  it('keeps "at least one" semantics for an option list', () => {
    const options: CheckboxField = { ...base, type: 'checkbox', options: [{ label: 'A', value: 'a' }] };
    expect(validate(options, [])).toBe(false);
    expect(validate(options, ['a'])).toBe(true);
  });

  it('leaves an optional checkbox alone', () => {
    expect(validate({ ...consent, required: false }, false)).toBe(true);
  });
});

describe('validatorsFor — AHV number (ssn)', () => {
  const ssn: SsnField = { ...base, key: 'ssnId', label: 'AHV-Nummer', type: 'ssn' };

  it('accepts a valid number in either notation', () => {
    expect(validate(ssn, '756.1234.5678.97')).toBe(true);
    expect(validate(ssn, '7560803581661')).toBe(true);
  });

  it('accepts a valid number whose check digit is 0', () => {
    expect(validate(ssn, '756.0000.0000.40')).toBe(true);
  });

  it('refuses a wrong check digit, an incomplete number and another country code', () => {
    expect(validate(ssn, '756.1234.5678.98')).toBe(false);
    expect(validate(ssn, '756.1234.5678.9')).toBe(false);
    expect(validate(ssn, '123.1234.5678.97')).toBe(false);
  });

  it('a required field reads the bare mask scaffolding as empty', () => {
    expect(validate(ssn, '756.')).toBe(false);
    expect(validate(ssn, '')).toBe(false);
  });

  it('an optional field may stay empty, also with the mask scaffolding', () => {
    const optional = { ...ssn, required: false };
    expect(validate(optional, '')).toBe(true);
    expect(validate(optional, '756.')).toBe(true);
    expect(validate(optional, '756.1234')).toBe(false);
  });
});
