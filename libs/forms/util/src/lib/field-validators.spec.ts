import { describe, expect, it } from 'vitest';
import { FormControl } from '@angular/forms';
import { CheckboxField, Field } from '@okr/shared-models';
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
