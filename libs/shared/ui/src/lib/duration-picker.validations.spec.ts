import { describe, expect, it } from 'vitest';

import { durationPickerValidations } from './duration-picker.validations';

describe('durationPickerValidations', () => {
  it('passes for a valid date range', () => {
    const result = durationPickerValidations({ from: '2026-06-17', to: '2026-06-24' });
    expect(result.isValid()).toBe(true);
  });

  it('passes when from equals to', () => {
    const result = durationPickerValidations({ from: '2026-06-24', to: '2026-06-24' });
    expect(result.isValid()).toBe(true);
  });

  it('fails when to is before from', () => {
    const result = durationPickerValidations({ from: '2026-06-24', to: '2026-06-17' });
    expect(result.isValid()).toBe(false);
    expect(result.getErrors('to')).toContain('@validation.duration.toBeforeFrom');
  });

  it('fails when from is blank', () => {
    const result = durationPickerValidations({ from: '', to: '2026-06-24' });
    expect(result.isValid()).toBe(false);
    expect(result.getErrors('from')).toContain('@validation.duration.fromRequired');
  });

  it('compares datetime values chronologically', () => {
    const valid = durationPickerValidations({ from: '2026-06-24T08:00:00', to: '2026-06-24T18:00:00' });
    expect(valid.isValid()).toBe(true);
    const invalid = durationPickerValidations({ from: '2026-06-24T18:00:00', to: '2026-06-24T08:00:00' });
    expect(invalid.isValid()).toBe(false);
  });
});
