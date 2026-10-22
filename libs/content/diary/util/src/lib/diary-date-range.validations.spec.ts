import { describe, expect, it } from 'vitest';
import { diaryDateRangeValidations } from './diary-date-range.validations';

describe('diaryDateRangeValidations', () => {
  it('accepts no range', () => expect(diaryDateRangeValidations({ from: '', to: '' }).isValid()).toBe(true));
  it('accepts a range', () => expect(diaryDateRangeValidations({ from: '20261001', to: '20261020' }).isValid()).toBe(true));
  it('rejects from after to', () =>
    expect(diaryDateRangeValidations({ from: '20261020', to: '20261001' }).hasErrors('to')).toBe(true));
  it('accepts an open end', () => expect(diaryDateRangeValidations({ from: '20261001', to: '' }).isValid()).toBe(true));
});
