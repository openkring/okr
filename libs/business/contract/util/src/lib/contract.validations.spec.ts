import { describe, expect, it } from 'vitest';
import { contractNoticeValidations } from './contract.validations';

describe('contractNoticeValidations', () => {
  it('accepts a date and who gave notice', () => {
    expect(contractNoticeValidations({ noticeGivenDate: '20261002', noticeGivenBy: 'us' }).isValid()).toBe(true);
  });
  it('requires the date', () => {
    const r = contractNoticeValidations({ noticeGivenDate: '', noticeGivenBy: 'them' });
    expect(r.isValid()).toBe(false);
    expect(r.getErrors('noticeGivenDate').length).toBeGreaterThan(0);
  });
  it('requires us or them', () => {
    const r = contractNoticeValidations({ noticeGivenDate: '20261002', noticeGivenBy: '' });
    expect(r.getErrors('noticeGivenBy').length).toBeGreaterThan(0);
  });
});
