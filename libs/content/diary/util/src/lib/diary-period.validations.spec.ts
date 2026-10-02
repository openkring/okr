import { describe, expect, it } from 'vitest';
import { diaryPeriodValidations } from './diary-period.validations';

describe('diaryPeriodValidations', () => {
  it('accepts no period', () => expect(diaryPeriodValidations({ travelFrom: '', travelTo: '' }).isValid()).toBe(true));
  it('accepts a period', () => expect(diaryPeriodValidations({ travelFrom: '20261001', travelTo: '20261020' }).isValid()).toBe(true));
  it('rejects from after to', () =>
    expect(diaryPeriodValidations({ travelFrom: '20261020', travelTo: '20261001' }).hasErrors('travelTo')).toBe(true));
  it('accepts an open end', () => expect(diaryPeriodValidations({ travelFrom: '20261001', travelTo: '' }).isValid()).toBe(true));
});
